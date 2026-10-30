'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { generateTechHouseBuffer } from '@/lib/audio/techHouseSynth';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Download,
  RotateCw,
  Info,
  Activity,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';

export interface VersionTabItem {
  id: string;
  label: string;
  lufs?: number;
}

interface ABWaveformPlayerProps {
  trackName: string;
  originalSrc: string;
  masteredSrc: string;
  jobId?: string | null;
  isDemoTrack?: boolean;
  inputLufs?: number;
  outputLufs?: number;
  dynamicRange?: number;
  isProcessing?: boolean;
  processingProgress?: number;
  currentStepKey?: string;
  onReMaster: () => void;
  onDownload?: () => void;
  onDownloadWav?: () => void;
  onDownloadMp3?: () => void;
  onBack?: () => void;
  availableVersions?: VersionTabItem[];
  activeVersionId?: string;
  onSelectVersion?: (versionId: string) => void;
}

export const ABWaveformPlayer: React.FC<ABWaveformPlayerProps> = ({
  trackName,
  originalSrc,
  masteredSrc,
  jobId,
  isDemoTrack = false,
  inputLufs = -19.4,
  outputLufs = -14.0,
  dynamicRange = 8.4,
  isProcessing = false,
  processingProgress = 0,
  currentStepKey,
  onReMaster,
  onDownload,
  onDownloadWav,
  onDownloadMp3,
  onBack,
  availableVersions = [],
  activeVersionId,
  onSelectVersion,
}) => {
  const tPlayer = useTranslations('player');
  const tDownload = useTranslations('download');
  const tCommon = useTranslations('common');
  const lufsDelta = Math.abs(outputLufs - inputLufs);

  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'original' | 'mastered'>('mastered');
  const [gainMatchEnabled, setGainMatchEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [downloadingType, setDownloadingType] = useState<'wav' | 'mp3' | null>(null);

  // HTML5 Audio Refs (Bit-exact playback identical to QuickTime / VLC)
  const audioOriginalRef = useRef<HTMLAudioElement | null>(null);
  const audioMasteredRef = useRef<HTMLAudioElement | null>(null);

  // Web Audio Context (reserved exclusively for client-side synthetic demo loop)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const demoGainARef = useRef<GainNode | null>(null);
  const demoGainBRef = useRef<GainNode | null>(null);
  const demoMasterGainRef = useRef<GainNode | null>(null);
  const demoBufferRef = useRef<AudioBuffer | null>(null);
  const demoSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const demoStartAtRef = useRef<number>(0);
  const demoOffsetRef = useRef<number>(0);
  const isAudioGraphInitialized = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Gain-Match Calculation:
  // gain = 10^((LUFS_A - LUFS_B) / 20)
  // Applied strictly to Track B (Master). Track A is NEVER altered or degraded!
  const safeInputLufs = isFinite(inputLufs) ? inputLufs : -19.4;
  const safeOutputLufs = isFinite(outputLufs) ? outputLufs : -11.0;
  const lufsDeltaDb = safeInputLufs - safeOutputLufs;
  const rawGainMultiplier = Math.pow(10, lufsDeltaDb / 20);
  const gainMatchMultiplier =
    gainMatchEnabled && isFinite(rawGainMultiplier)
      ? Math.min(1.0, Math.max(0.01, rawGainMultiplier))
      : 1.0;

  // Track A / B Logging
  useEffect(() => {
    console.log("PLAYING TRACK A (Original):", originalSrc);
    console.log("PLAYING TRACK B (Master):", masteredSrc);
  }, [originalSrc, masteredSrc]);

  // Seamlessly resume Mastered Track when fresh mastered audio stream arrives
  useEffect(() => {
    if (audioMasteredRef.current && masteredSrc) {
      console.log("--> Mastered audio stream URL available:", masteredSrc);
      if (isPlaying && audioOriginalRef.current) {
        audioMasteredRef.current.currentTime = audioOriginalRef.current.currentTime;
        audioMasteredRef.current.play().catch((e) => console.warn("Master play error on stream update:", e));
      }
    }
  }, [masteredSrc]);

  useEffect(() => {
    console.log(`[A/B Toggle] Active channel: ${activeChannel} | Track A: ${originalSrc} | Track B: ${masteredSrc}`);
  }, [activeChannel, originalSrc, masteredSrc]);

  // Bit-exact, unadulterated HTML5 audio volume & A/B routing
  useEffect(() => {
    if (isDemoTrack) return;

    const baseVolume = isMuted ? 0 : (isFinite(volume) ? volume : 1.0);
    const hasMasteredAudio = Boolean(masteredSrc && masteredSrc.trim().length > 0);

    if (audioOriginalRef.current) {
      // Track A (Original): 100% pure pass-through at exact unity gain, strictly only active on 'original' channel
      audioOriginalRef.current.volume = activeChannel === 'original' ? baseVolume : 0;
    }

    if (audioMasteredRef.current) {
      // Track B (Master): Strictly only active on 'mastered' channel, lowered by gainMatchMultiplier when enabled
      const targetVolumeB =
        activeChannel === 'mastered'
          ? Math.min(1.0, Math.max(0, baseVolume * gainMatchMultiplier))
          : 0;
      audioMasteredRef.current.volume = isFinite(targetVolumeB) ? targetVolumeB : 0;
    }
  }, [activeChannel, gainMatchEnabled, volume, isMuted, gainMatchMultiplier, isDemoTrack, masteredSrc]);

  const hasMasteredAudio = Boolean(isDemoTrack || (masteredSrc && masteredSrc.trim().length > 0));

  const handleChannelSwitch = (channel: 'original' | 'mastered') => {
    setActiveChannel(channel);
    if (!isDemoTrack) {
      if (channel === 'mastered' && !hasMasteredAudio && !isProcessing) {
        onReMaster();
        return;
      }
      const audioA = audioOriginalRef.current;
      const audioB = audioMasteredRef.current;
      if (channel === 'mastered' && audioA && audioB && !isNaN(audioA.currentTime) && audioA.currentTime > 0) {
        audioB.currentTime = audioA.currentTime;
      } else if (channel === 'original' && audioA && audioB && !isNaN(audioB.currentTime) && audioB.currentTime > 0) {
        audioA.currentTime = audioB.currentTime;
      }
    }
  };

  // Demo Web Audio initialiser (no filters, clean pass-through)
  const initAudioGraph = () => {
    if (isAudioGraphInitialized.current || !isDemoTrack) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const gainA = ctx.createGain();
      gainA.gain.setValueAtTime(activeChannel === 'original' ? 1.0 : 0.0, ctx.currentTime);
      demoGainARef.current = gainA;

      const gainB = ctx.createGain();
      const initialGainB = activeChannel === 'mastered' ? gainMatchMultiplier : 0.0;
      gainB.gain.setValueAtTime(initialGainB, ctx.currentTime);
      demoGainBRef.current = gainB;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(isMuted ? 0 : volume, ctx.currentTime);
      demoMasterGainRef.current = masterGain;

      gainA.connect(masterGain);
      gainB.connect(masterGain);
      masterGain.connect(ctx.destination);

      const buf = generateTechHouseBuffer(ctx);
      demoBufferRef.current = buf;
      setDuration(buf.duration);

      isAudioGraphInitialized.current = true;
    } catch (e) {
      console.warn('Web Audio initialization fallback:', e);
    }
  };

  // Demo mode routing updates
  useEffect(() => {
    if (!isDemoTrack || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    if (demoMasterGainRef.current) {
      demoMasterGainRef.current.gain.setTargetAtTime(isMuted ? 0 : volume, ctx.currentTime, 0.02);
    }
    if (demoGainARef.current) {
      demoGainARef.current.gain.setTargetAtTime(activeChannel === 'original' ? 1.0 : 0.0, ctx.currentTime, 0.02);
    }
    if (demoGainBRef.current) {
      const targetB = activeChannel === 'mastered' ? gainMatchMultiplier : 0.0;
      demoGainBRef.current.gain.setTargetAtTime(targetB, ctx.currentTime, 0.02);
    }
  }, [isDemoTrack, activeChannel, volume, isMuted, gainMatchMultiplier]);

  // Demo playback animation loop
  useEffect(() => {
    if (!isPlaying || !isDemoTrack) return;
    let frameId: number;

    const tick = () => {
      if (audioCtxRef.current && demoBufferRef.current) {
        const dur = demoBufferRef.current.duration;
        const now = (audioCtxRef.current.currentTime - demoStartAtRef.current) % dur;
        setCurrentTime(now);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, isDemoTrack]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (demoSourceRef.current) {
        try {
          demoSourceRef.current.stop();
          demoSourceRef.current.disconnect();
        } catch (_) {}
      }
    };
  }, []);

  const togglePlay = async () => {
    if (isDemoTrack) {
      initAudioGraph();
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (isPlaying) {
        // Pause demo
        if (demoSourceRef.current) {
          try {
            demoSourceRef.current.stop();
            demoSourceRef.current.disconnect();
          } catch (_) {}
          demoSourceRef.current = null;
        }
        const dur = demoBufferRef.current?.duration || 3.81;
        demoOffsetRef.current = (ctx.currentTime - demoStartAtRef.current) % dur;
        setCurrentTime(demoOffsetRef.current);
        setIsPlaying(false);
      } else {
        // Start demo loop
        if (!demoBufferRef.current) {
          demoBufferRef.current = generateTechHouseBuffer(ctx);
        }
        const buf = demoBufferRef.current;
        setDuration(buf.duration);

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.loopStart = 0;
        src.loopEnd = buf.duration;

        src.connect(demoGainARef.current!);
        src.connect(demoGainBRef.current!);

        const startOffset = demoOffsetRef.current % buf.duration;
        src.start(0, startOffset);
        demoSourceRef.current = src;
        demoStartAtRef.current = ctx.currentTime - startOffset;
        setIsPlaying(true);
      }
      return;
    }

    // Standard media element playback (bit-exact HTML5 Audio)
    const audioA = audioOriginalRef.current;
    const audioB = audioMasteredRef.current;
    if (!audioA && !audioB) return;

    console.log("PLAYING TRACK A (Original):", originalSrc);
    console.log("PLAYING TRACK B (Master):", masteredSrc);

    if (isPlaying) {
      if (audioA) audioA.pause();
      if (audioB) audioB.pause();
      setIsPlaying(false);
      return;
    }

    try {
      if (audioA && audioB && audioA.currentTime > 0 && Math.abs(audioB.currentTime - audioA.currentTime) > 0.5) {
        try {
          audioB.currentTime = audioA.currentTime;
        } catch (_) {}
      }

      setIsPlaying(true);

      const playPromises: Promise<any>[] = [];
      if (audioA) {
        playPromises.push(
          audioA.play().catch((err) => {
            console.warn('Original track play error:', err);
          })
        );
      }
      if (audioB && audioB.src && audioB.src !== window.location.href) {
        playPromises.push(
          audioB.play().catch((err) => {
            console.warn('Mastered track play error:', err);
          })
        );
      }

      await Promise.all(playPromises);
    } catch (err) {
      console.error('Play toggle error:', err);
      const aPlaying = audioA && !audioA.paused;
      const bPlaying = audioB && !audioB.paused;
      setIsPlaying(Boolean(aPlaying || bPlaying));
    }
  };

  const handleTimeUpdate = () => {
    if (isDemoTrack) return;
    const activeAudio =
      activeChannel === 'mastered' && audioMasteredRef.current?.src
        ? audioMasteredRef.current
        : audioOriginalRef.current;
    const audio = activeAudio || audioOriginalRef.current;
    if (audio && !isNaN(audio.currentTime)) {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newRatio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = newRatio * duration;

    setCurrentTime(newTime);

    if (isDemoTrack && audioCtxRef.current) {
      demoOffsetRef.current = newTime;
      if (isPlaying) {
        if (demoSourceRef.current) {
          try {
            demoSourceRef.current.stop();
            demoSourceRef.current.disconnect();
          } catch (_) {}
        }
        const ctx = audioCtxRef.current;
        const src = ctx.createBufferSource();
        src.buffer = demoBufferRef.current!;
        src.loop = true;
        src.loopStart = 0;
        src.loopEnd = duration;
        src.connect(demoGainARef.current!);
        src.connect(demoGainBRef.current!);
        src.start(0, newTime % duration);
        demoSourceRef.current = src;
        demoStartAtRef.current = ctx.currentTime - newTime;
      }
    } else {
      try {
        if (audioOriginalRef.current) audioOriginalRef.current.currentTime = newTime;
      } catch (_) {}
      try {
        if (audioMasteredRef.current) audioMasteredRef.current.currentTime = newTime;
      } catch (_) {}
    }
  };

  // Draw simulated high-resolution waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const barCount = 140;
    const barWidth = 3;
    const gap = 2;
    const progressRatio = duration > 0 ? currentTime / duration : 0;

    // Draw baseline
    ctx.fillStyle = '#1b202e';
    ctx.fillRect(0, height / 2 - 1, width, 2);

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap);
      const ratio = i / barCount;
      // Simulated deterministic waveform shape with higher energy in chorus
      const seed = Math.sin(i * 0.18) * 0.4 + Math.cos(i * 0.05) * 0.3 + 0.3;
      const barHeight = Math.max(6, seed * (height * 0.85));

      const isPlayed = ratio <= progressRatio;

      if (isPlayed) {
        ctx.fillStyle = activeChannel === 'mastered' ? '#00f0ff' : '#ffaa00';
      } else {
        ctx.fillStyle = '#283044';
      }

      const y = (height - barHeight) / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }
  }, [currentTime, duration, activeChannel]);

  // Track previous originalSrc to detect whole new track uploads vs preset switches
  const prevOriginalSrcRef = useRef(originalSrc);

  // Reset playback position on new track, or smoothly sync on preset switch
  useEffect(() => {
    const isNewTrack = prevOriginalSrcRef.current !== originalSrc;
    prevOriginalSrcRef.current = originalSrc;

    if (isNewTrack) {
      setIsPlaying(false);
      setCurrentTime(0);
      if (audioOriginalRef.current) {
        audioOriginalRef.current.currentTime = 0;
      }
      if (audioMasteredRef.current) {
        audioMasteredRef.current.currentTime = 0;
      }
    } else {
      // Preset switch: keep current position and sync mastered audio immediately
      if (audioOriginalRef.current && audioMasteredRef.current) {
        const cur = audioOriginalRef.current.currentTime;
        audioMasteredRef.current.currentTime = cur;
        if (isPlaying && audioMasteredRef.current.paused) {
          audioMasteredRef.current.play().catch(() => {});
        }
      }
    }
  }, [originalSrc, masteredSrc, isPlaying]);

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-3xl border border-studio-700 bg-studio-900/95 p-6 md:p-8 shadow-2xl backdrop-blur-xl">
      {/* Hidden audio tags - 100% bit-exact native HTML5 audio playback */}
      <audio
        ref={audioOriginalRef}
        src={originalSrc}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          const aPaused = !audioOriginalRef.current || audioOriginalRef.current.paused;
          const bPaused = !audioMasteredRef.current || audioMasteredRef.current.paused;
          if (aPaused && bPaused) setIsPlaying(false);
        }}
        preload="auto"
      />
      <audio
        ref={audioMasteredRef}
        src={masteredSrc || undefined}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onError={(e) => {
          console.error('Track B (Master) audio playback error:', audioMasteredRef.current?.error, e);
        }}
        onPause={() => {
          const aPaused = !audioOriginalRef.current || audioOriginalRef.current.paused;
          const bPaused = !audioMasteredRef.current || audioMasteredRef.current.paused;
          if (aPaused && bPaused) setIsPlaying(false);
        }}
        preload="auto"
      />

      {/* Track Header & Processing Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-studio-800 pb-5 mb-6">
        <div className="flex items-center gap-3 overflow-hidden">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 rounded-xl border border-studio-700 bg-studio-850 px-3.5 py-2 text-xs font-bold text-studio-200 hover:text-white hover:bg-studio-800 hover:border-accent-cyan/60 transition shadow-md shrink-0 cursor-pointer"
              title={tPlayer('backToUpload')}
            >
              <ArrowLeft className="h-4 w-4 text-accent-cyan" />
              <span>{tPlayer('backToUpload')}</span>
            </button>
          )}
          <div className="overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-accent-cyan" />
              <span className="text-xs font-mono text-studio-400">
                {tPlayer('trackLoaded', { name: trackName })}
              </span>
            </div>
            <h3 className="text-lg md:text-xl font-extrabold text-white truncate">
              {trackName}
            </h3>
          </div>
        </div>

        {isProcessing ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3.5 py-1.5 text-xs font-mono text-accent-amber">
            <div className="flex items-center gap-2">
              <RotateCw className="h-4 w-4 animate-spin shrink-0" />
              <span>{tPlayer('phaseMastering')} ({processingProgress}%)</span>
            </div>
            {currentStepKey && currentStepKey !== 'phaseMastering' && (
              <span className="text-[11px] text-accent-amber/80 font-sans border-t sm:border-t-0 sm:border-l border-accent-amber/30 pt-1 sm:pt-0 sm:pl-2">
                {tPlayer(currentStepKey as any)}
              </span>
            )}
          </div>
        ) : hasMasteredAudio ? (
          <div className="flex items-center gap-2 rounded-xl border border-accent-emerald/30 bg-accent-emerald/10 px-3.5 py-1.5 text-xs font-mono text-accent-emerald">
            <CheckCircle2 className="h-4 w-4" />
            <span>{tPlayer('phaseReady')}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onReMaster}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-purple px-4 py-1.5 text-xs font-bold text-studio-950 shadow-md shadow-accent-cyan/20 hover:opacity-95 active:scale-95 transition cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 fill-current" />
            <span>{tPlayer('startMastering')}</span>
          </button>
        )}
      </div>

      {/* Synchronous A/B Switch & Gain Match Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-studio-950/80 p-3.5 border border-studio-800 mb-6">
        {/* Version-Tabs: Original (A) + Mastered Preset Versions (B, C, D...) */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-studio-900 p-1 border border-studio-800 shadow-inner">
          <button
            type="button"
            onClick={() => handleChannelSwitch('original')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeChannel === 'original'
                ? 'bg-accent-amber text-studio-950 shadow-md shadow-accent-amber/20'
                : 'text-studio-400 hover:text-white'
            }`}
          >
            <span>{tPlayer('originalBadge')}</span>
          </button>

          {availableVersions && availableVersions.length > 0 ? (
            availableVersions.map((ver) => {
              const isThisActive = activeChannel === 'mastered' && activeVersionId === ver.id;
              return (
                <button
                  key={ver.id}
                  type="button"
                  onClick={() => {
                    onSelectVersion?.(ver.id);
                    handleChannelSwitch('mastered');
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                    isThisActive
                      ? 'bg-accent-cyan text-studio-950 shadow-md shadow-accent-cyan/20'
                      : 'text-studio-400 hover:text-white hover:bg-studio-850'
                  }`}
                >
                  <span>{ver.label}</span>
                  {ver.lufs !== undefined && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isThisActive
                          ? 'bg-studio-950/25 text-studio-950 font-extrabold'
                          : 'bg-studio-800 text-studio-400'
                      }`}
                    >
                      {ver.lufs.toFixed(1)}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <button
              type="button"
              onClick={() => handleChannelSwitch('mastered')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeChannel === 'mastered'
                  ? 'bg-accent-cyan text-studio-950 shadow-md shadow-accent-cyan/20'
                  : 'text-studio-400 hover:text-white'
              }`}
            >
              <span>{tPlayer('masteredBadge')}</span>
            </button>
          )}
        </div>

        {/* Gain-Matching Toggle with Tooltip */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-accent-cyan" />
            <span className="text-xs font-semibold text-studio-300">
              {tPlayer('gainMatchToggle')}
            </span>
          </div>
          
          <button
            type="button"
            onClick={() => setGainMatchEnabled(!gainMatchEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              gainMatchEnabled ? 'bg-accent-cyan' : 'bg-studio-800'
            }`}
            title={tPlayer('gainMatchTooltip', { db: lufsDelta.toFixed(1) })}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-studio-950 transition-transform ${
                gainMatchEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>

          <div
            className="group relative cursor-help text-studio-500 hover:text-studio-300"
            title={tPlayer('gainMatchTooltip', { db: lufsDelta.toFixed(1) })}
          >
            <Info className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Interactive Waveform Canvas */}
      <div
        className="relative cursor-pointer rounded-2xl bg-studio-950 p-4 border border-studio-800/80 shadow-inner group"
        onClick={handleSeek}
      >
        <canvas
          ref={canvasRef}
          width={700}
          height={100}
          className="w-full h-24 block"
        />

        {/* Hover Scrub line */}
        <div className="absolute inset-y-0 pointer-events-none group-hover:bg-white/5 transition-colors" />

        {/* Time display over waveform */}
        <div className="mt-2 flex justify-between text-xs font-mono text-studio-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Studio VU / Metrics Readout */}
      <div className="mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-studio-950/60 p-4 border border-studio-800 text-center font-mono">
        <div>
          <span className="text-[10px] uppercase text-studio-500 block mb-0.5">
            {tPlayer('meterInput')}
          </span>
          <span className="text-xs md:text-sm font-bold text-accent-amber">
            {tPlayer('lufsIn', { value: inputLufs.toFixed(1) })}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase text-studio-500 block mb-0.5">
            {tPlayer('meterOutput')}
          </span>
          <span className="text-xs md:text-sm font-bold text-accent-cyan">
            {tPlayer('lufsOut', { value: outputLufs.toFixed(1) })}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase text-studio-500 block mb-0.5">
            {tPlayer('meterDynamics')}
          </span>
          <span className="text-xs md:text-sm font-bold text-accent-emerald">
            {tPlayer('dynamicRange', { value: dynamicRange.toFixed(1) })}
          </span>
        </div>
      </div>

      {/* Controls Bar: Play / Pause, Volume, Action Buttons */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-studio-800">
        <div className="flex items-center gap-4">
          {/* Central Play/Pause button */}
          <button
            type="button"
            disabled={isProcessing}
            onClick={togglePlay}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-accent-cyan to-accent-purple text-studio-950 shadow-lg shadow-accent-cyan/20 transition-all ${
              isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'
            }`}
            aria-label={isPlaying ? tPlayer('pause') : tPlayer('play')}
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 fill-current" />
            ) : (
              <Play className="h-6 w-6 fill-current ml-0.5" />
            )}
          </button>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="text-studio-400 hover:text-white transition"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              className="w-20 md:w-24 h-1.5 rounded-lg bg-studio-800 accent-accent-cyan cursor-pointer appearance-none"
            />
          </div>
        </div>

        {/* Action Buttons & Prominent Download Group */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          {/* Quality & Broadcast Badges */}
          <div className="hidden lg:flex items-center gap-2 mr-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-studio-800/90 border border-studio-700/80 px-2 py-1 text-[10px] font-mono text-studio-300">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan animate-pulse" />
              {tDownload('badge_quality')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-studio-800/90 border border-studio-700/80 px-2 py-1 text-[10px] font-mono text-accent-emerald">
              <CheckCircle2 className="h-3 w-3 text-accent-emerald" />
              {tDownload('badge_broadcast')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!hasMasteredAudio ? (
              <button
                type="button"
                onClick={onReMaster}
                disabled={isProcessing}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-purple px-6 py-2.5 text-xs font-bold text-studio-950 shadow-lg shadow-accent-cyan/25 hover:opacity-95 active:scale-95 transition cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4 fill-current" />
                <span>{tPlayer('startMastering')}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onReMaster}
                  className="flex items-center gap-2 rounded-xl border border-studio-700 bg-studio-850 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-studio-800 transition"
                  title={tPlayer('reMasterButton')}
                >
                  <RotateCw className="h-3.5 w-3.5 text-studio-400" />
                  <span className="hidden md:inline">{tPlayer('reMasterButton')}</span>
                </button>

                {/* Secondary Button: MP3 Preview (320 kbps) */}
                <button
                  type="button"
                  onClick={() => {
                    setDownloadingType('mp3');
                    if (onDownloadMp3) {
                      onDownloadMp3();
                    } else if (onDownload) {
                      onDownload();
                    }
                    setTimeout(() => setDownloadingType(null), 1200);
                  }}
                  disabled={downloadingType !== null}
                  className="flex items-center gap-1.5 rounded-xl border border-studio-700 bg-studio-800 hover:bg-studio-750 px-3.5 py-2.5 text-xs font-semibold text-studio-200 hover:text-white transition shadow-sm disabled:opacity-50"
                >
                  {downloadingType === 'mp3' ? (
                    <RotateCw className="h-3.5 w-3.5 animate-spin text-accent-cyan" />
                  ) : (
                    <Download className="h-3.5 w-3.5 text-studio-400" />
                  )}
                  <span>
                    {downloadingType === 'mp3' ? tDownload('downloading') : tDownload('mp3_button')}
                  </span>
                </button>

                {/* Primary CTA-Button: Master herunterladen (24-Bit HD WAV) */}
                <button
                  type="button"
                  onClick={() => {
                    setDownloadingType('wav');
                    if (onDownloadWav) {
                      onDownloadWav();
                    } else if (onDownload) {
                      onDownload();
                    }
                    setTimeout(() => setDownloadingType(null), 1200);
                  }}
                  disabled={downloadingType !== null}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-purple px-4 py-2.5 text-xs font-bold text-studio-950 shadow-lg shadow-accent-cyan/20 hover:opacity-95 active:scale-95 transition disabled:opacity-50"
                >
                  {downloadingType === 'wav' ? (
                    <RotateCw className="h-4 w-4 animate-spin text-studio-950" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>
                    {downloadingType === 'wav' ? tDownload('downloading') : tDownload('wav_button')}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
