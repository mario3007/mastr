import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET_NAME } from '@/lib/storage/r2';
import { generateClientUploadUrl } from '@/lib/storage/presigned';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const contentTypeHeader = req.headers.get('content-type') || '';

    // Handle multipart/form-data (Fallback Direct Server Upload to R2)
    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided in form data' },
          { status: 400 }
        );
      }

      const requestedJobId = formData.get('jobId')?.toString().trim();
      const requestedKey = formData.get('key')?.toString().trim();

      const jobId = requestedJobId || crypto.randomUUID();
      const filename = file.name || 'input.wav';
      const ext = filename.split('.').pop()?.toLowerCase() || 'wav';
      const validExt = ['wav', 'mp3', 'flac', 'aiff', 'm4a', 'aac'].includes(ext) ? ext : 'wav';
      const key = requestedKey || `uploads/${jobId}/input.${validExt}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let fileContentType = file.type || 'audio/wav';
      if (!fileContentType || fileContentType === 'application/octet-stream') {
        if (validExt === 'mp3') fileContentType = 'audio/mpeg';
        else if (validExt === 'flac') fileContentType = 'audio/flac';
        else fileContentType = 'audio/wav';
      }

      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: fileContentType,
        })
      );

      return NextResponse.json({
        success: true,
        jobId,
        uploadUrl: '',
        key,
        inputKey: key,
      });
    }

    let filename = 'input.wav';
    let contentType = 'audio/wav';

    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        if (typeof body.filename === 'string' && body.filename.trim()) {
          filename = body.filename.trim();
        }
        if (typeof body.contentType === 'string' && body.contentType.trim()) {
          contentType = body.contentType.trim().toLowerCase();
        }
      }
    } catch {
      // Body is optional
    }

    // Infer content-type from filename if missing or octet-stream
    if (contentType === 'application/octet-stream' || !contentType) {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'wav') contentType = 'audio/wav';
      else if (ext === 'mp3') contentType = 'audio/mpeg';
      else if (ext === 'flac') contentType = 'audio/flac';
      else contentType = 'audio/wav';
    }

    const jobId = crypto.randomUUID();
    const { uploadUrl, key } = await generateClientUploadUrl(
      jobId,
      filename,
      contentType,
      3600
    );

    return NextResponse.json({
      jobId,
      uploadUrl,
      key,
      inputKey: key,
    });
  } catch (err: any) {
    console.error('Error creating upload session for R2:', err);
    return NextResponse.json(
      {
        error: 'Failed to create upload session',
        details: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
