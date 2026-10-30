import { S3Client } from '@aws-sdk/client-s3';
import { getEnv } from '@/lib/config/env';

const globalForS3 = globalThis as unknown as {
  r2ClientInstance?: S3Client;
};

function createR2Client(): S3Client {
  const env = getEnv();
  const endpoint =
    process.env.R2_ENDPOINT ||
    (env.R2_ACCOUNT_ID
      ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : undefined);

  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY,
    },
  });
}

// Singleton instance of S3Client across HMR and serverless calls
export const r2Client: S3Client = globalForS3.r2ClientInstance ?? createR2Client();

if (process.env.NODE_ENV !== 'production') {
  globalForS3.r2ClientInstance = r2Client;
}

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'mastr-audio-storage';
