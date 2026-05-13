/* @jsxRuntime classic */
import React from 'react';
import PremiumLandingHeroDashboard01 from '../landing/premium-landing-hero-dashboard-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-landing-hero-dashboard-01',
  category: 'landing',
  skeletons: ["landing-page", "saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-landing-hero-dashboard-01">
      <PremiumLandingHeroDashboard01 testId="component-premium-landing-hero-dashboard-01" />
    </PremiumPreviewFrame>
  );
}
