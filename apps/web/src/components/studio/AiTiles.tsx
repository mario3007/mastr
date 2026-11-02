'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { PresetId } from '@mastr/config';
import { Sparkles, Bot, Cpu, CheckCircle2, Info, Flame, Radio, Disc, Mic } from 'lucide-react';

export type AiPresetId = 'audiosr' | 'matchering' | 'full';

interface AiTilesProps {
  selectedPreset: AiPresetId;
  onSelectPreset: (preset: AiPresetId) => void;
  selectedStylePreset?: PresetId;
  onSelectStylePreset?: (preset: PresetId) => void;
}

export const AiTiles: React.FC<AiTilesProps> = ({
  selectedPreset,
  onSelectPreset,
  selectedStylePreset = 'club_punch',
  onSelectStylePreset,
}) => {
  const tAi = useTranslations('aiEngine');
  const tPresets = useTranslations('presets');

  const targetStyles: Array<{
    id: PresetId;
    icon: React.ReactNode;
  }> = [
    {
      id: 'club_punch',
      icon: <Flame className="h-4 w-4 text-accent-amber" />,
    },
    {
      id: 'vocal_pop',
      icon: <Mic className="h-4 w-4 text-accent-emerald" />,
    },
    {
      id: 'groove_soul',
      icon: <Disc className="h-4 w-4 text-accent-cyan" />,
    },
    {
      id: 'warm_tape',
      icon: <Radio className="h-4 w-4 text-amber-400" />,
    },
  ];

  const aiPresets: Array<{
    id: AiPresetId;
    icon: React.ReactNode;
    glowClass: string;
    borderGlow: string;
  }> = [
    {
      id: 'audiosr',
      icon: <Bot className="h-5 w-5 text-accent-purple" />,
      glowClass: 'text-accent-purple',
      borderGlow: 'border-accent-purple/60 shadow-accent-purple/20',
    },
    {
      id: 'matchering',
      icon: <Cpu className="h-5 w-5 text-accent-cyan" />,
      glowClass: 'text-accent-cyan',
      borderGlow: 'border-accent-cyan/60 shadow-accent-cyan/20',
    },
    {
      id: 'full',
      icon: <Sparkles className="h-5 w-5 text-amber-400" />,
      glowClass: 'text-amber-400',
      borderGlow: 'border-amber-400/60 shadow-amber-400/20',
    },
  ];

  return (
    <div className="space-y-4">
      {/* AI Explanation / Notice Banner */}
      <div className="flex items-start sm:items-center gap-3 rounded-2xl bg-gradient-to-r from-accent-purple/15 via-studio-900 to-accent-cyan/15 border border-accent-purple/30 p-3.5 sm:p-4 text-xs font-mono text-studio-300 shadow-xl">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-purple/20 border border-accent-purple/40 text-accent-purple">
          <Info className="h-4 w-4" />
        </div>
        <p className="leading-relaxed font-sans text-xs sm:text-sm text-studio-200">
          {tAi('notice')}
        </p>
      </div>

      {/* 3 AI Option Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {aiPresets.map((item) => {
          const isSelected = selectedPreset === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectPreset(item.id)}
              className={`group relative flex flex-col justify-between rounded-2xl border p-5 text-left transition-all cursor-pointer ${
                isSelected
                  ? `bg-studio-850 border-accent-cyan shadow-xl ${item.borderGlow} ring-1 ring-accent-cyan`
                  : 'bg-studio-900/80 border-studio-700/80 hover:border-studio-600 hover:bg-studio-850'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-studio-800 border border-studio-700 shadow-inner">
                    {item.icon}
                  </div>
                  <span className="rounded-full bg-studio-800/90 px-3 py-1 text-[11px] font-mono font-semibold text-accent-cyan border border-studio-700">
                    {tAi(`${item.id}.tag` as any)}
                  </span>
                </div>

                <h4 className="text-sm sm:text-base font-bold text-white mb-2 group-hover:text-accent-cyan transition-colors">
                  {tAi(`${item.id}.title` as any)}
                </h4>

                <p className="text-xs text-studio-400 leading-relaxed font-sans">
                  {tAi(`${item.id}.desc` as any)}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between pt-3 border-t border-studio-800">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isSelected ? 'bg-accent-cyan animate-pulse' : 'bg-studio-600'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider ${
                      isSelected ? 'text-accent-cyan font-bold' : 'text-studio-500'
                    }`}
                  >
                    {isSelected ? tAi('activeBadge') : tAi('selectBadge')}
                  </span>
                </div>

                {isSelected && (
                  <CheckCircle2 className="h-4 w-4 text-accent-cyan animate-fade-in" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Target Style Selector for all AI modes (Full Chain, Matchering, AudioSR) */}
      <div className="mt-5 pt-5 border-t border-studio-800 space-y-3 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h5 className="text-xs font-mono font-bold uppercase tracking-wider text-accent-cyan flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{tAi('targetStyleLabel')}</span>
          </h5>
          <span className="text-[11px] text-studio-400 font-sans">
            {tAi('targetStyleDesc')}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {targetStyles.map((style) => {
            const isStyleSelected = selectedStylePreset === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onSelectStylePreset && onSelectStylePreset(style.id)}
                className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                  isStyleSelected
                    ? `bg-studio-850 border-accent-cyan shadow-lg shadow-accent-cyan/15 ring-1 ring-accent-cyan`
                    : 'bg-studio-900/70 border-studio-800 hover:border-studio-700 hover:bg-studio-850'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-studio-800 border border-studio-700">
                    {style.icon}
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-studio-800 text-studio-300 border border-studio-700">
                    {tPresets(`${style.id}.tag` as any)}
                  </span>
                </div>
                <div>
                  <h6 className="text-xs font-bold text-white group-hover:text-accent-cyan transition-colors truncate">
                    {tPresets(`${style.id}.title` as any)}
                  </h6>
                  <p className="text-[10px] text-studio-400 mt-0.5 line-clamp-2 font-sans">
                    {tPresets(`${style.id}.desc` as any)}
                  </p>
                </div>
                <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-studio-800/80">
                  <span className={`text-[9px] font-mono uppercase tracking-wider ${isStyleSelected ? 'text-accent-cyan font-bold' : 'text-studio-500'}`}>
                    {isStyleSelected ? tAi('activeBadge') : tAi('selectBadge')}
                  </span>
                  {isStyleSelected && (
                    <CheckCircle2 className="h-3 w-3 text-accent-cyan" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notice for AudioSR (no target curve needed) */}
      {selectedPreset === 'audiosr' && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-studio-900/60 border border-studio-800/80 p-3 text-xs text-studio-300 animate-fade-in">
          <Sparkles className="h-4 w-4 text-accent-purple shrink-0" />
          <p className="font-sans text-xs text-studio-300">
            {tAi('noTargetNeeded')}
          </p>
        </div>
      )}
    </div>
  );
};
