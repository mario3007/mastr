'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { Disc3 } from 'lucide-react';

export const Footer: React.FC = () => {
  const t = useTranslations('common');

  return (
    <footer className="w-full border-t border-studio-800 bg-studio-950 py-12 px-4 sm:px-6 lg:px-8 text-studio-400">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-studio-800 border border-studio-700">
            <Disc3 className="h-4 w-4 text-accent-cyan" />
          </div>
          <div>
            <span className="font-mono text-sm font-bold text-white tracking-wider">
              {t('brand')}
            </span>
            <p className="text-xs text-studio-500">{t('tagline')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-xs">
          <Link href="/" className="hover:text-white transition">
            {t('navHome')}
          </Link>
          <Link href="/for/suno-ai" className="hover:text-white transition">
            {t('navUseCases')}
          </Link>
          <span className="hover:text-white transition cursor-pointer">
            {t('footerLegal')}
          </span>
        </div>

        <div className="text-xs text-studio-500 font-mono">
          &copy; {new Date().getFullYear()} {t('brand')}. {t('footerRights')}
        </div>
      </div>
    </footer>
  );
};
