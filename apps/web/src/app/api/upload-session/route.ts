import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateClientUploadUrl } from '@/lib/storage/presigned';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
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
