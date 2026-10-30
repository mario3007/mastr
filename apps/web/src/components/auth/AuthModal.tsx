'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { X, Mail, CheckCircle2, Disc3 } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const { isAuthModalOpen, closeAuthModal, signInWithGoogle, signInWithApple, signInWithOtp } = useAuth();
  
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleSubmitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    const { error } = await signInWithOtp(email);
    setIsSubmitting(false);
    if (!error) {
      setIsSent(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-studio-700 bg-studio-900 p-6 shadow-2xl">
        <button
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-lg p-1 text-studio-400 hover:bg-studio-800 hover:text-white transition-colors"
          aria-label={tCommon('close')}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-cyan/10 border border-accent-cyan/20">
            <Disc3 className="h-6 w-6 text-accent-cyan animate-spin-slow" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">{tAuth('modalTitle')}</h2>
          <p className="mt-2 text-xs text-studio-400">{tAuth('modalSubtitle')}</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => signInWithGoogle()}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-studio-700 bg-studio-850 px-4 py-3 text-sm font-medium text-white transition hover:bg-studio-800 hover:border-studio-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{tAuth('googleButton')}</span>
          </button>

          <button
            onClick={() => signInWithApple()}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-studio-700 bg-studio-850 px-4 py-3 text-sm font-medium text-white transition hover:bg-studio-800 hover:border-studio-600"
          >
            <svg className="h-5 w-5 fill-current" viewBox="0 0 170 170">
              <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-5.88-8.91-10.45-19.12-13.72-30.63-3.26-11.51-4.9-22.37-4.9-32.58 0-14.99 3.82-27.42 11.45-37.3 7.63-9.88 17.38-14.91 29.24-15.11 4.58 0 9.8 1.19 15.66 3.57 5.86 2.38 9.77 3.63 11.72 3.75 1.52 0 5.61-1.39 12.28-4.17 6.67-2.77 12.38-3.93 17.14-3.48 12.63.87 22.86 5.86 30.68 14.98-10.88 6.53-16.21 15.66-16 27.4.22 9.13 3.69 16.73 10.43 22.8 6.74 6.09 14.68 9.68 23.83 10.76-2.17 6.53-4.89 13.15-8.16 19.86zM119.22 31.02c0-7.18 2.6-13.79 7.82-19.83 5.22-6.03 11.52-9.87 18.91-11.51.65 6.96-1.52 13.69-6.52 20.19-5 6.5-11.74 10.43-20.21 11.15z" />
            </svg>
            <span>{tAuth('appleButton')}</span>
          </button>
        </div>

        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-studio-800" />
          </div>
          <span className="relative bg-studio-900 px-3 text-xs text-studio-500 uppercase tracking-wider">
            {tAuth('orEmail')}
          </span>
        </div>

        {isSent ? (
          <div className="flex items-center gap-3 rounded-xl border border-accent-emerald/30 bg-accent-emerald/10 p-4 text-accent-emerald">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="text-xs">{tAuth('linkSentSuccess')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmitOtp} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-studio-300 mb-1.5">
                {tAuth('emailLabel')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-studio-500" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={tAuth('emailPlaceholder')}
                  className="w-full rounded-xl border border-studio-700 bg-studio-950 py-2.5 pl-10 pr-4 text-sm text-white placeholder-studio-600 focus:border-accent-cyan focus:outline-none focus:ring-1 focus:ring-accent-cyan transition"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-gradient-to-r from-accent-cyan to-accent-purple py-3 text-sm font-semibold text-studio-950 shadow-lg shadow-accent-cyan/10 hover:opacity-95 disabled:opacity-50 transition"
            >
              {isSubmitting ? tCommon('loading') : tAuth('sendMagicLink')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
