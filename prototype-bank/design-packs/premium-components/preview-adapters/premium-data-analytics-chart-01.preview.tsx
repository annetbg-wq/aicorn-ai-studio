/* @jsxRuntime classic */
import React from 'react';
import PremiumDataAnalyticsChart01 from '../data/premium-data-analytics-chart-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-data-analytics-chart-01',
  category: 'data',
  skeletons: ["saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-data-analytics-chart-01">
      <PremiumDataAnalyticsChart01 testId="component-premium-data-analytics-chart-01" />
    </PremiumPreviewFrame>
  );
}
