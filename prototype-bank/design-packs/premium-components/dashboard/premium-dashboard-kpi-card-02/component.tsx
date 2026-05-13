/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-dashboard-kpi-card-02",
  "layout": "kpi",
  "title": "Activation",
  "subtitle": "Users reaching first value",
  "chips": [
    "+6.2%"
  ],
  "items": [
    "74%"
  ],
  "accent": "74%"
};

    export function PremiumDashboardKpiCard02(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumDashboardKpiCard02;
