/* @jsxRuntime classic */
import React from 'react';
import PremiumDataKpiGroup01 from '../data/premium-data-kpi-group-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-data-kpi-group-01',
  category: 'data',
  skeletons: ["saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-data-kpi-group-01">
      <PremiumDataKpiGroup01 testId="component-premium-data-kpi-group-01" />
    </PremiumPreviewFrame>
  );
}
