/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-dashboard-kpi-card-01",
  "layout": "kpi",
  "title": "ARR",
  "subtitle": "Annual recurring revenue",
  "chips": [
    "+18.4%"
  ],
  "items": [
    "$2.8M"
  ],
  "accent": "2.8M"
};

    export function PremiumDashboardKpiCard01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumDashboardKpiCard01;
