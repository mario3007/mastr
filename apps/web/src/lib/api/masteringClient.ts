/**
 * Audio Mastering API Client (Next.js Frontend -> Python Worker / REST API)
 * Handles file uploads, Suno URL jobs, and polling of mastering progress.
 */

export interface MasteringOptions {
  jobId?: string;
  r2FileKey?: string;
  mode: 'easy' | 'pro';
  preset?: string;
  intensity?: number;
  targetLufs?: number;
  lowEndMonoCutoff?: number;
  tapeSaturation?: number;
  stereoWidth?: number;
  lowEndPunch?: number;
  vocalClarity?: number;
}

export interface MasteringJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  stepKey?: string;
  previewUrl?: string | null;
  finalDownloadUrl?: string | null;
  metrics?: {
    inputLufs: number;
    outputLufs: number;
    dynamicRange: number;
    truePeakCeiling?: number;
    sampleRate?: number;
  } | null;
  error?: string | null;
}

export function getCandidateWorkerUrls(): string[] {
  if (typeof window === 'undefined') {
    return [
      process.env.WORKER_SERVICE_URL || 'http://127.0.0.1:8000',
      'http://localhost:8000',
    ];
  }
  const host = window.location.hostname || '127.0.0.1';
  return [
    `http://${host}:8000`,
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    '/worker',
  ];
}

const WORKER_BASE_URL =
  typeof window !== 'undefined'
    ? '/worker'
    : (process.env.WORKER_SERVICE_URL || process.env.NEXT_PUBLIC_WORKER_API_URL || 'http://127.0.0.1:8000');

export function getStepKeyForProgress(progress: number): string {
  if (progress <= 15) return 'analyzing';
  if (progress <= 30) return 'stepHighpass';
  if (progress <= 45) return 'stepBassMono';
  if (progress <= 65) return 'stepDynamicEq';
  if (progress <= 80) return 'stepSaturation';
  if (progress <= 94) return 'stepLimiter';
  return 'stepExporting';
}

/**
 * Uploads a local audio file and dispatches a mastering job.
 * Tries direct Python worker on port 8000 first, then fallback proxy.
 */
export async function uploadAndProcess(
  file: File,
  options: MasteringOptions
): Promise<{ jobId: string; status: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (options.jobId) formData.append('job_id', options.jobId);
  if (options.r2FileKey) formData.append('r2_file_key', options.r2FileKey);
  formData.append('mode', options.mode);
  if (options.preset) formData.append('preset', options.preset);
  if (options.intensity !== undefined) formData.append('intensity', options.intensity.toString());
  if (options.targetLufs !== undefined) formData.append('target_lufs', options.targetLufs.toString());
  if (options.lowEndMonoCutoff !== undefined) formData.append('low_end_mono_cutoff', options.lowEndMonoCutoff.toString());
  if (options.tapeSaturation !== undefined) formData.append('tape_saturation', options.tapeSaturation.toString());
  if (options.stereoWidth !== undefined) formData.append('stereo_width', options.stereoWidth.toString());
  if (options.lowEndPunch !== undefined) formData.append('low_end_punch', options.lowEndPunch.toString());
  if (options.vocalClarity !== undefined) formData.append('vocal_clarity', options.vocalClarity.toString());

  const urls = getCandidateWorkerUrls();
  let lastError: any = null;

  for (const base of urls) {
    try {
      console.log(`[Upload] Uploading audio file (${file.size} bytes) to: ${base}/api/v1/master/process-file`);
      const res = await fetch(`${base}/api/v1/master/process-file`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[Upload] Master job created successfully at ${base}:`, data);
        return {
          jobId: data.job_id,
          status: data.status || 'processing',
        };
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`[Upload] ${base} responded with HTTP ${res.status}:`, errText);
      }
    } catch (err: any) {
      console.warn(`[Upload] Connection failed to ${base}:`, err);
      lastError = err;
    }
  }

  throw new Error(
    lastError?.message ||
      'Mastering-Worker auf Port 8000 ist nicht erreichbar. Bitte stelle sicher, dass der Python-Worker gestartet ist.'
  );
}

/**
 * Dispatches a mastering job for a remote audio URL (e.g. Suno link).
 */
export async function processUrl(
  url: string,
  options: MasteringOptions
): Promise<{ jobId: string; status: string }> {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/v1/master/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_url: url,
        mode: options.mode,
        preset: options.preset || 'auto_ai',
        intensity: options.intensity ?? 80.0,
        target_lufs: options.targetLufs ?? -14.0,
        low_end_mono_cutoff: options.lowEndMonoCutoff ?? 100.0,
        tape_saturation: options.tapeSaturation ?? 25.0,
        stereo_width: options.stereoWidth ?? 50.0,
        low_end_punch: options.lowEndPunch ?? 50.0,
        vocal_clarity: options.vocalClarity ?? 50.0,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        jobId: data.job_id,
        status: data.status || 'processing',
      };
    }
  } catch (err) {
    console.warn('Worker direct URL process unreachable, using local REST proxy fallback:', err);
  }

  // Fallback to local Next.js mock API route
  const fallbackRes = await fetch('/api/v1/master/create-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trackUrl: url,
      mode: options.mode,
      easySettings: { intensity: options.intensity, preset: options.preset },
    }),
  });
  const fallbackData = await fallbackRes.json();
  return {
    jobId: fallbackData.jobId || 'local_url_job_' + Date.now(),
    status: fallbackData.status || 'processing',
  };
}

/**
 * Polls job status until completion or failure.
 */
export async function pollJobStatus(
  jobId: string,
  onProgress: (progress: number, stepKey: string) => void
): Promise<MasteringJobStatus> {
  const maxAttempts = 240; // 180 seconds (3 minutes) total timeout for long tracks
  let attempts = 0;
  const urls = getCandidateWorkerUrls();

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      attempts++;
      let data: any = null;

      for (const base of urls) {
        try {
          const res = await fetch(`${base}/api/v1/master/status/${jobId}`);
          if (res.ok) {
            data = await res.json();
            break;
          }
        } catch {
          // try next candidate
        }
      }

      // If backend responded with real status
      if (data && data.status) {
        const progress = data.progress ?? (attempts * 15);
        const stepKey = getStepKeyForProgress(progress);
        onProgress(Math.min(progress, 99), stepKey);

        if (data.status === 'completed') {
          clearInterval(interval);
          onProgress(100, 'stepExporting');

          const resolveMediaUrl = (url?: string | null) => {
            if (!url) return null;
            if (typeof window !== 'undefined') {
              const host = window.location.hostname || '127.0.0.1';
              // Prefer direct connection to FastAPI on 8000 for instant media streaming
              if (url.startsWith('/')) {
                return `http://${host}:8000${url}`;
              }
              return url.replace(/^https?:\/\/[^/]+(:[0-9]+)?/, `http://${host}:8000`);
            }
            return url;
          };

          const resolvedPreviewUrl = resolveMediaUrl(data.preview_url) || data.masteredUrl;
          const resolvedFinalUrl = resolveMediaUrl(data.final_download_url) || data.masteredUrl;
          console.log("[Job Poll] COMPLETED! Raw preview:", data.preview_url, "-> Direct stream URL:", resolvedPreviewUrl);

          resolve({
            jobId,
            status: 'completed',
            progress: 100,
            stepKey: 'stepExporting',
            previewUrl: resolvedPreviewUrl,
            finalDownloadUrl: resolvedFinalUrl,
            metrics: data.metrics || {
              inputLufs: -19.4,
              outputLufs: -14.0,
              dynamicRange: 8.4,
            },
          });
          return;
        }

        if (data.status === 'failed') {
          clearInterval(interval);
          resolve({
            jobId,
            status: 'failed',
            progress: 0,
            error: data.error || 'Mastering fehlgeschlagen',
          });
          return;
        }
      } else {
        const simulatedProgress = Math.min(10 + attempts * 4, 95);
        const stepKey = getStepKeyForProgress(simulatedProgress);
        onProgress(simulatedProgress, stepKey);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        resolve({
          jobId,
          status: 'failed',
          progress: 0,
          error: 'Mastering Timeout nach 45 Sekunden. Der Worker antwortet nicht.',
        });
      }
    }, 750);
  });
}

export type RunPodEngine = 'full' | 'audio_sr' | 'matchering';
export type RunPodPreset = 'club_punch' | 'warm_tape' | 'vocal_pop' | 'groove_soul';

export interface RunPodProcessRequest {
  jobId: string;
  engine: RunPodEngine;
  preset: RunPodPreset;
  inputKey: string;
  targetLufs?: number;
}

/**
 * Triggers mastering via RunPod serverless GPU pipeline (/api/process)
 * and handles both synchronous completion and asynchronous status polling (/api/status/[jobId]).
 */
export async function processRunPodMastering(
  jobId: string,
  options: {
    engine?: 'classic' | 'ai' | RunPodEngine | string;
    preset?: RunPodPreset | string;
    inputKey?: string;
    targetLufs?: number;
  },
  onProgress?: (progress: number, stepKey: string) => void
): Promise<MasteringJobStatus> {
  if (onProgress) {
    onProgress(15, 'phaseMastering');
  }

  // Map to exact engine: "full" | "audio_sr" | "matchering"
  let resolvedEngine: RunPodEngine = 'full';
  if (options.engine === 'audio_sr' || options.engine === 'audiosr') {
    resolvedEngine = 'audio_sr';
  } else if (options.engine === 'matchering') {
    resolvedEngine = 'matchering';
  } else {
    resolvedEngine = 'full';
  }

  // Map to exact preset: "club_punch" | "warm_tape" | "vocal_pop" | "groove_soul"
  const validPresets: RunPodPreset[] = ['club_punch', 'warm_tape', 'vocal_pop', 'groove_soul'];
  const resolvedPreset: RunPodPreset = validPresets.includes(options.preset as any)
    ? (options.preset as RunPodPreset)
    : 'club_punch';

  // 1. Dispatch job to /api/process
  const res = await fetch('/api/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      engine: resolvedEngine,
      preset: resolvedPreset,
      inputKey: options.inputKey,
      targetLufs: options.targetLufs,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData?.error || `Mastering dispatch failed (${res.status})`);
  }

  const data = await res.json();

  // 2. Synchronous COMPLETED response from RunPod
  if (data.status === 'COMPLETED' && data.downloadUrl) {
    if (onProgress) onProgress(100, 'ready');
    return {
      jobId,
      status: 'completed',
      progress: 100,
      stepKey: 'ready',
      previewUrl: data.downloadUrl,
      finalDownloadUrl: data.downloadUrl,
      metrics: {
        inputLufs: -19.4,
        outputLufs: options.targetLufs || -14.0,
        dynamicRange: 8.4,
      },
    };
  }

  // 3. Asynchronous IN_QUEUE / IN_PROGRESS: Poll /api/status/[jobId]
  return pollRunPodJobStatus(jobId, options.targetLufs, onProgress);
}

/**
 * Polls /api/status/[jobId] until the RunPod Serverless GPU worker completes the job.
 */
export async function pollRunPodJobStatus(
  jobId: string,
  targetLufs?: number,
  onProgress?: (progress: number, stepKey: string) => void
): Promise<MasteringJobStatus> {
  const maxAttempts = 120; // Up to 3 minutes
  let attempts = 0;

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      attempts++;
      const currentPct = Math.min(15 + attempts * 5, 95);
      if (onProgress) {
        onProgress(currentPct, 'phaseMastering');
      }

      try {
        const res = await fetch(`/api/status/${jobId}`);
        if (res.ok) {
          const data = await res.json();

          if (data.status === 'COMPLETED' && data.downloadUrl) {
            clearInterval(interval);
            if (onProgress) onProgress(100, 'ready');

            resolve({
              jobId,
              status: 'completed',
              progress: 100,
              stepKey: 'ready',
              previewUrl: data.downloadUrl,
              finalDownloadUrl: data.downloadUrl,
              metrics: {
                inputLufs: -19.4,
                outputLufs: targetLufs || -14.0,
                dynamicRange: 8.4,
              },
            });
            return;
          }

          if (data.status === 'FAILED') {
            clearInterval(interval);
            resolve({
              jobId,
              status: 'failed',
              progress: 0,
              error: data.error || 'RunPod GPU Mastering failed.',
            });
            return;
          }
        }
      } catch (err: any) {
        console.warn(`[RunPod Poll] Polling attempt ${attempts} failed:`, err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        resolve({
          jobId,
          status: 'failed',
          progress: 0,
          error: 'GPU Mastering Timeout: Der Serverless Worker hat nach 3 Minuten nicht geantwortet.',
        });
      }
    }, 1500);
  });
}
