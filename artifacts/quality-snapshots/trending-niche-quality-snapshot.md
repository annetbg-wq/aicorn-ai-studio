# Trending Niche Quality Snapshot

## Summary verdict
- **FAIL**

The Trending niches direct-build surface is wired into the intended generation pipeline, but the live path was not reliable enough to produce a single stable ready preview in three attempts. Two runs failed before or during idea packaging, and one run reached the direct-launch pipeline, compile, and recovery phases but still collapsed into preview/compile errors and only exposed a technical skeleton-like dashboard state. The recent market-aware and builder-owned architecture changes may be present in the path, but the live evidence here shows packaging reliability and coder-to-available-component contract issues blocking any clear quality win from the trend direct-launch route.

## Runs table
| run | trend idea | archetype | direct-launch path confirmed | skeleton selected | override applied | preview status | quality verdict | main issue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Margin Recovery Cockpit for Shopify Brands | dashboard / analytics / decision tool | **No** - failed in packaging before `launchTrendIdeaBuild` handoff | n/a | n/a | no preview | FAIL | packaging returned `Model returned an invalid blueprint payload` |
| 2 | Margin Recovery Cockpit for Shopify Brands | dashboard / analytics / decision tool | **Yes** - entered packaged trend build, pipeline, compile, and preview mount attempts | `saas-dashboard` recovery skeleton observed after compile-contract failure; original selected skeleton not surfaced in captured telemetry | not observed | technical skeleton preview only; never reached stable ready | FAIL | compile contract failure (`@/config/navigation` missing) followed by generated missing primitive import (`components/ui/kpicard`) |
| 3 | WorkWell - Mental Health Assistant for Remote Workers | consumer health / wellness app | **No** - stalled in packaging before `launchTrendIdeaBuild` handoff | n/a | n/a | no preview | TIMEOUT | local Claude bridge `spawn EINVAL` plus standard packaging fallback timeout after 60s |

## Per-run notes

### Run 1 — Margin Recovery Cockpit for Shopify Brands
- **Input:** real Trending niches card, launched via **В работу**
- **Generation path:** `TrendNichesPanel.handleBuildIdea` -> `packageSelectedIdea` -> failed before `App.handleBuildTrendIdea` / `launchTrendIdeaBuild`
- **Telemetry highlights:** red UI error `Model returned an invalid blueprint payload`; no new direct-build trace evidence showing handoff into the pipeline
- **Screenshot:** `artifacts/quality-snapshots/screenshots/run1-packaging-failure.png`
- **Strengths:** real trend card was used; no chat-only workaround
- **Weaknesses:** never reached direct-launch build, so skeleton choice, architect, coder, quality gate, and preview readiness could not be evaluated
- **Exact suspected cause if weak:** idea packaging model returned text that failed the blueprint JSON array parser

### Run 2 — Margin Recovery Cockpit for Shopify Brands
- **Input:** real Trending niches card, launched via **В работу**
- **Generation path:** `TrendNichesPanel.handleBuildIdea` -> `packageSelectedIdea` -> `App.handleBuildTrendIdea` -> `launchTrendIdeaBuild` -> `startTrendIdeaDraftSession('build')` -> `addComposerContextFromPlan(..., 'trend-niche')` -> `onSend(normalizedIntent)` -> `useStudio._sendImpl` packaged trend fast path -> `SimpleGeneration.run` / `GenerationPipeline.run` -> `ProtoPipeline.run` -> architect/coder/build/preview compile attempts
- **Telemetry highlights:**
  - packaged trend prompt reached the engine UI
  - backend compile failed first with `root_cause_type=missing_local_import` for `@/config/navigation` from `src/components/BottomTabs.tsx`
  - preview manager then installed `saas-dashboard` as recovery skeleton
  - later compile failed again with `Missing UI primitive import: components/ui/kpicard` from `src/pages/Dashboard.tsx`
  - network showed `/api/preview/.../compile` responses `422`, then `200`, then `500`; preview URL kept returning `404`
- **Generated file summary (captured from `preview-workspace`):**
  - `src/pages/Dashboard.tsx` was clearly trend-specific in naming and intent: return-rate KPIs, lost margin, actionable insights, and premium dashboard blocks
  - despite that, the generated route referenced a missing `KPICard` primitive and did not produce a stable runnable preview
- **Screenshots:**
  - `artifacts/quality-snapshots/screenshots/run2-engine-state.png`
  - `artifacts/quality-snapshots/screenshots/run2-preview-failure.png`
- **Strengths:** direct-launch path definitely hit the real pipeline; generated copy was more domain-specific than a blank template; the dashboard intent matched the trend
- **Weaknesses:** preview never stabilized; first viewport remained closer to a technical skeleton than a polished product; no trustworthy final screen to assess as production-quality output
- **Exact suspected cause if weak:** coder output referenced components/modules that were not guaranteed by the selected/recovery skeleton and materialized primitive set

### Run 3 — WorkWell - Mental Health Assistant for Remote Workers
- **Input:** real Trending niches card, launched via **В работу**
- **Generation path:** `TrendNichesPanel.handleBuildIdea` -> `packageSelectedIdea` -> timed out before `App.handleBuildTrendIdea` / `launchTrendIdeaBuild`
- **Telemetry highlights:**
  - packaging spinner stayed visible on the trend page
  - browser console repeatedly logged `Local claude bridge unavailable (HTTP 500: {"error":"Error: spawn EINVAL"}). Falling back to standard model flow.`
  - final UI message: `Dev-agent bridge unavailable ... Standard idea-model fallback failed: Idea packaging timed out after 60s. Check your API key in Settings.`
- **Screenshot:** `artifacts/quality-snapshots/screenshots/run3-packaging-state.png`
- **Strengths:** real trend idea and real direct-build entry point were used
- **Weaknesses:** never crossed packaging into the build pipeline; no skeleton, architect, coder, or preview evidence
- **Exact suspected cause if weak:** packaging fallback path could not finish within the 60s packaging window after the local Claude bridge failed

## Cross-run findings
- **Did market-aware brief affect output?** Not conclusively measurable here. The only run that reached generated files preserved market-specific language (`return fraud`, `margin recovery`, KPI framing), but it never reached a stable ready preview.
- **Did builder-owned self-plan affect output?** Also not conclusively measurable from the live evidence. The path reaches the injection point in code, but the captured live runs did not yield a stable artifact where the effect could be judged with confidence.
- **Are prototypes less generic than before?** Slightly in vocabulary and intent, not in delivered preview quality. The generated dashboard code was more specific than `Feature 1` filler, but the visible preview still felt like a technical intermediate state.
- **Are first screens clear?** No. Two runs produced no screen at all, and the one visible preview did not settle into a clear finished first screen.
- **Are required product moments present?** Partially in generated code only. The run-2 dashboard route had KPIs and analytics framing, but the rendered result never proved out the full product moments in a stable preview.
- **Is skeleton selection good enough?** Not proven. The observed recovery skeleton (`saas-dashboard`) was safe enough to keep the system moving, but it did not rescue the run into a convincing product-specific result.
- **Is composition still the bottleneck?** Yes. Even where domain nouns existed, the rendered outcome did not cohere into a polished product moment.
- **Is visual/design bank usage still weak?** Yes in the live result. Premium/dashboard imports appeared in generated code, but the visible preview quality still read as unfinished and generic.

## Recommended next implementation step
- **add component/block slot contract**

The clearest next move is to constrain coder output to a declared, materialized set of blocks/primitives for the chosen skeleton/design pack. The only run that made it through direct-launch failed on missing local/component references, which prevented the newer market-aware and self-plan improvements from being meaningfully assessed in the final preview.
