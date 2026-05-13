/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-input-search-01",
  "layout": "input",
  "title": "Search anything",
  "subtitle": "Intent-aware search control",
  "chips": [
    "\u2318K"
  ],
  "items": [
    "Customers",
    "Invoices",
    "Creators"
  ],
  "accent": "Search"
};

    export function PremiumPrimitivesInputSearch01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesInputSearch01;
