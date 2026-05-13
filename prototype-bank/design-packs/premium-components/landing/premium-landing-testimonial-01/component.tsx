/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-landing-testimonial-01",
  "layout": "testimonial",
  "title": "Trusted by teams who ship every week",
  "subtitle": "Structured proof block with verified outcomes and role-based quotes.",
  "chips": [
    "Case study"
  ],
  "items": [
    "\u201cWe replaced three fragmented tools.\u201d",
    "\u201cApprovals got faster instantly.\u201d"
  ],
  "accent": "92% faster reviews"
};

    export function PremiumLandingTestimonial01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumLandingTestimonial01;
