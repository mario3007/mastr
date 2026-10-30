'use client';

import React, { useState } from 'react';
import { StudioWorkspace } from './StudioWorkspace';
import { CheckoutModal } from '../pricing/CheckoutModal';

export const StudioWorkspaceWrapper: React.FC = () => {
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  return (
    <>
      <StudioWorkspace onOpenPricingModal={() => setIsPricingOpen(true)} />
      <CheckoutModal isOpen={isPricingOpen} onClose={() => setIsPricingOpen(false)} />
    </>
  );
};
