from pathlib import Path
import re


def replace_required(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing required anchor in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# 1) Registry helpers/prompts: product slots are required + optional, never broad editable.
registry = 'frontend/src/services/SkeletonRegistry.ts'
replace_required(
    registry,
    "export function getSkeletonProductSlotFiles(skeletonId: SkeletonId): string[] {\n  return [...compileSkeletonContract(skeletonId).editable];\n}",
    "export function getSkeletonProductSlotFiles(skeletonId: SkeletonId): string[] {\n  const contract = compileSkeletonContract(skeletonId);\n  return uniqueSorted([...contract.requiredSlots, ...contract.optionalSlots]);\n}",
)
replace_required(
    registry,
    "  const blueprintFiles = collectBlueprintFiles(context);\n  const blueprintDeltaFiles = blueprintFiles.filter(path => !installedFiles.includes(path));\n  const editableSkeletonFiles = uniqueSorted(\n    blueprintFiles.filter(path =>\n      installedFiles.includes(path) && !isProtectedSkeletonFile(skeletonId, path),\n    ),\n  );\n  const manifestDeltaFiles = contract.requiredSlots;\n  const manifestEditableFiles = contract.editable;\n  const mustOutputFiles = uniqueSorted([\n    ...manifestDeltaFiles,\n    ...editableSkeletonFiles,\n    ...blueprintDeltaFiles,\n  ]);",
    "  const blueprintFiles = collectBlueprintFiles(context);\n  const productSlotFiles = uniqueSorted([...contract.requiredSlots, ...contract.optionalSlots]);\n  const productSlotSet = new Set(productSlotFiles);\n  const blueprintProductSlots = blueprintFiles.filter(path => productSlotSet.has(path));\n  const manifestDeltaFiles = contract.requiredSlots;\n  const manifestEditableFiles = productSlotFiles;\n  const mustOutputFiles = uniqueSorted([\n    ...manifestDeltaFiles,\n    ...blueprintProductSlots,\n  ]);",
)
replace_required(
    registry,
    "EDITABLE SKELETON FILES — MODIFY IN PLACE WHEN NEEDED:\n${formatPathList(manifestEditableFiles)}",
    "PRODUCT SLOTS — THE ONLY FILES GENERATION MAY MODIFY:\n${formatPathList(manifestEditableFiles)}",
)
replace_required(
    registry,
    "YOUR TASK: Write ONLY the delta files. New pages, new components, new hooks, and\nproduct-specific config/data changes that the skeleton does not provide.\n\nFiles you MUST create or modify (delta only; blueprint files after excluding protected skeleton files):",
    "YOUR TASK: Fill ONLY manifest-declared product slots. Reuse skeleton components/hooks; do not create\nnew source modules outside the product-slot list, even when a desired helper/component is not provided.\n\nFiles you MUST create or modify (required product slots plus in-scope planned optional slots):",
)
replace_required(
    registry,
    "- Import from existing skeleton files. Do not duplicate their code.\n",
    "- Import from existing skeleton files. Do not duplicate their code.\n- Never output a source file outside PRODUCT SLOTS; inline product-local helpers inside an allowed slot.\n",
)

# 2) Coder-facing contract includes the exact required/optional slot allow-list.
coder_contract = 'frontend/src/services/SkeletonContractForCoder.ts'
replace_required(
    coder_contract,
    "import { type SkeletonId, SKELETON_REGISTRY } from './SkeletonRegistry';",
    "import { type SkeletonId, SKELETON_REGISTRY } from './SkeletonRegistry';\nimport { compileSkeletonContract } from './SkeletonContractCompiler';",
)
replace_required(
    coder_contract,
    "  const skeleton = SKELETON_REGISTRY[skeletonId];\n  if (!skeleton || !skeleton.available) return '';\n\n  const nav = NAV_CONTRACTS[skeletonId];",
    "  const skeleton = SKELETON_REGISTRY[skeletonId];\n  if (!skeleton || !skeleton.available) return '';\n\n  const compiled = compileSkeletonContract(skeletonId);\n  const requiredProductSlots = compiled.requiredSlots;\n  const optionalProductSlots = compiled.optionalSlots;\n  const nav = NAV_CONTRACTS[skeletonId];",
)
replace_required(
    coder_contract,
    "  lines.push('Task: generate ONLY the app-specific delta files. Do NOT recreate skeleton foundation.');",
    "  lines.push('Task: fill ONLY the concrete product slots below. Do NOT recreate or extend the skeleton foundation with new source modules.');\n  lines.push('');\n  lines.push('REQUIRED PRODUCT SLOTS — MUST BE EMITTED:');\n  lines.push(...requiredProductSlots.map(path => `  - ${path}`));\n  lines.push('OPTIONAL PRODUCT SLOTS — MAY BE EMITTED ONLY WHEN THE PRODUCT NEEDS THEM:');\n  lines.push(...(optionalProductSlots.length > 0 ? optionalProductSlots.map(path => `  - ${path}`) : ['  - none']));\n  lines.push('HARD WRITE RULE: every FILE block must target one of the product slots above. No other source path is writable.');",
)
replace_required(
    coder_contract,
    "  lines.push(\n    '  2. If a component is NOT listed, self-implement it locally under src/components/.',\n  );\n  lines.push('     Never import a component that is not in the contract or provided list.');",
    "  lines.push(\n    '  2. If a component/helper is NOT listed, implement it inside the current product-slot file.',\n  );\n  lines.push('     Never create an extra source module outside the declared product slots.');",
)

# 3) ProtoPipeline: one semantic write scope at architect, coder, apply, repair, and compile.
pipeline = Path('frontend/src/services/ProtoPipeline.ts')
text = pipeline.read_text()


def req(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"missing ProtoPipeline anchor: {old[:140]!r}")
    text = text.replace(old, new, 1)


req(
    "import { buildSkeletonContractForCoder } from './SkeletonContractForCoder';",
    "import { buildSkeletonContractForCoder } from './SkeletonContractForCoder';\nimport { filterProductDeltaFiles, filterProductDeltaSpecs, getProductDeltaScope, normalizeProductDeltaPath } from './ProductDeltaContract';",
)
req(
    "  const installedFiles = getSkeletonInstalledFiles(input.skeletonId);\n  const editableFiles = getEditableSkeletonFiles(input.skeletonId);\n  const editableFileSet = new Set(editableFiles);\n  const protectedExistingFiles = installedFiles\n    .filter(path => !editableFileSet.has(path))",
    "  const installedFiles = getSkeletonInstalledFiles(input.skeletonId);\n  const productDeltaScope = getProductDeltaScope(input.skeletonId);\n  const editableFiles = productDeltaScope.allowed.map(path => `src/${path}`);\n  const editableFileSet = new Set(editableFiles);\n  const protectedExistingFiles = installedFiles\n    .filter(path => !editableFileSet.has(path))",
)
req(
    "EDITABLE SKELETON FILES (include these in fileTree when the product needs real modifications):\n${editableExistingLines || '- (none)'}",
    "PRODUCT SLOT WRITE SCOPE (the ONLY paths fileTree may contain):\n${editableExistingLines || '- (none)'}",
)
req(
    "YOUR TASK: Return fileTree with ONLY the delta files this specific app needs.\nThe skeleton is already installed. You MAY include editable skeleton files in fileTree when they need meaningful product-specific rewrites.\nTypical delta for a mobile app: multiple routed pages, product navigation config, a real data layer, one domain hook, and at least one reusable product component.",
    "YOUR TASK: Return fileTree using ONLY the concrete PRODUCT SLOT WRITE SCOPE above.\nThe skeleton is already installed. Every required product slot must be filled; optional slots may be included when needed.\nDo not invent new pages, hooks, components, services, assets, styles, or helper modules outside those slots. Reuse skeleton-provided modules and keep product-local helper logic inside an allowed slot.",
)
req(
    '    "src/pages/Home.tsx": "Minimal pipeline scaffold — expected delta file: main screen, what it shows and which state/data it uses",\n    "src/hooks/useSomething.ts": "Minimal pipeline scaffold — expected delta file: hook, what it owns and which data it persists"',
    '    "src/pages/Home.tsx": "Required product slot: main screen, what it shows and which state/data it uses",\n    "src/data/seed.ts": "Required product slot: realistic domain seed data used by the product screens"',
)
req(
    "- fileTree keys may be returned as \"src/...\" paths, but they must describe ONLY the minimal expected delta files the coder should create.\n- NEVER include App.tsx, main.tsx, AppContext, theme.ts, UI primitives, or any file listed under PROTECTED / PROVIDED FILES.\n- Prefer product-specific pages/hooks/components/config/data files over infrastructure files.\n- For editable skeleton pages/config/data files, include them in fileTree when they must be meaningfully rewritten for the product.",
    "- fileTree keys may be returned as \"src/...\" paths, but EVERY key must be one of the PRODUCT SLOT WRITE SCOPE paths above.\n- NEVER include App.tsx, main.tsx, AppContext, theme.ts, UI primitives, or any file listed under PROTECTED / PROVIDED FILES.\n- NEVER invent a new source file outside the declared product slots, even for helpers/hooks/components/services.\n- Include every required product slot; use optional product slots only when needed.",
)

architect_pattern = re.compile(r"  const deltaFiles = Object\.entries\(planner\.fileTree\).*?\n\n  return \{", re.S)
match = architect_pattern.search(text)
if not match:
    raise SystemExit('architect post-filter block not found')
architect_projection = """  const plannedSpecs = Object.entries(planner.fileTree)
    .map(([path, purpose]) => ({ path, purpose }));
  const plannedPathSet = new Set(plannedSpecs.map(file => normalizeProductDeltaPath(file.path)));
  const requiredFallbackSpecs = productDeltaScope.required
    .filter(path => !plannedPathSet.has(path))
    .map(path => ({ path, purpose: 'Required product slot from the compiled skeleton contract' }));
  const scopedPlan = filterProductDeltaSpecs(
    input.skeletonId,
    [...plannedSpecs, ...requiredFallbackSpecs],
  );
  if (scopedPlan.rejected.length > 0) {
    input.onLog(
      `[architect] rejected ${scopedPlan.rejected.length} out-of-scope planned file(s): ${scopedPlan.rejected.join(', ')}`,
      'warn',
    );
  }
  const scopedFileTree = Object.fromEntries(scopedPlan.specs.map(file => [file.path, file.purpose]));
  const allowedPageFiles = new Set(productDeltaScope.allowed);
  const scopedPages = (planner.pages ?? []).filter(page =>
    allowedPageFiles.has(normalizeProductDeltaPath(page.file)),
  );
  const deltaFiles = scopedPlan.specs;

  if (deltaFiles.length === 0) {
    const schemaError = 'plan contains no product-slot delta files after compiled-contract filtering';
    input.onLog(`[architect] schema_error=${schemaError}`, 'warn');
    throw new Error(`Architect JSON parsed but schema validation failed: ${schemaError}. Raw snippet: ${extracted.rawSnippet}`);
  }

  return {"""
text = text[:match.start()] + architect_projection + text[match.end():]
req(
    "    fileTree: planner.fileTree,\n    deltaFiles,\n    pages: planner.pages,",
    "    fileTree: scopedFileTree,\n    deltaFiles,\n    pages: scopedPages,",
)

req(
    "  const targetFiles = input.targetFiles ?? input.plan.deltaFiles;\n  const coderMaxTokens = resolveCoderMaxTokensForTargetFileCount(targetFiles.length);",
    "  const requestedTargetFiles = input.targetFiles ?? input.plan.deltaFiles;\n  const scopedTargets = filterProductDeltaSpecs(input.skeletonId, requestedTargetFiles);\n  if (scopedTargets.rejected.length > 0) {\n    input.onLog(`[coder] rejected ${scopedTargets.rejected.length} out-of-scope target file(s): ${scopedTargets.rejected.join(', ')}`, 'warn');\n  }\n  const targetFiles = scopedTargets.specs;\n  if (targetFiles.length === 0) {\n    throw new Error('Coder has no product-slot targets after compiled-contract filtering');\n  }\n  const coderMaxTokens = resolveCoderMaxTokensForTargetFileCount(targetFiles.length);",
)
req(
    "- If a component is needed but not available in the UI catalog, implement it as a local component under components/ instead of importing a nonexistent shadcn primitive.\\n` +",
    "- If a component/helper is needed but not available in the skeleton, implement it inside the current product-slot file; NEVER create an extra source module outside the declared product slots.\\n` +",
)
req(
    "    `- Do not modify any skeleton-locked path.\\n` +",
    "    `- Do not modify any skeleton-locked path.\\n` +\n    `- HARD WRITE SCOPE: emit only manifest-declared required/optional product slots. No extra components, hooks, services, assets, styles, or helper files.\\n` +",
)

old_apply = """    let filteredFiles: Record<string, string> = {};
    let droppedProtected = 0;
    for (const [path, content] of Object.entries(deltaFiles)) {
      if (isProtectedSkeletonFile(config.skeletonId, path)) {
        droppedProtected += 1;
        log(`[apply] dropped protected: ${path}`, 'warn');
        continue;
      }
      filteredFiles[path] = content;
    }
    if (droppedProtected > 0) {
      log(`[apply] ${droppedProtected} protected file(s) ignored`, 'warn');
    }
    if (Object.keys(filteredFiles).length === 0) {
      return fail('apply', 'All produced files are skeleton-protected — nothing to write');
    }"""
new_apply = """    const productDeltaFilter = filterProductDeltaFiles(config.skeletonId, deltaFiles);
    let filteredFiles: Record<string, string> = productDeltaFilter.files;
    if (productDeltaFilter.rejected.length > 0) {
      log(
        `[apply] rejected ${productDeltaFilter.rejected.length} out-of-scope file(s); product slots are the only writable source paths: ` +
          productDeltaFilter.rejected.join(', '),
        'warn',
      );
    }
    for (const path of Object.keys(filteredFiles)) {
      if (isProtectedSkeletonFile(config.skeletonId, path)) {
        delete filteredFiles[path];
        log(`[apply] rejected invariant violation: product slot is also skeleton-protected: ${path}`, 'error');
      }
    }
    if (Object.keys(filteredFiles).length === 0) {
      return fail('apply', 'No manifest-declared product-slot files were produced — nothing to write');
    }"""
req(old_apply, new_apply)

# Do not materialize arbitrary generated asset files.
req(
    "      for (const rel of missingAssets) {\n        filteredFiles[`src/${rel}`] = PLACEHOLDER_ASSET_SVG;\n      }",
    "      for (const rel of missingAssets) {\n        log(`[apply] rejected generated asset outside product slots: src/${rel}`, 'warn');\n      }",
)

# Any dangling-module healer output is subject to the exact same product-slot filter.
req(
    "          const created = parseFileMarkers(healBody);\n          let added = 0;\n          for (const [createdPath, createdContent] of Object.entries(created)) {",
    "          const createdRaw = parseFileMarkers(healBody);\n          const createdScope = filterProductDeltaFiles(config.skeletonId, createdRaw);\n          const created = createdScope.files;\n          if (createdScope.rejected.length > 0) {\n            log(`[apply] rejected ${createdScope.rejected.length} synthesized module(s) outside product slots: ${createdScope.rejected.join(', ')}`, 'warn');\n          }\n          let added = 0;\n          for (const [createdPath, createdContent] of Object.entries(created)) {",
)

# Compile repair can see/write only product slots.
req(
    "}): Promise<Record<string, string>> {\n  const skeleton = SKELETON_REGISTRY[input.skeletonId];\n  // Heuristic: pull file paths the error log references; fall back to all files.",
    "}): Promise<Record<string, string>> {\n  const skeleton = SKELETON_REGISTRY[input.skeletonId];\n  const scopedCurrentFiles = filterProductDeltaFiles(input.skeletonId, input.currentFiles).files;\n  // Heuristic: pull file paths the error log references; fall back to all product-slot files.",
)
req("    .filter(p => p in input.currentFiles);", "    .filter(p => p in scopedCurrentFiles);")
req("    : Object.keys(input.currentFiles);", "    : Object.keys(scopedCurrentFiles);")
req(
    "    .map(p => `<<<FILE: ${p}>>>\\n${input.currentFiles[p]}\\n<<<END>>>`)",
    "    .map(p => `<<<FILE: ${p}>>>\\n${scopedCurrentFiles[p]}\\n<<<END>>>`)",
)
req(
    "  const parsed = parseFileMarkers(body);\n  if (Object.keys(parsed).length === 0) {\n    throw new Error('Repair produced no FILE/END blocks');\n  }\n  return parsed;",
    "  const parsed = parseFileMarkers(body);\n  if (Object.keys(parsed).length === 0) {\n    throw new Error('Repair produced no FILE/END blocks');\n  }\n  const scopedRepair = filterProductDeltaFiles(input.skeletonId, parsed);\n  if (scopedRepair.rejected.length > 0) {\n    input.onLog(`[repair] rejected ${scopedRepair.rejected.length} out-of-scope file(s): ${scopedRepair.rejected.join(', ')}`, 'warn');\n  }\n  if (Object.keys(scopedRepair.files).length === 0) {\n    throw new Error('Repair produced no manifest-declared product-slot files');\n  }\n  return scopedRepair.files;",
)

# Quality repair's missing-identity exception is allowed only for a real product slot.
req(
    "  const allowedMissingIdentityPaths = new Set(\n    (input.visualUsageDiagnostics?.repairableMissingIdentityPaths ?? []).map(path => normalizeOutputPath(path)),\n  );",
    "  const productSlotPaths = new Set(getProductDeltaScope(input.skeletonId).allowed);\n  const allowedMissingIdentityPaths = new Set(\n    (input.visualUsageDiagnostics?.repairableMissingIdentityPaths ?? [])\n      .map(path => normalizeProductDeltaPath(path))\n      .filter(path => productSlotPaths.has(path)),\n  );",
)

# Final compile gateway: regardless of caller/history, only declared slots reach backend compile.
req(
    "  const compileStartedAt = Date.now();\n  const sessionId = getPreviewSessionToken();\n  const resp = await fetch(`/api/preview/${encodeURIComponent(buildId)}/compile`, {",
    "  const compileStartedAt = Date.now();\n  const sessionId = getPreviewSessionToken();\n  const compileDelta = filterProductDeltaFiles(skeletonId, files);\n  if (compileDelta.rejected.length > 0) {\n    console.warn(`[ProtoPipeline] compile rejected out-of-scope product delta files: ${compileDelta.rejected.join(', ')}`);\n  }\n  const resp = await fetch(`/api/preview/${encodeURIComponent(buildId)}/compile`, {",
)
req(
    "    body:    JSON.stringify({ files, skeletonId, sessionId }),",
    "    body:    JSON.stringify({ files: compileDelta.files, skeletonId, sessionId }),",
)

pipeline.write_text(text)

# Temporary plumbing must not survive in the final branch diff.
for temp in [
    '.github/workflows/stage4-diagnostic.yml',
    '.github/workflows/stage4-patch.yml',
    '.github/workflows/stage4-anchor-fix.yml',
    'scripts/stage4_product_delta_patch.py',
]:
    Path(temp).unlink(missing_ok=True)
