'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PresetId } from '@mastr/config';
import { AudioDropzone } from './AudioDropzone';
import { SilverKnob } from './SilverKnob';
import { StyleTiles } from './StyleTiles';
import { ProSliders, ProSettings } from './ProSliders';
import { ABWaveformPlayer } from './ABWaveformPlayer';
import { useAuth } from '@/context/AuthContext';
import {
  uploadAndProcess,
  processUrl,
  pollJobStatus,
  MasteringOptions,
} from '@/lib/api/masteringClient';
import { Sliders, Wand2, Zap, ArrowRight, Sparkles, ArrowLeft, Activity } from 'lucide-react';

interface StudioWorkspaceProps {
  onOpenPricingModal: () => void;
}

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({ onOpenPricingModal }) => {
  const tPresets = useTranslations('presets');
  const tPlayer = useTranslations('player');
  const tHero = useTranslations('hero');
  const tCommon = useTranslations('common');
  const { creditsRemaining, deductCredit } = useAuth();

  // Workflow steps: 'upload' -> 'configure' -> 'playing'
  const [activeStep, setActiveStep] = useState<'upload' | 'playing'>('upload');
  const [mode, setMode] = useState<'easy' | 'pro'>('easy');

  // Track state
  const [trackName, setTrackName] = useState<string>('demo-track.wav');
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string>(
    'https://cdn.freesound.org/previews/682/682025_5674468-lq.mp3'
  );
  const [masteredAudioUrl, setMasteredAudioUrl] = useState<string>(
    'https://cdn.freesound.org/previews/682/682025_5674468-lq.mp3'
  );

  // Easy mode parameters
  const [intensity, setIntensity] = useState<number>(85);
  const [selectedPreset, setSelectedPreset] = useState<PresetId>('groove_soul');

  // Pro mode parameters
  const [proSettings, setProSettings] = useState<ProSettings>({
    lowEndPunch: 60,
    stereoWidth: 70,
    vocalClarity: 65,
    tapeDrive: 35,
    lufsTarget: -11,
    referenceFileName: null,
  });

  // Session Preset Cache & Track State
  interface CachedMaster {
    jobId: string;
    wavUrl: string;
    mp3Url: string;
    previewUrl: string;
    metrics: {
      inputLufs: number;
      outputLufs: number;
      dynamicRange: number;
    };
  }

  const [cachedMasters, setCachedMasters] = useState<Partial<Record<PresetId, CachedMaster>>>({});
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [r2FileKey, setR2FileKey] = useState<string | null>(null);
  const [currentSourceUrl, setCurrentSourceUrl] = useState<string | null>(null);
  const [isTrackUnlocked, setIsTrackUnlocked] = useState<boolean>(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentStepKey, setCurrentStepKey] = useState<string>('analyzing');
  const [masteringError, setMasteringError] = useState<string | null>(null);
  const [measuredMetrics, setMeasuredMetrics] = useState<{
    inputLufs: number;
    outputLufs: number;
    dynamicRange: number;
  } | null>(null);

  const getMasteringOptions = (overridePreset?: PresetId): MasteringOptions => {
    const preset = overridePreset ?? selectedPreset;
    const presetLufsMap: Record<string, number> = {
      club_punch: -8.5,
      club_edm: -8.5,
      suno_enhancer: -9.5,
      vocal_pop: -10.5,
      groove_soul: -11.0,
      warm_tape: -13.0,
      streaming_balanced: -14.0,
      auto_ai: -14.0,
    };

    return {
      jobId: currentJobId || undefined,
      r2FileKey: r2FileKey || undefined,
      mode,
      preset,
      intensity,
      targetLufs:
        mode === 'pro'
          ? proSettings.lufsTarget
          : presetLufsMap[preset] ?? -11.0,
      lowEndMonoCutoff:
        preset === 'club_punch'
          ? 115.0
          : preset === 'warm_tape'
          ? 90.0
          : preset === 'suno_enhancer'
          ? 100.0
          : 95.0,
      tapeSaturation: mode === 'pro' ? proSettings.tapeDrive : intensity * 0.35,
      stereoWidth: mode === 'pro' ? proSettings.stereoWidth : 50.0,
      lowEndPunch: mode === 'pro' ? proSettings.lowEndPunch : 50.0,
      vocalClarity: mode === 'pro' ? proSettings.vocalClarity : 50.0,
    };
  };

  const processMastering = async (
    presetToProcess: PresetId,
    fileOverride?: File,
    urlOverride?: string
  ) => {
    const file = fileOverride ?? currentFile;
    const url = urlOverride ?? currentSourceUrl;

    if (!file && !url) return;

    setIsProcessing(true);
    setProgress(5);
    setCurrentStepKey('analyzing');
    setMasteringError(null);

    try {
      const options = getMasteringOptions(presetToProcess);

      let job: { jobId: string };
      if (file) {
        job = await uploadAndProcess(file, options);
      } else if (url) {
        job = await processUrl(url, options);
      } else {
        return;
      }

      setCurrentJobId(job.jobId);

      const result = await pollJobStatus(job.jobId, (p, stepKey) => {
        setProgress(p);
        setCurrentStepKey(stepKey);
      });

      if (result.status === 'completed') {
        const streamUrl = result.previewUrl || result.finalDownloadUrl!;
        console.log("--> MASTERING FINISHED! Setting masteredAudioUrl to:", streamUrl);
        if (streamUrl) {
          setMasteredAudioUrl(streamUrl);
        }
        if (result.metrics) {
          setMeasuredMetrics(result.metrics);
        }

        const metricsToStore = result.metrics || {
          inputLufs: -19.4,
          outputLufs: options.targetLufs,
          dynamicRange: 8.4,
        };

        setCachedMasters((prev) => ({
          ...prev,
          [presetToProcess]: {
            jobId: job.jobId,
            wavUrl: `${workerBaseUrl}/api/v1/master/${job.jobId}/download/wav`,
            mp3Url: `${workerBaseUrl}/api/v1/master/${job.jobId}/download/mp3`,
            previewUrl: streamUrl,
            metrics: metricsToStore,
          },
        }));
        setProgress(100);
      } else {
        console.error("--> MASTERING FAILED with status:", result.status, result.error);
        setMasteringError(result.error || 'Mastering fehlgeschlagen');
        setProgress(0);
      }
    } catch (err: any) {
      console.error('Mastering processing error:', err);
      setMasteringError(err?.message || 'Fehler beim Verbinden mit dem Mastering-Dienst');
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectPreset = (newPreset: PresetId) => {
    setSelectedPreset(newPreset);

    if (activeStep !== 'playing' || isDemo) {
      return;
    }

    // Check session cache: Instant switch without new API call or loading time
    const cached = cachedMasters[newPreset];
    if (cached) {
      console.log(`--> SWITCHING PRESET to ${newPreset} (CACHED):`, cached.previewUrl);
      setCurrentJobId(cached.jobId);
      setMasteredAudioUrl(cached.previewUrl || cached.mp3Url || cached.wavUrl);
      setMeasuredMetrics(cached.metrics);
      return;
    }

    // If preset is NOT yet in cachedMasters:
    // Full user control: NEVER auto-start rendering!
    // The user selects the preset and explicitly clicks "Mastering starten".
    console.log(`--> PRESET SELECTED (NOT YET RENDERED): ${newPreset}. Ready for manual start.`);
  };

  const handleFileSelect = (file: File, r2Data?: { fileKey: string; uploadUrl?: string }) => {
    // 100% free preview - no credit deduction!
    setIsDemo(false);
    setCurrentFile(file);
    setR2FileKey(r2Data?.fileKey || null);
    setCurrentSourceUrl(null);
    setCachedMasters({});
    setIsTrackUnlocked(false);

    const objectUrl = URL.createObjectURL(file);
    setOriginalAudioUrl(objectUrl);
    setMasteredAudioUrl(''); // Explicitly clear Track B so user can choose preset before rendering
    setTrackName(file.name);
    setActiveStep('playing');
    // NOTE: Does NOT auto-start mastering! User can now choose preset/settings and click 'Start Mastering'
  };

  const handleSunoUrlSubmit = (url: string, isSunoTrack?: boolean) => {
    // 100% free preview - no credit deduction!
    setIsDemo(false);
    setCurrentFile(null);
    setR2FileKey(null);
    setCurrentSourceUrl(url);
    setCachedMasters({});
    setIsTrackUnlocked(false);

    const targetPreset = isSunoTrack ? 'suno_enhancer' : selectedPreset;
    if (isSunoTrack) {
      setSelectedPreset('suno_enhancer');
    }

    const parsedName = 'suno_ai_track.mp3';
    setTrackName(parsedName);
    setOriginalAudioUrl(url);
    setMasteredAudioUrl('');
    setActiveStep('playing');
    // NOTE: Does NOT auto-start mastering! User can choose preset and click 'Start Mastering'
  };

  const handleLoadDemo = () => {
    setTrackName('demo_tech_house_mix.wav');
    setIsDemo(true);
    setCurrentFile(null);
    setR2FileKey(null);
    setCurrentSourceUrl(null);
    setCachedMasters({});
    setIsTrackUnlocked(true);
    setCurrentJobId(null);
    setActiveStep('playing');
    setIsProcessing(false);
    setProgress(100);
    setCurrentStepKey('ready');
  };

  const handleReMaster = () => {
    if (isDemo) return;
    processMastering(selectedPreset);
  };

  const workerBaseUrl =
    typeof window !== 'undefined'
      ? '/worker'
      : (process.env.NEXT_PUBLIC_WORKER_API_URL || 'http://localhost:8000');

  const triggerDirectDownload = (url: string, filename?: string) => {
    const link = document.createElement('a');
    link.href = url;
    if (filename) {
      link.download = filename;
    }
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadWav = () => {
    if (isDemo) {
      triggerDirectDownload(masteredAudioUrl, `MASTR_${trackName.replace(/\.[^/.]+$/, '')}_24bit.wav`);
      return;
    }

    // Unlocked tracks are permanently free to download
    if (isTrackUnlocked) {
      if (currentJobId) {
        triggerDirectDownload(`${workerBaseUrl}/api/v1/master/${currentJobId}/download/wav`);
      } else {
        triggerDirectDownload(masteredAudioUrl, `MASTR_${trackName.replace(/\.[^/.]+$/, '')}_24bit.wav`);
      }
      return;
    }

    // LANDR credit model: Deduct 1 credit upon 24-bit WAV download
    if (creditsRemaining <= 0) {
      onOpenPricingModal();
      return;
    }

    const success = deductCredit();
    if (success) {
      setIsTrackUnlocked(true);
      if (currentJobId) {
        triggerDirectDownload(`${workerBaseUrl}/api/v1/master/${currentJobId}/download/wav`);
      } else {
        triggerDirectDownload(masteredAudioUrl, `MASTR_${trackName.replace(/\.[^/.]+$/, '')}_24bit.wav`);
      }
    } else {
      onOpenPricingModal();
    }
  };

  const handleDownloadMp3 = () => {
    if (currentJobId) {
      triggerDirectDownload(`${workerBaseUrl}/api/v1/master/${currentJobId}/download/mp3`);
    } else {
      triggerDirectDownload(masteredAudioUrl, `MASTR_${trackName.replace(/\.[^/.]+$/, '')}_320k.mp3`);
    }
  };

  const availableVersions = (Object.keys(cachedMasters) as PresetId[]).map((presetKey) => {
    let label: string = presetKey;
    try {
      label = tPresets(`${presetKey}.title` as any) || presetKey;
    } catch (_) {}
    return {
      id: presetKey,
      label,
      lufs: cachedMasters[presetKey]?.metrics?.outputLufs,
    };
  });

  const isCurrentPresetRendered = Boolean(cachedMasters[selectedPreset]);

  return (
    <div className="w-full space-y-10">
      {/* Top Bar Navigation: Zurück zum Upload & Track Info */}
      {activeStep === 'playing' && (
        <div className="flex items-center justify-between pb-4 border-b border-studio-800">
          <button
            type="button"
            onClick={() => setActiveStep('upload')}
            className="inline-flex items-center gap-2 rounded-xl border border-studio-700 bg-studio-850 px-4 py-2.5 text-xs sm:text-sm font-bold text-studio-200 hover:text-white hover:bg-studio-800 hover:border-accent-cyan/60 transition shadow-lg cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-accent-cyan" />
            <span>{tPlayer('backToUpload')}</span>
          </button>
          <div className="flex items-center gap-2 text-xs font-mono text-studio-400 bg-studio-900/80 px-3 py-1.5 rounded-lg border border-studio-800">
            <Activity className="h-3.5 w-3.5 text-accent-cyan shrink-0" />
            <span className="truncate max-w-[160px] sm:max-w-xs">{trackName}</span>
          </div>
        </div>
      )}

      {/* Mode Switcher Bar */}
      <div className="flex items-center justify-center">
        <div className="flex items-center rounded-2xl bg-studio-900 p-1.5 border border-studio-700/80 shadow-2xl">
          <button
            type="button"
            onClick={() => setMode('easy')}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${
              mode === 'easy'
                ? 'bg-gradient-to-r from-accent-cyan to-accent-purple text-studio-950 shadow-md shadow-accent-cyan/20'
                : 'text-studio-400 hover:text-white'
            }`}
          >
            <Wand2 className="h-4 w-4" />
            <span>{tPresets('modeEasy')}</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('pro')}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${
              mode === 'pro'
                ? 'bg-gradient-to-r from-accent-cyan to-accent-purple text-studio-950 shadow-md shadow-accent-cyan/20'
                : 'text-studio-400 hover:text-white'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>{tPresets('modePro')}</span>
          </button>
        </div>
      </div>

      {/* Mode Specific Controls */}
      {mode === 'easy' ? (
        <div className="space-y-8">
          {/* Central Silver Dial */}
          <div className="flex justify-center py-2">
            <SilverKnob
              value={intensity}
              onChange={setIntensity}
              label={tPresets('intensityLabel')}
              tooltip={tPresets('intensityTooltip')}
            />
          </div>

          {/* 4 Style Tiles */}
          <StyleTiles
            selectedPreset={selectedPreset}
            onSelectPreset={handleSelectPreset}
          />
        </div>
      ) : (
        <ProSliders settings={proSettings} onChange={setProSettings} />
      )}

      {/* Upload Dropzone or Synchronous A/B Waveform Player */}
      {activeStep === 'upload' ? (
        <AudioDropzone
          onFileSelect={handleFileSelect}
          onSunoUrlSubmit={handleSunoUrlSubmit}
          onLoadDemo={handleLoadDemo}
        />
      ) : (
        <div className="space-y-6">
          {!isDemo && !isCurrentPresetRendered && !isProcessing && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-accent-cyan/15 via-studio-900 to-accent-purple/15 border border-accent-cyan/40 p-4 sm:p-5 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-cyan/20 border border-accent-cyan/40 text-accent-cyan">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {tPlayer('choosePresetPrompt')}
                  </h4>
                  <p className="text-xs text-studio-400">
                    {mode === 'pro'
                      ? tPresets('modePro')
                      : `${tPresets(`${selectedPreset}.title` as any)} • ${tPresets(`${selectedPreset}.tag` as any)}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => processMastering(selectedPreset)}
                className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-purple px-6 py-3 text-xs md:text-sm font-extrabold text-studio-950 shadow-lg shadow-accent-cyan/25 hover:opacity-95 active:scale-95 transition cursor-pointer"
              >
                <Sparkles className="h-4 w-4 fill-current" />
                <span>
                  {Object.keys(cachedMasters).length > 0
                    ? tPlayer('masterWithPreset', {
                        preset: tPresets(`${selectedPreset}.title` as any),
                      })
                    : tPlayer('startMastering')}
                </span>
              </button>
            </div>
          )}
          {masteringError && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-300 text-sm flex items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="font-bold text-rose-400">Mastering-Fehler:</span>
                <span>{masteringError}</span>
              </div>
              <button
                type="button"
                onClick={() => currentFile && processMastering(selectedPreset, currentFile)}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold transition-all"
              >
                Erneut versuchen
              </button>
            </div>
          )}
          <ABWaveformPlayer
            trackName={trackName}
            isDemoTrack={isDemo}
            jobId={currentJobId}
            originalSrc={originalAudioUrl}
            masteredSrc={cachedMasters[selectedPreset]?.previewUrl || ''}
            isProcessing={isProcessing}
            processingProgress={progress}
            currentStepKey={currentStepKey}
            inputLufs={measuredMetrics?.inputLufs ?? -19.4}
            outputLufs={
              cachedMasters[selectedPreset]?.metrics?.outputLufs ??
              measuredMetrics?.outputLufs ??
              (mode === 'pro'
                ? proSettings.lufsTarget
                : selectedPreset === 'club_punch' || selectedPreset === 'club_edm'
                ? -8.5
                : selectedPreset === 'suno_enhancer'
                ? -9.5
                : selectedPreset === 'vocal_pop'
                ? -10.5
                : selectedPreset === 'groove_soul'
                ? -11.0
                : selectedPreset === 'warm_tape'
                ? -13.0
                : -14.0)
            }
            dynamicRange={
              cachedMasters[selectedPreset]?.metrics?.dynamicRange ??
              measuredMetrics?.dynamicRange ??
              8.4
            }
            onReMaster={() => processMastering(selectedPreset)}
            onDownloadWav={handleDownloadWav}
            onDownloadMp3={handleDownloadMp3}
            onBack={() => setActiveStep('upload')}
            availableVersions={availableVersions}
            activeVersionId={selectedPreset}
            onSelectVersion={(versionId) => handleSelectPreset(versionId as PresetId)}
          />

          <div className="flex justify-center">
            <button
              onClick={() => setActiveStep('upload')}
              className="text-xs text-studio-400 hover:text-white underline underline-offset-4 transition"
            >
              {tHero('ctaUpload')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
