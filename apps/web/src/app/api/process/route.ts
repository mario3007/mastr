import { NextRequest, NextResponse } from 'next/server';
import {
  generateWorkerUploadUrl,
  getMasterDownloadUrl,
} from '@/lib/storage/presigned';
import { jobStore } from '@/lib/storage/jobStore';
import { getEnv } from '@/lib/config/env';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { jobId, engine = 'ai', preset = 'standard', inputKey } = body;

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json(
        { error: 'jobId is required and must be a valid string' },
        { status: 400 }
      );
    }

    // Default input key to uploads/{jobId}/input.wav if not provided
    const resolvedInputKey =
      typeof inputKey === 'string' && inputKey.trim()
        ? inputKey.trim()
        : `uploads/${jobId}/input.wav`;

    // 1. Generate Presigned GET URL for input audio file
    const downloadUrl = await getMasterDownloadUrl(resolvedInputKey, 3600);

    // 2. Generate Presigned PUT URL for RunPod Worker output
    const { uploadUrl, key: outputKey } = await generateWorkerUploadUrl(
      jobId,
      'audio/wav',
      3600
    );

    // 3. Prepare RunPod request
    const env = getEnv();
    const endpointId = process.env.RUNPOD_ENDPOINT_ID || env.RUNPOD_ENDPOINT_ID || 'j5xlp990dz5bwy';
    const apiKey = process.env.RUNPOD_API_KEY || env.RUNPOD_API_KEY;

    // Resolve target preset for RunPod worker
    let resolvedPreset = typeof preset === 'string' && preset.trim() ? preset.trim() : 'standard';
    if (engine === 'ai' && !preset) {
      resolvedPreset = 'full';
    }

    const payload = {
      input: {
        download_url: downloadUrl,
        upload_url: uploadUrl,
        preset: resolvedPreset,
        engine: engine === 'classic' ? 'classic' : 'ai',
      },
    };

    // If no API key configured (local development / testing without live RunPod credentials)
    if (!apiKey) {
      console.warn(
        '[RunPod Pipeline] RUNPOD_API_KEY not configured. Simulating instant COMPLETED status for local testing.'
      );
      const masterDownloadUrl = await getMasterDownloadUrl(outputKey, 3600);

      jobStore.set(jobId, {
        jobId,
        runpodJobId: `mock_${jobId}`,
        fileKey: resolvedInputKey,
        outputKey,
        preset: payload.input.preset,
        status: 'COMPLETED',
        createdAt: Date.now(),
      });

      return NextResponse.json({
        status: 'COMPLETED',
        jobId,
        runpodJobId: `mock_${jobId}`,
        downloadUrl: masterDownloadUrl,
        output: {
          status: 'COMPLETED',
          preset: payload.input.preset,
          message: 'Mastering completed (mock mode: RUNPOD_API_KEY not set).',
        },
      });
    }

    // 4. Call RunPod Sync API
    const runpodSyncUrl = `https://api.runpod.ai/v2/${endpointId}/runsync`;
    const runpodRes = await fetch(runpodSyncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!runpodRes.ok) {
      const errorText = await runpodRes.text().catch(() => '');
      console.error('RunPod Serverless Error:', runpodRes.status, errorText);
      return NextResponse.json(
        {
          error: `RunPod API responded with HTTP ${runpodRes.status}`,
          details: errorText,
        },
        { status: 502 }
      );
    }

    const runpodData = await runpodRes.json();
    const runpodStatus = runpodData.status || 'IN_QUEUE';
    const runpodId = runpodData.id || jobId;

    // Cache metadata in jobStore
    jobStore.set(jobId, {
      jobId,
      runpodJobId: runpodId,
      fileKey: resolvedInputKey,
      outputKey,
      preset: payload.input.preset,
      status: runpodStatus,
      createdAt: Date.now(),
    });

    // Also store by runpodId for reverse lookup
    if (runpodId !== jobId) {
      jobStore.set(runpodId, {
        jobId,
        runpodJobId: runpodId,
        fileKey: resolvedInputKey,
        outputKey,
        preset: payload.input.preset,
        status: runpodStatus,
        createdAt: Date.now(),
      });
    }

    // 5. If COMPLETED synchronously, return success immediately with download URL
    if (runpodStatus === 'COMPLETED') {
      const masterDownloadUrl = await getMasterDownloadUrl(outputKey, 3600);
      return NextResponse.json({
        status: 'COMPLETED',
        jobId,
        runpodJobId: runpodId,
        downloadUrl: masterDownloadUrl,
        output: runpodData.output || {
          status: 'COMPLETED',
          preset: payload.input.preset,
          message: 'Mastering completed and uploaded successfully.',
        },
      });
    }

    // 6. Otherwise (IN_QUEUE or IN_PROGRESS), return status and jobId for polling
    return NextResponse.json({
      status: runpodStatus,
      jobId,
      runpodJobId: runpodId,
      outputKey,
    });
  } catch (err: any) {
    console.error('Error processing audio mastering job:', err);
    return NextResponse.json(
      {
        error: 'Failed to dispatch mastering process',
        details: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
