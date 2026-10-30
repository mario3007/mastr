'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { PresetId } from '@mastr/config';
import { Sparkles, Bot, Flame, Radio, Disc, Mic } from 'lucide-react';

interface StyleTilesProps {
  selectedPreset: PresetId;
  onSelectPreset: (preset: PresetId) => void;
}

export const StyleTiles: React.FC<StyleTilesProps> = ({
  selectedPreset,
  onSelectPreset,
}) => {
  const tPresets = useTranslations('presets');

  const presets: Array<{
    id: PresetId;
    icon: React.ReactNode;
    colorClass: string;
  }> = [
    {
      id: 'groove_soul',
      icon: <Disc className="h-5 w-5 text-accent-cyan" />,
      colorClass: 'border-accent-cyan/50 text-accent-cyan',
    },
    {
      id: 'club_punch',
      icon: <Flame className="h-5 w-5 text-accent-amber" />,
      colorClass: 'border-accent-amber/50 text-accent-amber',
    },
    {
      id: 'warm_tape',
      icon: <Radio className="h-5 w-5 text-amber-400" />,
      colorClass: 'border-amber-400/50 text-amber-400',
    },
    {
      id: 'vocal_pop',
      icon: <Mic className="h-5 w-5 text-accent-emerald" />,
      colorClass: 'border-accent-emerald/50 text-accent-emerald',
    },
    {
      id: 'suno_enhancer',
      icon: <Bot className="h-5 w-5 text-accent-purple" />,
      colorClass: 'border-accent-purple/50 text-accent-purple',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {presets.map((p) => {
        const isSelected = selectedPreset === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectPreset(p.id)}
            className={`group relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
              isSelected
                ? 'border-accent-cyan bg-studio-850 shadow-lg shadow-accent-cyan/10 ring-1 ring-accent-cyan'
                : 'border-studio-700 bg-studio-900/80 hover:border-studio-600 hover:bg-studio-850'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-studio-800 border border-studio-700">
                  {p.icon}
                </div>
                <span className="rounded-full bg-studio-800 px-2.5 py-0.5 text-[10px] font-semibold text-studio-300 border border-studio-700">
                  {tPresets(`${p.id}.tag`)}
                </span>
              </div>
              <h4 className="text-sm font-bold text-white mb-1.5 group-hover:text-accent-cyan transition-colors">
                {tPresets(`${p.id}.title`)}
              </h4>
              <p className="text-xs text-studio-400 leading-relaxed">
                {tPresets(`${p.id}.desc`)}
              </p>
            </div>
            
            <div className="mt-4 flex items-center gap-1.5">
              <div className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-accent-cyan animate-pulse' : 'bg-studio-600'}`} />
              <span className={`text-[10px] font-mono uppercase tracking-wider ${isSelected ? 'text-accent-cyan font-bold' : 'text-studio-500'}`}>
                {isSelected ? tPresets('activeBadge') : tPresets('selectBadge')}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
