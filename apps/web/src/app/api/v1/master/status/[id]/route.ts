import { NextRequest, NextResponse } from 'next/server';
import type { MasteringJobResponse } from '@mastr/config';

interface Params {
  params: {
    id: string;
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const jobId = params.id;
  const workerUrl = process.env.WORKER_SERVICE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  try {
    const targetUrl = `${workerUrl}/api/v1/master/status/${jobId}`;
    const workerRes = await fetch(targetUrl, {
      cache: 'no-store',
    });
    if (workerRes.ok) {
      const workerData = await workerRes.json();
      return NextResponse.json({
        jobId: workerData.job_id || jobId,
        status: workerData.status,
        progress: workerData.progress,
        originalUrl: workerData.input_url || workerData.input_filename,
        masteredUrl: workerData.preview_url || workerData.final_download_url,
        preview_url: workerData.preview_url,
        final_download_url: workerData.final_download_url,
        metrics: workerData.metrics,
        error: workerData.error,
        createdAt: workerData.createdAt || new Date().toISOString(),
      });
    } else {
      console.error(`[API Proxy status] Worker returned status ${workerRes.status} for ${targetUrl}`);
    }
  } catch (err) {
    console.error(`[API Proxy status] Worker status fetch error from ${workerUrl}:`, err);
  }

  return NextResponse.json(
    {
      jobId,
      status: 'failed',
      error: 'Worker unreachable or job not found',
    },
    { status: 502 }
  );
}
