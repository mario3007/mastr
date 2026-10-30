'use client';

import React, { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Sliders, RotateCcw, UploadCloud, X, Music } from 'lucide-react';

export interface ProSettings {
  lowEndPunch: number;
  stereoWidth: number;
  vocalClarity: number;
  tapeDrive: number;
  lufsTarget: number;
  referenceFileName?: string | null;
}

interface ProSlidersProps {
  settings: ProSettings;
  onChange: (settings: ProSettings) => void;
}

export const ProSliders: React.FC<ProSlidersProps> = ({ settings, onChange }) => {
  const tPro = useTranslations('pro_controls');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateSetting = (key: keyof ProSettings, value: any) => {
    onChange({
      ...settings,
      [key]: value,
    });
  };

  const handleReset = () => {
    onChange({
      lowEndPunch: 50,
      stereoWidth: 50,
      vocalClarity: 50,
      tapeDrive: 20,
      lufsTarget: -14,
      referenceFileName: null,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      updateSetting('referenceFileName', file.name);
    }
  };

  const sliders: Array<{
    key: 'lowEndPunch' | 'stereoWidth' | 'vocalClarity' | 'tapeDrive';
    color: string;
  }> = [
    { key: 'lowEndPunch', color: 'accent-cyan' },
    { key: 'stereoWidth', color: 'accent-purple' },
    { key: 'vocalClarity', color: 'accent-amber' },
    { key: 'tapeDrive', color: 'accent-emerald' },
  ];

  const lufsTargets = [-14, -11, -9, -8.5, -7];

  return (
    <div className="rounded-2xl border border-studio-700 bg-studio-900/90 p-6 md:p-8 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-studio-800 pb-4 mb-6">
        <div className="flex items-center gap-2.5">
          <Sliders className="h-5 w-5 text-accent-cyan" />
          <h3 className="text-base font-bold text-white">{tPro('headline')}</h3>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-studio-400 hover:text-white transition"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{tPro('resetDefaults')}</span>
        </button>
      </div>

      {/* 4 Macro Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {sliders.map((s) => (
          <div key={s.key} className="rounded-xl border border-studio-800 bg-studio-950/60 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-white">
                {tPro(`${s.key === 'lowEndPunch' ? 'low_end_punch' : s.key === 'stereoWidth' ? 'stereo_width' : s.key === 'vocalClarity' ? 'vocal_clarity' : 'tape_drive'}.title`)}
              </span>
              <span className="font-mono text-xs font-bold text-accent-cyan bg-studio-800 px-2 py-0.5 rounded">
                {settings[s.key]}%
              </span>
            </div>
            <p className="text-xs text-studio-400 mb-4">
              {tPro(`${s.key === 'lowEndPunch' ? 'low_end_punch' : s.key === 'stereoWidth' ? 'stereo_width' : s.key === 'vocalClarity' ? 'vocal_clarity' : 'tape_drive'}.desc`)}
            </p>
            <input
              type="range"
              min="0"
              max="100"
              value={settings[s.key]}
              onChange={(e) => updateSetting(s.key, Number(e.target.value))}
              className="w-full h-2 rounded-lg bg-studio-800 accent-accent-cyan cursor-pointer appearance-none"
            />
          </div>
        ))}
      </div>

      {/* LUFS Target Selection & Reference Dropzone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-studio-800">
        {/* LUFS Target */}
        <div className="rounded-xl border border-studio-800 bg-studio-950/60 p-4">
          <label className="block text-sm font-semibold text-white mb-1">
            {tPro('lufs_target.label')}
          </label>
          <p className="text-xs text-studio-400 mb-3">{tPro('lufs_target.desc')}</p>
          <div className="flex flex-wrap gap-2">
            {lufsTargets.map((target) => (
              <button
                key={target}
                type="button"
                onClick={() => updateSetting('lufsTarget', target)}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition ${
                  settings.lufsTarget === target
                    ? 'bg-accent-cyan text-studio-950 shadow-md shadow-accent-cyan/20'
                    : 'bg-studio-800 text-studio-300 hover:bg-studio-700'
                }`}
              >
                {target} LUFS
              </button>
            ))}
          </div>
        </div>

        {/* Reference Track Dropzone */}
        <div className="rounded-xl border border-studio-800 bg-studio-950/60 p-4">
          <label className="block text-sm font-semibold text-white mb-1">
            {tPro('reference_track.label')}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.flac,.aiff"
            onChange={handleFileChange}
            className="hidden"
          />
          {settings.referenceFileName ? (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-2">
              <div className="flex items-center gap-2 overflow-hidden text-xs text-white">
                <Music className="h-4 w-4 shrink-0 text-accent-cyan" />
                <span className="truncate">{settings.referenceFileName}</span>
              </div>
              <button
                onClick={() => updateSetting('referenceFileName', null)}
                className="text-studio-400 hover:text-white"
                title={tPro('reference_track.remove')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-studio-700 py-3 text-xs text-studio-400 hover:border-studio-500 hover:text-studio-200 transition"
            >
              <UploadCloud className="h-4 w-4 text-studio-500" />
              <span>{tPro('reference_track.placeholder')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
