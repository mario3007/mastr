import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateUploadUrl } from '@/lib/storage/presigned';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/flac',
  'audio/x-flac',
]);

const MIME_TO_EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

export async function POST(req: NextRequest) {
  try {
    let contentType = '';
    let filename = '';

    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        contentType = typeof body.contentType === 'string' ? body.contentType.trim().toLowerCase() : '';
        filename = typeof body.filename === 'string' ? body.filename.trim() : '';
      }
    } catch {
      // Body may be empty
    }

    // Infer content type from filename if not supplied or octet-stream
    if ((!contentType || contentType === 'application/octet-stream') && filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'wav') contentType = 'audio/wav';
      else if (ext === 'mp3') contentType = 'audio/mpeg';
      else if (ext === 'flac') contentType = 'audio/flac';
    }

    // Normalize audio/mp3 to audio/mpeg
    if (contentType === 'audio/mp3') {
      contentType = 'audio/mpeg';
    }

    // Validate MIME-Type
    if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json(
        {
          error: 'Invalid MIME type. Allowed formats: audio/wav, audio/mpeg, audio/flac',
          received: contentType || 'none',
        },
        { status: 400 }
      );
    }

    const ext = MIME_TO_EXT[contentType] || 'wav';
    const uniqueId = crypto.randomUUID();
    const fileKey = `raw/${uniqueId}.${ext}`;

    const uploadUrl = await generateUploadUrl(fileKey, contentType, 3600);

    return NextResponse.json({
      uploadUrl,
      fileKey,
    });
  } catch (err: any) {
    console.error('Error creating R2 presigned upload URL:', err);
    return NextResponse.json(
      {
        error: 'Failed to generate upload URL',
        details: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

