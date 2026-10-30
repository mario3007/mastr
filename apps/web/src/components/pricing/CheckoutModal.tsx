'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { X, Check, Zap, Sparkles, ShieldCheck } from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose }) => {
  const tPricing = useTranslations('pricing');
  const tCommon = useTranslations('common');
  const { addCredits } = useAuth();

  if (!isOpen) return null;

  const handlePurchase = (creditsToAdd: number) => {
    addCredits(creditsToAdd);
    onClose();
  };

  const singleFeatures = [0, 1, 2, 3].map((i) => tPricing(`single.features.${i}`));
  const bundleFeatures = [0, 1, 2, 3].map((i) => tPricing(`bundle.features.${i}`));
  const creatorFeatures = [0, 1, 2, 3].map((i) => tPricing(`creator.features.${i}`));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-studio-700 bg-studio-900 p-6 md:p-8 shadow-2xl my-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-studio-400 hover:bg-studio-800 hover:text-white transition"
          aria-label={tCommon('close')}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent-amber/30 bg-accent-amber/10 px-3 py-1 text-xs font-medium text-accent-amber mb-3">
            <Zap className="h-3.5 w-3.5" />
            <span>{tCommon('getMoreCredits')}</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">{tPricing('modalTitle')}</h2>
          <p className="mt-2 text-sm text-studio-400 max-w-lg mx-auto">{tPricing('modalSubtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 1 Credit */}
          <div className="relative flex flex-col justify-between rounded-xl border border-studio-700 bg-studio-950 p-6 transition hover:border-studio-600">
            <div>
              <h3 className="text-base font-semibold text-white">{tPricing('single.title')}</h3>
              <p className="mt-1 text-xs text-studio-400">{tPricing('single.desc')}</p>
              <div className="my-5 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">{tPricing('single.price')}</span>
              </div>
              <ul className="space-y-2.5 mb-6 text-xs text-studio-300">
                {singleFeatures.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="h-4 w-4 shrink-0 text-accent-cyan mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => handlePurchase(1)}
              className="w-full rounded-xl border border-studio-600 bg-studio-850 py-2.5 text-xs font-semibold text-white hover:bg-studio-800 transition"
            >
              {tPricing('single.cta')}
            </button>
          </div>

          {/* 5er Pack - Highlighted */}
          <div className="relative flex flex-col justify-between rounded-xl border-2 border-accent-cyan bg-studio-850 p-6 shadow-xl shadow-accent-cyan/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-cyan px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-studio-950 shadow">
              {tPricing('bundle.badge')}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{tPricing('bundle.title')}</h3>
              <p className="mt-1 text-xs text-studio-400">{tPricing('bundle.desc')}</p>
              <div className="my-5 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">{tPricing('bundle.price')}</span>
              </div>
              <ul className="space-y-2.5 mb-6 text-xs text-studio-200">
                {bundleFeatures.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="h-4 w-4 shrink-0 text-accent-cyan mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => handlePurchase(5)}
              className="w-full rounded-xl bg-accent-cyan py-2.5 text-xs font-semibold text-studio-950 shadow-md shadow-accent-cyan/20 hover:opacity-95 transition"
            >
              {tPricing('bundle.cta')}
            </button>
          </div>

          {/* Creator Abo */}
          <div className="relative flex flex-col justify-between rounded-xl border border-accent-purple/50 bg-studio-950 p-6 transition hover:border-accent-purple">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-purple px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
              {tPricing('creator.badge')}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{tPricing('creator.title')}</h3>
              <p className="mt-1 text-xs text-studio-400">{tPricing('creator.desc')}</p>
              <div className="my-5 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">{tPricing('creator.price')}</span>
                <span className="text-xs text-studio-400">/{tPricing('creator.interval')}</span>
              </div>
              <ul className="space-y-2.5 mb-6 text-xs text-studio-300">
                {creatorFeatures.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="h-4 w-4 shrink-0 text-accent-purple mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => handlePurchase(15)}
              className="w-full rounded-xl bg-gradient-to-r from-accent-purple to-indigo-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-accent-purple/20 hover:opacity-95 transition"
            >
              {tPricing('creator.cta')}
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-studio-500">
          <ShieldCheck className="h-4 w-4 text-studio-400" />
          <span>{tPricing('securityNote')}</span>
        </div>
      </div>
    </div>
  );
};
