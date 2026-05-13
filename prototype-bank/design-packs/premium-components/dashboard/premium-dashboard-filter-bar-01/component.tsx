/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-dashboard-filter-bar-01",
  "layout": "filterBar",
  "title": "Filter the workspace",
  "subtitle": "Operator-friendly search and chips.",
  "chips": [
    "Status",
    "Owner",
    "Range"
  ],
  "items": [
    "Open",
    "Assigned",
    "High priority"
  ],
  "accent": "Filters"
};

    export function PremiumDashboardFilterBar01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumDashboardFilterBar01;
