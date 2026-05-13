/* @jsxRuntime classic */
import React from 'react';
import type { ReactNode } from 'react';
import { premiumPreviewThemeVars } from '../_registry/premiumComponentPrimitives';

export function PremiumPreviewFrame({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div data-testid={testId} style={{ ...premiumPreviewThemeVars(), padding: 8, background: 'var(--background)', borderRadius: 24 }}>
      {children}
    </div>
  );
}
