/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesDialogSheet01 from '../primitives/premium-primitives-dialog-sheet-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-dialog-sheet-01',
  category: 'primitives',
  skeletons: ["saas-dashboard", "mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-dialog-sheet-01">
      <PremiumPrimitivesDialogSheet01 testId="component-premium-primitives-dialog-sheet-01" />
    </PremiumPreviewFrame>
  );
}
