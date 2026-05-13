/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-data-comparison-table-01",
  "layout": "comparisonTable",
  "title": "Comparison table",
  "subtitle": "Premium table for plan or benchmark comparisons.",
  "chips": [
    "Baseline",
    "Premium"
  ],
  "items": [
    "Automation",
    "Media slots",
    "Audit trail"
  ],
  "accent": "Compare"
};

    export function PremiumDataComparisonTable01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumDataComparisonTable01;
