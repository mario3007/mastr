'use client';

import React, { useState } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { CheckoutModal } from '../pricing/CheckoutModal';

export const AppModalsWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  return (
    <>
      <Header onOpenPricing={() => setIsPricingOpen(true)} />
      <main className="flex-1">{children}</main>
      <Footer />
      <CheckoutModal isOpen={isPricingOpen} onClose={() => setIsPricingOpen(false)} />
    </>
  );
};
