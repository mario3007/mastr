import { NextRequest, NextResponse } from 'next/server';
import type { MasteringJobRequest, MasteringJobResponse } from '@mastr/config';

export async function POST(req: NextRequest) {
  try {
    const body: MasteringJobRequest = await req.json();

    if (!body.mode || (body.mode !== 'easy' && body.mode !== 'pro')) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be "easy" or "pro".' },
        { status: 400 }
      );
    }

    const jobId = 'job_' + Math.random().toString(36).substring(2, 12);

    const workerUrl = process.env.WORKER_SERVICE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    try {
        const targetLufs =
          body.mode === 'pro' && body.proSettings?.lufsTarget
            ? body.proSettings.lufsTarget
            : body.easySettings?.preset === 'club_edm'
            ? -8.5
            : -14.0;

        console.log(`[API Proxy create-job] Forwarding request to worker: ${workerUrl}/api/v1/master/process`);
        const workerRes = await fetch(`${workerUrl}/api/v1/master/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            input_url: body.trackUrl,
            mode: body.mode,
            preset: body.easySettings?.preset,
            intensity: body.easySettings?.intensity,
            target_lufs: targetLufs,
            low_end_mono_cutoff: 100.0,
            tape_saturation:
              body.mode === 'pro'
                ? body.proSettings?.tapeDrive
                : body.easySettings?.intensity
                ? body.easySettings.intensity * 0.35
                : 25.0,
            stereo_width: body.mode === 'pro' ? body.proSettings?.stereoWidth : 50.0,
            low_end_punch: body.mode === 'pro' ? body.proSettings?.lowEndPunch : 50.0,
            vocal_clarity: body.mode === 'pro' ? body.proSettings?.vocalClarity : 50.0,
          }),
        });

        if (workerRes.ok) {
          const workerData = await workerRes.json();
          return NextResponse.json(
            {
              jobId: workerData.job_id || jobId,
              status: workerData.status || 'processing',
              progress: 10,
              createdAt: new Date().toISOString(),
            },
            { status: 201 }
          );
        } else {
          const errText = await workerRes.text().catch(() => '');
          console.error(`[API Proxy create-job] Worker responded with HTTP ${workerRes.status}:`, errText);
        }
      } catch (err) {
        console.error(`[API Proxy create-job] Failed to connect to worker (${workerUrl}):`, err);
      }

    const response: MasteringJobResponse = {
      jobId,
      status: 'queued',
      progress: 10,
      originalUrl: body.trackUrl || 'https://cdn.mastr.audio/demo-input.wav',
      masteredUrl: 'https://cdn.mastr.audio/demo-output.wav',
      metrics: {
        inputLufs: -19.4,
        outputLufs: body.mode === 'pro' && body.proSettings?.lufsTarget ? body.proSettings.lufsTarget : -14.0,
        dynamicRange: 8.4,
      },
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
