'use client';

import React, { useState, useRef, useEffect } from 'react';

interface SilverKnobProps {
  value: number; // 0 to 100
  onChange: (val: number) => void;
  label: string;
  tooltip?: string;
}

export const SilverKnob: React.FC<SilverKnobProps> = ({
  value,
  onChange,
  label,
  tooltip,
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(value);

  // Map 0-100 to angle: -135deg to +135deg (total 270 deg)
  const angle = -135 + (value / 100) * 270;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = value;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startYRef.current - e.clientY;
      const sensitivity = 0.5;
      const nextVal = Math.min(100, Math.max(0, Math.round(startValRef.current + deltaY * sensitivity)));
      onChange(nextVal);
    };

    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onChange]);

  return (
    <div className="flex flex-col items-center select-none" title={tooltip}>
      <span className="text-xs font-semibold tracking-wider text-studio-300 uppercase mb-3">
        {label}
      </span>

      {/* Outer Dial Housing */}
      <div className="relative flex items-center justify-center p-2 rounded-full bg-studio-950 border border-studio-800 shadow-inner">
        {/* Tick ring indicator */}
        <div className="absolute inset-0 rounded-full border border-dashed border-studio-700/60 pointer-events-none" />

        {/* Silver Brushed Metal Knob Body */}
        <div
          ref={knobRef}
          onMouseDown={handleMouseDown}
          className={`relative h-28 w-28 md:h-32 md:w-32 rounded-full cursor-ns-resize shadow-2xl transition-transform active:scale-[0.99] ${
            isDragging ? 'ring-2 ring-accent-cyan' : ''
          }`}
          style={{
            background: 'conic-gradient(from 180deg at 50% 50%, #4a4d55 0deg, #b8bcc6 45deg, #717684 90deg, #d8dbe2 140deg, #5a5e6a 180deg, #b8bcc6 230deg, #6c717f 270deg, #e4e7ee 320deg, #4a4d55 360deg)',
            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4), 0 8px 16px rgba(0,0,0,0.6)',
          }}
        >
          {/* Inner Inset Ring */}
          <div className="absolute inset-2.5 rounded-full border border-studio-600/40 bg-gradient-to-br from-studio-700/30 to-studio-900/60 flex items-center justify-center">
            {/* Pointer notch */}
            <div
              className="absolute inset-0 flex justify-center pointer-events-none"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <div className="w-1.5 h-4.5 rounded-full bg-accent-cyan shadow-[0_0_8px_#00f0ff] -mt-1" />
            </div>

            {/* Center Cap */}
            <div className="h-14 w-14 rounded-full bg-studio-900/90 border border-studio-600/50 flex items-center justify-center shadow-inner">
              <span className="text-sm font-bold font-mono text-white">
                {value}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
