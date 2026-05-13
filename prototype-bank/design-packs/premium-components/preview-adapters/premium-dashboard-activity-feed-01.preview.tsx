/* @jsxRuntime classic */
import React from 'react';
import PremiumDashboardActivityFeed01 from '../dashboard/premium-dashboard-activity-feed-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-dashboard-activity-feed-01',
  category: 'dashboard',
  skeletons: ["saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-dashboard-activity-feed-01">
      <PremiumDashboardActivityFeed01 testId="component-premium-dashboard-activity-feed-01" />
    </PremiumPreviewFrame>
  );
}
