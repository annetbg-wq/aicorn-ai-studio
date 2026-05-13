/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-input-command-01",
  "layout": "input",
  "title": "Ask the workspace",
  "subtitle": "Prompt-style command entry",
  "chips": [
    "AI"
  ],
  "items": [
    "Summarize sprint",
    "Find blockers"
  ],
  "accent": "Prompt"
};

    export function PremiumPrimitivesInputCommand01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesInputCommand01;
