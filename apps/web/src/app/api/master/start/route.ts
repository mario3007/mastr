import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateDownloadUrl, generateUploadUrl } from '@/lib/storage/presigned';
import { checkAndDeductCredits } from '@/lib/billing/credits';
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

    const { fileKey, durationSeconds, preset = 'groove_soul' } = body;

    // 1. Validate fileKey
    if (!fileKey || typeof fileKey !== 'string') {
      return NextResponse.json(
        { error: 'fileKey is required and must be a valid string' },
        { status: 400 }
      );
    }

    // 2. Validate durationSeconds
    const duration = Number(durationSeconds);
    if (isNaN(duration) || duration <= 0) {
      return NextResponse.json(
        { error: 'durationSeconds must be a valid positive number' },
        { status: 400 }
      );
    }

    if (duration > 600) {
      return NextResponse.json(
        { error: 'Max limit exceeded. Track duration exceeds 10 minutes (600s).' },
        { status: 400 }
      );
    }

    // Determine required credits:
    // durationSeconds <= 360 (6 min) -> 1 Credit
    // durationSeconds > 360 && durationSeconds <= 600 -> 2 Credits
    const requiredCredits = duration <= 360 ? 1 : 2;

    // 3. User balance check & atomic deduction
    // Identify user from header or fallback to anonymous session
    const userId = req.headers.get('x-user-id') || 'anonymous_user';
    const creditResult = await checkAndDeductCredits(userId, requiredCredits);

    if (!creditResult.success) {
      return NextResponse.json(
        {
          error: creditResult.error || 'Insufficient credits',
          requiredCredits,
          remainingCredits: creditResult.remainingCredits,
        },
        { status: 402 }
      );
    }

    // 4. Generate Presigned URLs
    // - downloadUrl for the raw audio (fileKey)
    // - uploadUrl (PUT) for finished master
    const downloadUrl = await generateDownloadUrl(fileKey, 3600);
    const outputKey = `masters/${crypto.randomUUID()}.wav`;
    const uploadUrl = await generateUploadUrl(outputKey, 'audio/wav', 3600);

    // 5. Send Job to RunPod Serverless Endpoint
    const env = getEnv();
    const runpodEndpointId = process.env.RUNPOD_ENDPOINT_ID || env.RUNPOD_ENDPOINT_ID;
    const runpodApiKey = process.env.RUNPOD_API_KEY || env.RUNPOD_API_KEY;

    let jobId = `job_${crypto.randomUUID()}`;

    if (runpodEndpointId && runpodApiKey) {
      const runpodUrl = `https://api.runpod.ai/v2/${runpodEndpointId}/run`;
      const runpodRes = await fetch(runpodUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${runpodApiKey}`,
        },
        body: JSON.stringify({
          input: {
            download_url: downloadUrl,
            upload_url: uploadUrl,
            preset,
            duration: duration,
          },
        }),
      });

      if (!runpodRes.ok) {
        const errorText = await runpodRes.text().catch(() => '');
        console.error('RunPod Serverless Error:', runpodRes.status, errorText);
        return NextResponse.json(
          {
            error: `Failed to queue job with RunPod (${runpodRes.status})`,
            details: errorText,
          },
          { status: 502 }
        );
      }

      const runpodData = await runpodRes.json();
      if (runpodData.id) {
        jobId = runpodData.id;
      }
    } else {
      console.warn(
        '[RunPod Pipeline] RUNPOD_ENDPOINT_ID or RUNPOD_API_KEY not configured. Running in sandbox / development mock mode.'
      );
    }

    // Record job metadata in memory store
    jobStore.set(jobId, {
      jobId,
      fileKey,
      outputKey,
      preset,
      durationSeconds: duration,
      createdAt: Date.now(),
    });

    // 6. Return { jobId, outputKey }
    return NextResponse.json({
      jobId,
      outputKey,
    });
  } catch (err: any) {
    console.error('Error starting mastering job:', err);
    return NextResponse.json(
      {
        error: 'Failed to start mastering job',
        details: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
