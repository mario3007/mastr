/**
 * Typed environment configuration for Cloudflare R2 and RunPod Serverless
 */

export interface EnvConfig {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  RUNPOD_API_KEY: string;
  RUNPOD_ENDPOINT_ID: string;
}

export function getEnv(): EnvConfig {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  return {
    R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'mastr-audio-storage',
    R2_ENDPOINT: endpoint,
    RUNPOD_API_KEY: process.env.RUNPOD_API_KEY || '',
    RUNPOD_ENDPOINT_ID: process.env.RUNPOD_ENDPOINT_ID || '',
  };
}

export const env = getEnv();
