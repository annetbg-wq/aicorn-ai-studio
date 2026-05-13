/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-dashboard-kpi-card-03",
  "layout": "kpi",
  "title": "Resolution SLA",
  "subtitle": "Tickets closed in target window",
  "chips": [
    "Healthy"
  ],
  "items": [
    "96%"
  ],
  "accent": "96%"
};

    export function PremiumDashboardKpiCard03(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumDashboardKpiCard03;
