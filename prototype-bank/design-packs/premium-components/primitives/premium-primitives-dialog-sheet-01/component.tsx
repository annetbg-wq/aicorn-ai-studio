/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-dialog-sheet-01",
  "layout": "dialog",
  "title": "Quick actions",
  "subtitle": "Focused overlay for high-intent tasks",
  "chips": [
    "Command sheet"
  ],
  "items": [
    "Invite team",
    "Create workflow",
    "Upload asset"
  ],
  "accent": "Open"
};

    export function PremiumPrimitivesDialogSheet01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesDialogSheet01;
