from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
proto_path = ROOT / 'frontend/src/services/ProtoPipeline.ts'
e2e_path = ROOT / 'e2e/mobile-agent-generation.spec.cjs'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


proto = proto_path.read_text()

proto = replace_once(
    proto,
    "} from './FunctionalFlowPlanner';\nimport {\n  buildArchitectureImplementationDiagnostics,",
    "} from './FunctionalFlowPlanner';\nimport {\n  evaluateAppFirstQualityGate,\n  type AppFirstQualityGateResult,\n  type AppFirstQualityGateTelemetry,\n} from './AppFirstQualityGate';\nimport {\n  buildArchitectureImplementationDiagnostics,",
    'app-first import',
)

proto = replace_once(
    proto,
    "export interface PrototypeQualityGateInput {\n  /** Violations from validateDesignContract(). Null/undefined = check not run. */\n  designContractViolations?: DesignViolation[] | null;\n  /** Pre-computed visual usage diagnostics. Null/undefined = check not run. */\n  visualUsageDiagnostics?: VisualUsageDiagnostics | null;\n  /** Pre-computed product specificity diagnostics. Null/undefined = check not run. */\n  productSpecificityDiagnostics?: ProductSpecificityDiagnostics | null;\n}",
    "export interface PrototypeQualityGateInput {\n  /** Surface profile. Mobile app enables app-first release semantics. */\n  skeletonId?: SkeletonId;\n  /** Violations from validateDesignContract(). Null/undefined = check not run. */\n  designContractViolations?: DesignViolation[] | null;\n  /** Pre-computed visual usage diagnostics. Null/undefined = check not run. */\n  visualUsageDiagnostics?: VisualUsageDiagnostics | null;\n  /** Pre-computed product specificity diagnostics. Null/undefined = check not run. */\n  productSpecificityDiagnostics?: ProductSpecificityDiagnostics | null;\n  /** App-first mobile diagnostics. Null/undefined = check not run. */\n  appFirstQualityDiagnostics?: AppFirstQualityGateResult | null;\n}",
    'quality gate input',
)

proto = replace_once(
    proto,
    "export interface PrototypeQualityGateTelemetry {\n  checks_run: string[];",
    "export interface PrototypeQualityGateTelemetry {\n  checks_run: string[];\n  quality_profile: 'mobile-app' | 'landing-page' | 'general';\n  app_first_quality_gate?: AppFirstQualityGateTelemetry;",
    'quality telemetry type',
)

proto = replace_once(
    proto,
    "  functional_implementation_diagnostics?: FunctionalImplementationDiagnosticsTelemetry;\n  architecture_implementation_diagnostics?: ArchitectureImplementationDiagnosticsTelemetry;",
    "  functional_implementation_diagnostics?: FunctionalImplementationDiagnosticsTelemetry;\n  app_first_quality_gate?: AppFirstQualityGateTelemetry;\n  architecture_implementation_diagnostics?: ArchitectureImplementationDiagnosticsTelemetry;",
    'step output telemetry',
)

proto = replace_once(
    proto,
    "  const advisoryInstructions: string[] = [];\n  const checksRun: string[] = [];\n\n  // ── Check 1: design contract raw token violations",
    "  const advisoryInstructions: string[] = [];\n  const checksRun: string[] = [];\n  const qualityProfile: PrototypeQualityGateTelemetry['quality_profile'] =\n    input.skeletonId === 'mobile-app'\n      ? 'mobile-app'\n      : input.skeletonId === 'landing-page'\n        ? 'landing-page'\n        : 'general';\n  const appFirst = input.appFirstQualityDiagnostics ?? null;\n\n  if (qualityProfile === 'mobile-app' && appFirst !== null) {\n    checksRun.push('app_first_mobile');\n    blockingReasons.push(...appFirst.blockingReasons);\n    repairInstructions.push(...appFirst.repairInstructions);\n    advisoryReasons.push(...appFirst.advisoryReasons);\n    advisoryInstructions.push(\n      ...appFirst.advisoryReasons.map(() =>\n        'Keep the mobile product flow connected and stateful while preserving the skeleton-owned shell.',\n      ),\n    );\n  }\n\n  // ── Check 1: design contract raw token violations",
    'quality profile start',
)

proto = replace_once(
    proto,
    "  const genericDashboardCardFlag = psd !== null && (\n    psd.emptyMetricFindings.length > 0 ||\n    psd.suggestedNextAction === 'add_repair_later'\n  );",
    "  const genericDashboardCardFlag = psd !== null && qualityProfile !== 'mobile-app' && (\n    psd.emptyMetricFindings.length > 0 ||\n    psd.suggestedNextAction === 'add_repair_later'\n  );",
    'mobile dashboard blocker exemption',
)

proto = replace_once(
    proto,
    "      checks_run: checksRun,\n      design_contract_violations: designContractViolationCount,",
    "      checks_run: checksRun,\n      quality_profile: qualityProfile,\n      app_first_quality_gate: appFirst?.telemetry,\n      design_contract_violations: designContractViolationCount,",
    'quality telemetry return',
)

proto = replace_once(
    proto,
    "    const functionalImplementationDiagnostics = buildFunctionalImplementationDiagnostics({\n      files: filteredFiles,\n      plan: functionalFlowPlan,\n    });\n    const architectureImplementationDiagnostics = buildArchitectureImplementationDiagnostics({",
    "    let currentFunctionalImplementationDiagnostics = buildFunctionalImplementationDiagnostics({\n      files: filteredFiles,\n      plan: functionalFlowPlan,\n    });\n    let currentAppFirstQualityDiagnostics = evaluateAppFirstQualityGate({\n      skeletonId: config.skeletonId,\n      files: filteredFiles,\n      architectPlan: plan,\n      functionalFlowPlan,\n      functionalDiagnostics: currentFunctionalImplementationDiagnostics,\n    });\n    const architectureImplementationDiagnostics = buildArchitectureImplementationDiagnostics({",
    'runtime functional diagnostics',
)

proto = replace_once(
    proto,
    "        functional_implementation_diagnostics: serializeFunctionalImplementationDiagnostics(functionalImplementationDiagnostics),\n        architecture_implementation_diagnostics: serializeArchitectureImplementationDiagnostics(architectureImplementationDiagnostics),",
    "        functional_implementation_diagnostics: serializeFunctionalImplementationDiagnostics(currentFunctionalImplementationDiagnostics),\n        app_first_quality_gate: currentAppFirstQualityDiagnostics.telemetry,\n        architecture_implementation_diagnostics: serializeArchitectureImplementationDiagnostics(architectureImplementationDiagnostics),",
    'runtime step telemetry',
)

proto = replace_once(
    proto,
    "    let qualityGate = evaluatePrototypeQualityGate({\n      designContractViolations: currentDesignViolations,\n      visualUsageDiagnostics: currentVisualUsageDiagnostics,\n      productSpecificityDiagnostics: currentProductSpecificityDiagnostics,\n    });",
    "    let qualityGate = evaluatePrototypeQualityGate({\n      skeletonId: config.skeletonId,\n      designContractViolations: currentDesignViolations,\n      visualUsageDiagnostics: currentVisualUsageDiagnostics,\n      productSpecificityDiagnostics: currentProductSpecificityDiagnostics,\n      appFirstQualityDiagnostics: currentAppFirstQualityDiagnostics,\n    });",
    'initial quality call',
)

proto = replace_once(
    proto,
    "      currentProductSpecificityDiagnostics = buildProductSpecificityDiagnostics({\n        files: filteredFiles,\n        plan:  productSpecificityPlan,\n      });\n      qualityGate = evaluatePrototypeQualityGate({\n        designContractViolations: currentDesignViolations,\n        visualUsageDiagnostics:   currentVisualUsageDiagnostics,\n        productSpecificityDiagnostics: currentProductSpecificityDiagnostics,\n      });",
    "      currentProductSpecificityDiagnostics = buildProductSpecificityDiagnostics({\n        files: filteredFiles,\n        plan:  productSpecificityPlan,\n      });\n      currentFunctionalImplementationDiagnostics = buildFunctionalImplementationDiagnostics({\n        files: filteredFiles,\n        plan: functionalFlowPlan,\n      });\n      currentAppFirstQualityDiagnostics = evaluateAppFirstQualityGate({\n        skeletonId: config.skeletonId,\n        files: filteredFiles,\n        architectPlan: plan,\n        functionalFlowPlan,\n        functionalDiagnostics: currentFunctionalImplementationDiagnostics,\n      });\n      if (stepResults.apply?.output) {\n        stepResults.apply.output.functional_implementation_diagnostics =\n          serializeFunctionalImplementationDiagnostics(currentFunctionalImplementationDiagnostics);\n        stepResults.apply.output.app_first_quality_gate = currentAppFirstQualityDiagnostics.telemetry;\n      }\n      qualityGate = evaluatePrototypeQualityGate({\n        skeletonId: config.skeletonId,\n        designContractViolations: currentDesignViolations,\n        visualUsageDiagnostics:   currentVisualUsageDiagnostics,\n        productSpecificityDiagnostics: currentProductSpecificityDiagnostics,\n        appFirstQualityDiagnostics: currentAppFirstQualityDiagnostics,\n      });",
    'quality repair re-evaluation',
)

proto_path.write_text(proto)

# Stage 5 must prove real app behavior. Strengthen the deterministic full-agent
# mobile fixture instead of weakening the new production gate.
e2e = e2e_path.read_text()

e2e = replace_once(
    e2e,
    "function buildDelta(s) {\n  const simplePage = (name, title, body) => [\n    `export default function ${name}() {`,\n    `  return <section><h1>${title}</h1><p>${body}</p></section>;`,\n    '}',\n  ].join('\\n');\n\n  return {",
    "function buildDelta(s) {\n  return {",
    'remove static page helper',
)

old_pages = """    'pages/Home.tsx': [
      \"import { SEED_FEED } from '../data/seed';\",
      'export default function Home() {',
      '  const first = SEED_FEED[0];',
      `  return <section><h1>${s.marker}</h1><article><strong>{first.title}</strong><p>{first.subtitle}</p></article></section>;`,
      '}',
    ].join('\\n'),
    'pages/Detail.tsx': [
      \"import { SEED_FEED } from '../data/seed';\",
      'export default function Detail() {',
      '  const first = SEED_FEED[0];',
      `  return <section><h1>${s.labels.detail}</h1><h2>{first.title}</h2><p>{first.subtitle}</p></section>;`,
      '}',
    ].join('\\n'),
    'pages/Create.tsx': simplePage('Create', s.labels.create, `Create a new item in ${s.appName}`),
    'pages/Progress.tsx': [
      \"import { SEED_PROGRESS } from '../data/seed';\",
      'export default function Progress() {',
      '  const latest = SEED_PROGRESS[0];',
      `  return <section><h1>${s.labels.progress}</h1><p>Current value: {latest.value}</p><p>{latest.goalMet ? 'Goal met' : 'In progress'}</p></section>;`,
      '}',
    ].join('\\n'),
    'pages/Profile.tsx': [
      \"import { APP_CONFIG } from '../config/app';\",
      'export default function Profile() {',
      `  return <section><h1>${s.labels.profile}</h1><p>{APP_CONFIG.name}</p><p>{APP_CONFIG.tagline}</p></section>;`,
      '}',
    ].join('\\n'),
"""
new_pages = """    'pages/Home.tsx': [
      \"import { Link } from 'react-router-dom';\",
      \"import { SEED_FEED } from '../data/seed';\",
      \"import { ROUTES, detailRoute } from '../config/routes';\",
      'export default function Home() {',
      '  const first = SEED_FEED[0];',
      `  return <section><h1>${s.marker}</h1><article><strong>{first.title}</strong><p>{first.subtitle}</p><Link to={detailRoute(first.id)}>Open detail</Link></article><Link to={ROUTES.create}>${s.labels.create}</Link></section>;`,
      '}',
    ].join('\\n'),
    'pages/Detail.tsx': [
      \"import { useState } from 'react';\",
      \"import { SEED_FEED } from '../data/seed';\",
      'export default function Detail() {',
      '  const first = SEED_FEED[0];',
      '  const [done, setDone] = useState(false);',
      `  return <section><h1>${s.labels.detail}</h1><h2>{first.title}</h2><p>{first.subtitle}</p><button type=\"button\" onClick={() => setDone(value => !value)}>{done ? 'Completed' : 'Mark done'}</button></section>;`,
      '}',
    ].join('\\n'),
    'pages/Create.tsx': [
      \"import { useState } from 'react';\",
      \"import { SEED_FEED } from '../data/seed';\",
      \"import type { FeedItem } from '../data/types';\",
      'export default function Create() {',
      '  const [entries, setEntries] = useState<FeedItem[]>(() => SEED_FEED.map(item => ({ ...item })));',
      `  const [draft, setDraft] = useState(${q(s.item.title)});`,
      \"  const [createdTitle, setCreatedTitle] = useState('');\",
      '  const handleCreateEntry = (event: React.FormEvent<HTMLFormElement>) => {',
      '    event.preventDefault();',
      \"    const nextEntry: FeedItem = { id: `local-${entries.length + 1}`, title: draft.trim() || 'New item', subtitle: 'Created locally', kind: 'local', createdAt: new Date(0).toISOString(), meta: { local: true } };\",
      '    setEntries([...entries, nextEntry]);',
      '    setCreatedTitle(nextEntry.title);',
      '  };',
      `  return <section><h1>${s.labels.create}</h1><form onSubmit={handleCreateEntry}><input aria-label=\"Item title\" value={draft} onChange={event => setDraft(event.target.value)} /><button type=\"submit\">Save</button></form><p>Items: {entries.length}</p>{createdTitle ? <p>Created: {createdTitle}</p> : null}</section>;`,
      '}',
    ].join('\\n'),
    'pages/Progress.tsx': [
      \"import { useMemo } from 'react';\",
      \"import { SEED_FEED, SEED_PROGRESS } from '../data/seed';\",
      'export default function Progress() {',
      '  const latest = SEED_PROGRESS[0];',
      '  const visibleItems = useMemo(() => SEED_FEED.filter(item => item.title.length > 0).length, []);',
      '  const progressSummary = useMemo(() => SEED_PROGRESS.reduce((total, entry) => total + entry.value, 0), []);',
      `  return <section><h1>${s.labels.progress}</h1><p>Current value: {latest.value}</p><p>Tracked items: {visibleItems}</p><p>Summary: {progressSummary}</p><p>{latest.goalMet ? 'Goal met' : 'In progress'}</p></section>;`,
      '}',
    ].join('\\n'),
    'pages/Profile.tsx': [
      \"import { useState } from 'react';\",
      \"import { APP_CONFIG } from '../config/app';\",
      'export default function Profile() {',
      '  const [remindersEnabled, setRemindersEnabled] = useState(true);',
      `  return <section><h1>${s.labels.profile}</h1><p>{APP_CONFIG.name}</p><p>{APP_CONFIG.tagline}</p><button type=\"button\" onClick={() => setRemindersEnabled(value => !value)}>Reminders: {remindersEnabled ? 'On' : 'Off'}</button></section>;`,
      '}',
    ].join('\\n'),
"""
e2e = replace_once(e2e, old_pages, new_pages, 'functional mobile fixture pages')
e2e_path.write_text(e2e)

print('Stage 5 app-first patch applied')
