'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname, useRouter } from '@/navigation';
import { useAuth } from '@/context/AuthContext';
import { Disc3, Zap, Globe, User as UserIcon, LogOut } from 'lucide-react';

interface HeaderProps {
  onOpenPricing: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenPricing }) => {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { user, creditsRemaining, openAuthModal, signOut } = useAuth();

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = e.target.value as 'de' | 'en' | 'es';
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-studio-800 bg-studio-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand / Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-accent-cyan to-accent-purple shadow-md shadow-accent-cyan/20 group-hover:scale-105 transition-transform">
              <Disc3 className="h-5 w-5 text-studio-950" />
            </div>
            <div>
              <span className="font-mono text-lg font-black tracking-wider text-white">
                {t('brand')}
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono uppercase text-accent-cyan font-bold tracking-widest bg-accent-cyan/10 px-1.5 py-0.5 rounded">
                STUDIO
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-studio-300">
            <Link href="/" className="hover:text-white transition">
              {t('navHome')}
            </Link>
            <button
              onClick={onOpenPricing}
              className="hover:text-white transition"
            >
              {t('navPricing')}
            </button>
            <Link href="/for/suno-ai" className="hover:text-white transition">
              {t('navUseCases')}
            </Link>
            <Link href="/api/v1/user/credits" className="hover:text-white transition font-mono text-studio-500 hover:text-accent-cyan">
              {t('navApi')}
            </Link>
          </nav>
        </div>

        {/* Right Section: Language, Credits Balance, Auth */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Language Switcher */}
          <div className="relative flex items-center">
            <Globe className="h-3.5 w-3.5 text-studio-400 absolute left-2 pointer-events-none" />
            <select
              value={locale}
              onChange={handleLocaleChange}
              aria-label={t('language')}
              className="h-8 rounded-lg border border-studio-700 bg-studio-900 pl-7 pr-2 text-xs font-mono text-studio-300 focus:border-accent-cyan focus:outline-none cursor-pointer appearance-none"
            >
              <option value="de">DE</option>
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
          </div>

          {/* Credit Balance Badge */}
          <div className="flex items-center gap-2 rounded-xl border border-studio-800 bg-studio-900/90 px-3 py-1.5 shadow-inner">
            <Zap className="h-3.5 w-3.5 text-accent-amber" />
            <span className="font-mono text-xs font-bold text-white">
              {t('creditsLeft', { count: creditsRemaining })}
            </span>
            <button
              onClick={onOpenPricing}
              className="rounded-md bg-accent-cyan/15 px-2 py-0.5 text-[10px] font-semibold text-accent-cyan hover:bg-accent-cyan/25 transition"
            >
              +
            </button>
          </div>

          {/* Auth Button */}
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-studio-800 border border-studio-700 text-xs font-bold text-white">
                <UserIcon className="h-4 w-4 text-studio-300" />
              </div>
              <button
                onClick={() => signOut()}
                className="rounded-lg p-1.5 text-studio-400 hover:bg-studio-800 hover:text-white transition"
                title={t('logout')}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={openAuthModal}
              className="rounded-xl border border-studio-700 bg-studio-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-studio-800 hover:border-studio-600 transition"
            >
              {t('login')}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
