import { NextRequest, NextResponse } from 'next/server';
import { generateDownloadUrl } from '@/lib/storage/presigned';
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

    // Retrieve from jobStore if previously saved
    const jobRecord = jobStore.get(jobId);
    let outputKey = paramOutputKey || jobRecord?.outputKey || '';

    const env = getEnv();
    const runpodEndpointId = process.env.RUNPOD_ENDPOINT_ID || env.RUNPOD_ENDPOINT_ID;
    const runpodApiKey = process.env.RUNPOD_API_KEY || env.RUNPOD_API_KEY;

    let status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' = 'IN_QUEUE';
    let runpodOutput: any = null;
    let error: string | null = null;
    let executionTime: number | null = null;

    if (runpodEndpointId && runpodApiKey) {
      const runpodUrl = `https://api.runpod.ai/v2/${runpodEndpointId}/status/${jobId}`;
      const res = await fetch(runpodUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${runpodApiKey}`,
        },
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error('RunPod Status Error:', res.status, errorText);
        return NextResponse.json(
          {
            error: `Failed to fetch RunPod status (${res.status})`,
            details: errorText,
          },
          { status: 502 }
        );
      }

      const runpodData = await res.json();
      status = runpodData.status || 'IN_QUEUE';
      runpodOutput = runpodData.output || null;
      error = runpodData.error || null;
      executionTime = runpodData.executionTime || null;

      // Check if RunPod output returned an output key or download info
      if (runpodOutput && typeof runpodOutput === 'object') {
        if (runpodOutput.output_key || runpodOutput.outputKey) {
          outputKey = runpodOutput.output_key || runpodOutput.outputKey;
        }
      }
    } else {
      // Mock / fallback status mode if no RunPod credentials set
      status = 'COMPLETED';
    }

    let downloadUrl: string | null = null;

    if (status === 'COMPLETED' && outputKey) {
      try {
        downloadUrl = await generateDownloadUrl(outputKey, 3600);
      } catch (err: any) {
        console.error('Error generating presigned download URL for completed master:', err);
      }
    }

    return NextResponse.json({
      jobId,
      status,
      outputKey: outputKey || null,
      downloadUrl,
      output: runpodOutput,
      error,
      executionTime,
    });
  } catch (err: any) {
    console.error('Error in RunPod status route:', err);
    return NextResponse.json(
      {
        error: 'Failed to retrieve job status',
        details: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
