'use client';

import React, { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { UploadCloud, Link as LinkIcon, Music2, Sparkles, Play, Loader2, AlertCircle, RotateCw } from 'lucide-react';

export interface R2UploadData {
  fileKey: string;
  uploadUrl: string;
}

interface AudioDropzoneProps {
  onFileSelect: (file: File, r2Data?: R2UploadData) => void;
  onSunoUrlSubmit: (url: string, isSunoTrack?: boolean) => void;
  onLoadDemo?: () => void;
}

export const AudioDropzone: React.FC<AudioDropzoneProps> = ({
  onFileSelect,
  onSunoUrlSubmit,
  onLoadDemo,
}) => {
  const t = useTranslations('player');
  const tHero = useTranslations('hero');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sunoUrl, setSunoUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [currentUploadingFile, setCurrentUploadingFile] = useState<File | null>(null);

  const isSunoDetected = /suno\.(com|ai)/i.test(sunoUrl);

  const uploadFileToR2 = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setCurrentUploadingFile(file);

    try {
      // 1. Request presigned PUT URL from our Next.js API route
      const res = await fetch('/api/r2/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'audio/wav',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.error || 'Failed to get upload URL');
      }

      const { uploadUrl, fileKey } = await res.json();
      if (!uploadUrl) {
        throw new Error('No uploadUrl returned from storage API');
      }

      // 2. Upload file directly to Cloudflare R2 via presigned link
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'audio/wav');

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage responded with HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during storage upload'));
        };

        xhr.send(file);
      });

      setIsUploading(false);
      onFileSelect(file, { fileKey, uploadUrl });
    } catch (err: any) {
      console.error('R2 Direct Upload Error:', err);
      setIsUploading(false);
      setUploadError(err?.message || t('uploadError'));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadFileToR2(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleSunoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sunoUrl.trim()) {
      onSunoUrlSubmit(sunoUrl.trim(), isSunoDetected);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Primary Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => {
          if (!isUploading) {
            fileInputRef.current?.click();
          }
        }}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 md:p-12 text-center transition-all ${
          isUploading
            ? 'border-accent-cyan bg-studio-900/90 cursor-default'
            : isDragOver
            ? 'border-accent-cyan bg-accent-cyan/10 scale-[1.01] cursor-pointer'
            : 'border-studio-700 bg-studio-900/60 hover:border-studio-500 hover:bg-studio-900 cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,.flac,.aiff,audio/*"
          className="hidden"
          disabled={isUploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFileToR2(file);
          }}
        />
        
        {isUploading ? (
          <div className="flex flex-col items-center space-y-4 w-full max-w-sm animate-fade-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-studio-800 border border-accent-cyan/50 shadow-xl">
              <Loader2 className="h-8 w-8 text-accent-cyan animate-spin" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-bold text-white mb-1">
                {t('uploadingToStorage')}
              </h3>
              <p className="text-xs text-studio-400 font-mono truncate max-w-xs">
                {currentUploadingFile?.name}
              </p>
            </div>
            <div className="w-full bg-studio-950 rounded-full h-2.5 overflow-hidden border border-studio-700 p-0.5">
              <div
                className="bg-gradient-to-r from-accent-cyan to-accent-purple h-full rounded-full transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-xs font-mono font-semibold text-accent-cyan">
              {t('uploadProgress', { progress: uploadProgress })}
            </span>
          </div>
        ) : uploadError ? (
          <div className="flex flex-col items-center space-y-3 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 shadow-xl">
              <AlertCircle className="h-7 w-7 text-rose-400" />
            </div>
            <h3 className="text-base font-bold text-rose-300">
              {t('uploadError')}
            </h3>
            <p className="text-xs text-rose-400/80 max-w-sm font-mono">
              {uploadError}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => currentUploadingFile && uploadFileToR2(currentUploadingFile)}
                className="flex items-center gap-2 rounded-xl bg-rose-500/20 border border-rose-500/40 px-4 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/30 transition shadow-lg"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>{t('retryUpload')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadError(null);
                  setCurrentUploadingFile(null);
                }}
                className="rounded-xl border border-studio-700 bg-studio-800 px-4 py-2 text-xs font-bold text-studio-300 hover:text-white transition"
              >
                {tHero('ctaUpload')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-studio-800 border border-studio-700 mb-4 shadow-xl">
              <UploadCloud className="h-8 w-8 text-accent-cyan animate-pulse" />
            </div>

            <h3 className="text-lg md:text-xl font-bold text-white mb-1.5">
              {t('dropzoneTitle')}
            </h3>
            <p className="text-xs md:text-sm text-studio-400 max-w-md">
              {t('dropzoneSubtitle')}
            </p>

            <div className="mt-4 flex items-center gap-2 text-[11px] font-mono text-studio-500">
              <Music2 className="h-3.5 w-3.5" />
              <span>WAV · MP3 · FLAC · AIFF</span>
            </div>
          </>
        )}
      </div>

      {/* Demo Track Button */}
      {onLoadDemo && (
        <div className="flex justify-center pt-1 pb-1">
          <button
            type="button"
            onClick={onLoadDemo}
            className="flex items-center gap-2 rounded-xl border border-accent-cyan/40 bg-accent-cyan/10 px-5 py-2.5 text-xs font-bold text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan transition-all shadow-lg shadow-accent-cyan/10 group cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current text-accent-cyan transition-transform group-hover:scale-110" />
            <span>{tHero('load_demo')}</span>
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-studio-800" />
        <span className="absolute bg-studio-950 px-4 text-xs font-semibold uppercase tracking-widest text-studio-500">
          {t('orText')}
        </span>
      </div>

      {/* Suno Track URL Input */}
      <div className="space-y-2">
        <form
          onSubmit={handleSunoSubmit}
          className="rounded-2xl border border-studio-700 bg-studio-900/80 p-4 md:p-5 flex flex-col sm:flex-row items-center gap-3 backdrop-blur-md shadow-lg"
        >
          <div className="flex items-center gap-2 text-studio-400 shrink-0">
            <Sparkles className="h-4 w-4 text-accent-purple" />
            <span className="text-xs font-semibold text-studio-300">
              {t('sunoUrlLabel')}
            </span>
          </div>

          <div className="relative flex-1 w-full">
            <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-studio-500" />
            <input
              type="url"
              value={sunoUrl}
              onChange={(e) => setSunoUrl(e.target.value)}
              placeholder={t('sunoUrlPlaceholder')}
              className="w-full rounded-xl border border-studio-700 bg-studio-950 py-2.5 pl-9 pr-3 text-xs md:text-sm text-white placeholder-studio-600 focus:border-accent-purple focus:outline-none focus:ring-1 focus:ring-accent-purple transition"
            />
          </div>

          <button
            type="submit"
            disabled={!sunoUrl.trim()}
            className="w-full sm:w-auto shrink-0 rounded-xl bg-accent-purple px-5 py-2.5 text-xs md:text-sm font-semibold text-white shadow-md shadow-accent-purple/20 hover:opacity-90 disabled:opacity-40 transition"
          >
            {t('sunoImportButton')}
          </button>
        </form>

        {isSunoDetected && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-purple/15 border border-accent-purple/40 text-accent-purple text-xs font-semibold shadow-inner animate-fade-in">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>{t('sunoDetectedBadge')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
