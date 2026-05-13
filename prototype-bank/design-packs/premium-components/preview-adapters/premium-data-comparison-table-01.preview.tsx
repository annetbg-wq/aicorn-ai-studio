/* @jsxRuntime classic */
import React from 'react';
import PremiumDataComparisonTable01 from '../data/premium-data-comparison-table-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-data-comparison-table-01',
  category: 'data',
  skeletons: ["saas-dashboard", "landing-page"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-data-comparison-table-01">
      <PremiumDataComparisonTable01 testId="component-premium-data-comparison-table-01" />
    </PremiumPreviewFrame>
  );
}
