import React from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { StudioWorkspaceWrapper } from '@/components/studio/StudioWorkspaceWrapper';
import { Sparkles, CheckCircle2, ShieldCheck, Waves } from 'lucide-react';

interface HomePageProps {
  params: {
    locale: string;
  };
}

export default function HomePage({ params: { locale } }: HomePageProps) {
  setRequestLocale(locale);
  const tHero = useTranslations('hero');

  return (
    <div className="relative isolate overflow-hidden">
      {/* Background radial gradient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -z-10 w-[1000px] h-[500px] bg-gradient-to-b from-accent-cyan/10 via-accent-purple/5 to-transparent blur-3xl opacity-70 pointer-events-none" />

      {/* Hero Section */}
      <section className="px-4 sm:px-6 lg:px-8 pt-12 pb-8 md:pt-20 md:pb-12 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-3.5 py-1 text-xs font-semibold text-accent-cyan mb-6 shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{tHero('badge')}</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight md:leading-[1.1] mb-6">
          {tHero('title')}
        </h1>

        <p className="text-base sm:text-lg text-studio-300 max-w-2xl mx-auto mb-8 leading-relaxed">
          {tHero('subtitle')}
        </p>

        {/* Feature Pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs font-medium text-studio-300">
          <div className="flex items-center gap-1.5 rounded-full border border-studio-800 bg-studio-900/90 px-3.5 py-1.5 backdrop-blur">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent-cyan" />
            <span>{tHero('pillWav')}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-studio-800 bg-studio-900/90 px-3.5 py-1.5 backdrop-blur">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent-emerald" />
            <span>{tHero('pillSpeed')}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-studio-800 bg-studio-900/90 px-3.5 py-1.5 backdrop-blur">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent-amber" />
            <span>{tHero('pillGain')}</span>
          </div>
        </div>
      </section>

      {/* Main Studio Console Workspace */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20 max-w-6xl mx-auto">
        <StudioWorkspaceWrapper />
      </section>
    </div>
  );
}
