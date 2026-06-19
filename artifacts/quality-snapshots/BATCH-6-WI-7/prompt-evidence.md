# Batch 6 — WI-7 Prompt Evidence

## ProtoPipeline Coder System Prompt

Design Fusion block is injected via `buildCoderPlanningBlocks({ designFusionBlock })`.

### Injection point

```
buildCoderPlanningBlocks:
  1. designContractForCoder(designCtx)          ← visual pack / archetype
  2. buildCompositionPlanPromptBlock()           ← screen layout
  3. buildFunctionalFlowPromptBlock()            ← user flows
  4. buildSkeletonIntegrationPromptBlock()       ← skeleton wiring
  5. buildProductSpecificityPromptBlock()        ← domain specifics
  6. serializeMarketAwareBuilderBriefForCoder()  ← market brief
  7. attachmentPromptBlock                       ← raw uploaded asset descriptions
  8. *** designFusionBlock ***                   ← WI-7 Design Fusion Contract ← HERE
  9. buildProductIdentitySubstitutionContract()  ← identity substitution
 10. buildBuilderOwnedSelfPlanInstructions()     ← builder self-plan
```

### Design Fusion Block Content (sample)

```
== DESIGN FUSION CONTRACT ==
Follow this priority hierarchy STRICTLY when choosing what to render:

A) UPLOADED ASSETS / PREMIUM COMPONENTS — use for:
   hero sections · branded illustrations · empty states
   onboarding visuals · marketing feature blocks
   visual identity blocks · user-provided UI references

B) SHADCN UI PRIMITIVES — use for ALL of these (NEVER hand-roll them):
   forms:    Input, Label, Textarea, Select, Switch, Checkbox
   feedback: Alert, Badge, Progress, Tooltip
   layout:   Card, Tabs, ScrollArea
   overlay:  Dialog, AlertDialog
   actions:  Button

C) LOCAL CUSTOM COMPONENTS — ONLY when A and B do not fit.

HARD RULES:
- NEVER hand-roll Alert, Dialog, Tabs, Switch, Select when the primitive is available.
- NEVER import from @radix-ui/react-* directly — use ONLY @/components/ui/* paths.
- Alert      = inline status / callout / warning / info block.
- AlertDialog = modal confirmation or destructive decision. Do NOT confuse them.
- Do NOT use uploaded assets as decorative noise — only on their designated surfaces.
- Do NOT use premium components outside their allowed surfaces.
- Do NOT invent components not in the advertised catalog.

[UPLOADED ASSET MANIFEST — when assets present]
  [01-hero-image] "hero-banner.png"
    import: '@/generated/uploads/01-hero-image'
    surfaces: hero, marketing, feature-block
    guidance: Import default export to use as img src in the UI

[PREMIUM COMPONENT SELECTIONS — when premium selected]
  [health-ritual-card] "RitualCard"
    import: '@/design-pack/premium-components/health/RitualCard/component'
    surface: hero
    guidance: Use RitualCard in the home screen hero section
    constraints: Do not use outside health domain · Do not downgrade to generic card

== END DESIGN FUSION CONTRACT ==
```

## LVPipeline Blank Canvas System Prompt

Design Fusion block is injected as the 3rd section of `buildLvCoderSystemPrompt`, after SHOULD IMPLEMENT and before OUTPUT FORMAT.

### Injection point in system prompt

```
[1] You are an expert React + TypeScript developer...
[2] TECH STACK (now includes shadcn/ui note)
[3] MUST IMPLEMENT
[4] SHOULD IMPLEMENT
[5] *** DESIGN FUSION CONTRACT ***  ← WI-7 injected HERE
[6] OUTPUT FORMAT
[7] RULES (now includes @radix-ui forbidden rule)
```

### Key difference from ProtoPipeline

- LVPipeline: `premiumComponents: []` (blank_canvas does not use premium components)
- LVPipeline: Uploaded asset files are overlaid in the merged file map so generated imports resolve at compile time

## Telemetry Evidence

`computeDesignFusionTelemetry()` from DesignFusionService computes:
- `design_fusion_prompt_evidence`: true when `coderSystemPrompt.includes('DESIGN FUSION CONTRACT')`
- `direct_radix_import_count`: from `detectDirectRadixImports(generatedFiles)`
- `shadcn_primitive_usage_count`: from `countShadcnPrimitiveUsages(generatedFiles)`
- `premium_selected_not_used`: true when premium selected count > 0 and used count == 0
