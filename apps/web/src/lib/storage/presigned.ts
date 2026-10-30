import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_BUCKET_NAME } from './r2';
import { getEnv } from '@/lib/config/env';

/**
 * Generates a presigned PUT URL for client/worker direct upload
 */
export async function generateUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Generates a presigned GET URL for secure downloading
 */
export async function generateDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * a) Presigned PUT URL für den Client-Upload des Roh-Audios (Key: uploads/{jobId}/input.wav)
 */
export async function generateClientUploadUrl(
  jobId: string,
  filename = 'input.wav',
  contentType = 'audio/wav',
  expiresIn = 3600
): Promise<{ uploadUrl: string; key: string }> {
  const ext = filename.split('.').pop()?.toLowerCase() || 'wav';
  const validExt = ['wav', 'mp3', 'flac', 'aiff', 'm4a', 'aac'].includes(ext) ? ext : 'wav';
  const key = `uploads/${jobId}/input.${validExt}`;
  const uploadUrl = await generateUploadUrl(key, contentType, expiresIn);
  return { uploadUrl, key };
}

/**
 * b) Presigned PUT URL für den RunPod-Worker (Key: masters/{jobId}/master.wav)
 */
export async function generateWorkerUploadUrl(
  jobId: string,
  contentType = 'audio/wav',
  expiresIn = 3600
): Promise<{ uploadUrl: string; key: string }> {
  const key = `masters/${jobId}/master.wav`;
  const uploadUrl = await generateUploadUrl(key, contentType, expiresIn);
  return { uploadUrl, key };
}

/**
 * c) Öffentliche oder Presigned GET URL für den Download des fertigen Masters
 */
export async function getMasterDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const env = getEnv();
  const publicUrl = process.env.R2_PUBLIC_URL || env.R2_PUBLIC_URL;
  if (publicUrl && publicUrl.trim().length > 0) {
    const cleanPublicBase = publicUrl.replace(/\/+$/, '');
    const cleanKey = key.replace(/^\/+/, '');
    return `${cleanPublicBase}/${cleanKey}`;
  }
  return generateDownloadUrl(key, expiresIn);
}
