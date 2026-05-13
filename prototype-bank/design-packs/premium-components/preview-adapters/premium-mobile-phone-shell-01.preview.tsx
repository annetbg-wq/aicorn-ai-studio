/* @jsxRuntime classic */
import React from 'react';
import PremiumMobilePhoneShell01 from '../mobile/premium-mobile-phone-shell-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-mobile-phone-shell-01',
  category: 'mobile',
  skeletons: ["mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-mobile-phone-shell-01">
      <PremiumMobilePhoneShell01 testId="component-premium-mobile-phone-shell-01" />
    </PremiumPreviewFrame>
  );
}
