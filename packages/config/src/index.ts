export type PresetId = 
  | 'groove_soul'
  | 'club_punch'
  | 'warm_tape'
  | 'vocal_pop'
  | 'suno_enhancer'
  | 'auto_ai' 
  | 'club_edm' 
  | 'streaming_balanced';

export interface MasteringJobRequest {
  trackUrl?: string;
  fileKey?: string;
  fileName?: string;
  mode: 'easy' | 'pro';
  easySettings?: {
    intensity: number; // 0-100
    preset: PresetId;
  };
  proSettings?: {
    lowEndPunch: number; // 0-100
    stereoWidth: number; // 0-100
    vocalClarity: number; // 0-100
    tapeDrive: number; // 0-100
    lufsTarget: number; // e.g. -14, -9, -8.5
    referenceTrackUrl?: string;
  };
}

export interface MasteringJobResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  originalUrl?: string;
  masteredUrl?: string;
  metrics?: {
    inputLufs: number;
    outputLufs: number;
    dynamicRange: number;
  };
  createdAt: string;
}

export interface UserCreditsResponse {
  userId: string;
  creditsRemaining: number;
  tier: 'free' | 'creator' | 'pro';
}
