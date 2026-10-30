import { NextRequest, NextResponse } from 'next/server';
import { getMasterDownloadUrl } from '@/lib/storage/presigned';
import { jobStore } from '@/lib/storage/jobStore';
import { getEnv } from '@/lib/config/env';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const paramOutputKey = searchParams.get('outputKey');

    // Check in-memory jobStore
    const jobRecord = jobStore.get(jobId);
    const outputKey =
      paramOutputKey ||
      jobRecord?.outputKey ||
      `masters/${jobId}/master.wav`;
    const targetRunPodId = jobRecord?.runpodJobId || jobId;

    const env = getEnv();
    const endpointId = process.env.RUNPOD_ENDPOINT_ID || env.RUNPOD_ENDPOINT_ID || 'j5xlp990dz5bwy';
    const apiKey = process.env.RUNPOD_API_KEY || env.RUNPOD_API_KEY;

    // If no API key configured (development/testing)
    if (!apiKey) {
      const downloadUrl = await getMasterDownloadUrl(outputKey, 3600);
      return NextResponse.json({
        status: 'COMPLETED',
        jobId,
        downloadUrl,
        output: {
          status: 'COMPLETED',
          preset: jobRecord?.preset || 'standard',
          message: 'Mastering completed (mock mode: RUNPOD_API_KEY not set).',
        },
      });
    }

    // Call RunPod Status API
    const runpodStatusUrl = `https://api.runpod.ai/v2/${endpointId}/status/${targetRunPodId}`;
    const res = await fetch(runpodStatusUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      console.error('RunPod Status Error:', res.status, errorText);
      return NextResponse.json(
        {
          error: `RunPod status query failed (${res.status})`,
          details: errorText,
        },
        { status: 502 }
      );
    }

    const data = await res.json();
    const status = data.status || 'IN_QUEUE';

    let downloadUrl: string | null = null;
    if (status === 'COMPLETED') {
      try {
        downloadUrl = await getMasterDownloadUrl(outputKey, 3600);
      } catch (err) {
        console.error('Error generating download URL for completed master:', err);
      }
    }

    return NextResponse.json({
      status,
      jobId,
      runpodJobId: data.id || targetRunPodId,
      downloadUrl,
      output: data.output || null,
      error: data.error || null,
      executionTime: data.executionTime || null,
    });
  } catch (err: any) {
    console.error('Error in status route:', err);
    return NextResponse.json(
      {
        error: 'Failed to retrieve job status',
        details: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
