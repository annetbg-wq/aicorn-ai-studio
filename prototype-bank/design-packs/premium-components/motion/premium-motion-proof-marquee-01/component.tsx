/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-motion-proof-marquee-01",
  "layout": "marquee",
  "title": "Proof marquee",
  "subtitle": "Animated social-proof strip for launch pages.",
  "chips": [
    "Marquee"
  ],
  "items": [
    "Trusted by ops teams",
    "Built for product studios",
    "No remote assets"
  ],
  "accent": "Loop"
};

    export function PremiumMotionProofMarquee01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumMotionProofMarquee01;
