/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-data-analytics-chart-01",
  "layout": "analyticsChart",
  "title": "Analytics chart",
  "subtitle": "Comparison-ready chart component for premium dashboards.",
  "chips": [
    "Revenue",
    "Retention"
  ],
  "items": [
    "30-day trend",
    "Benchmark"
  ],
  "accent": "Analytics"
};

    export function PremiumDataAnalyticsChart01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumDataAnalyticsChart01;
