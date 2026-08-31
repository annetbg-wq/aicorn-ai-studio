from pathlib import Path
import re

registry_path = Path('frontend/src/services/SkeletonRegistry.ts')
registry = registry_path.read_text()

# Registry must not import the 14 raw manifests. The compiler is the only raw reader.
registry, count = re.subn(
    r"(?:import [A-Za-z0-9]+Manifest from './skeleton-manifests/[^']+/skeleton\.manifest\.json';\n)+",
    '',
    registry,
    count=1,
)
assert count == 1, 'raw manifest import block not found'

needle = "import { evaluateSkeletonIntentCompatibility } from './SkeletonSelectionCompatibility';\n"
replacement = needle + "import { compileSkeletonContract, type SkeletonManifestGroup } from './SkeletonContractCompiler';\n"
assert needle in registry, 'selection import anchor missing'
registry = registry.replace(needle, replacement, 1)

registry, count = re.subn(
    r"\ninterface SkeletonManifestGroup \{.*?\n\}\n\ninterface SkeletonManifestOwnershipContract \{.*?\n\}\n",
    '\n',
    registry,
    count=1,
    flags=re.S,
)
assert count == 1, 'legacy manifest group/ownership types not found'

registry, count = re.subn(
    r"\ninterface SkeletonManifest \{.*?\n\}\n\nconst SKELETON_MANIFESTS: Record<SkeletonId, SkeletonManifest> = \{.*?\n\};\n",
    '\n',
    registry,
    count=1,
    flags=re.S,
)
assert count == 1, 'legacy manifest registry block not found'

registry, count = re.subn(
    r"export function getSkeletonInstalledFiles\(skeletonId: SkeletonId\): string\[\] \{.*?\n\}\n\nexport function getEditableSkeletonFiles",
    "export function getSkeletonInstalledFiles(skeletonId: SkeletonId): string[] {\n"
    "  return [...compileSkeletonContract(skeletonId).infrastructure.installed];\n"
    "}\n\n"
    "export function getEditableSkeletonFiles",
    registry,
    count=1,
    flags=re.S,
)
assert count == 1, 'getSkeletonInstalledFiles block not found'

registry, count = re.subn(
    r"export function getEditableSkeletonFiles\(skeletonId: SkeletonId\): string\[\] \{.*?\n\}\n\nexport function getSkeletonProductSlotFiles",
    "export function getEditableSkeletonFiles(skeletonId: SkeletonId): string[] {\n"
    "  return [...compileSkeletonContract(skeletonId).editable];\n"
    "}\n\n"
    "export function getSkeletonProductSlotFiles",
    registry,
    count=1,
    flags=re.S,
)
assert count == 1, 'getEditableSkeletonFiles block not found'

registry, count = re.subn(
    r"export function getSkeletonProductSlotFiles\(skeletonId: SkeletonId\): string\[\] \{.*?\n\}\n\nexport function getRequiredSkeletonDataFiles",
    "export function getSkeletonProductSlotFiles(skeletonId: SkeletonId): string[] {\n"
    "  return [...compileSkeletonContract(skeletonId).editable];\n"
    "}\n\n"
    "export function getRequiredSkeletonDataFiles",
    registry,
    count=1,
    flags=re.S,
)
assert count == 1, 'getSkeletonProductSlotFiles block not found'

registry, count = re.subn(
    r"export function getRequiredSkeletonDataFiles\(skeletonId: SkeletonId\): string\[\] \{.*?\n\}\n\n/\*\*\n \* Returns true",
    "export function getRequiredSkeletonDataFiles(skeletonId: SkeletonId): string[] {\n"
    "  const contract = compileSkeletonContract(skeletonId);\n"
    "  const candidates = [\n"
    "    ...contract.infrastructure.installed,\n"
    "    ...contract.requiredSlots,\n"
    "    ...contract.optionalSlots,\n"
    "    ...contract.editable,\n"
    "  ];\n\n"
    "  return uniqueSorted(candidates.filter(file => (\n"
    "    file === 'src/data/seed.ts' || file === 'src/data/types.ts'\n"
    "  )));\n"
    "}\n\n"
    "/**\n * Returns true",
    registry,
    count=1,
    flags=re.S,
)
assert count == 1, 'getRequiredSkeletonDataFiles block not found'

old = "  const manifest = SKELETON_MANIFESTS[skeletonId];\n  if (!manifest?.requiredExports) return [];\n  const violations: ExportIntegrityViolation[] = [];\n  for (const [file, entries] of Object.entries(manifest.requiredExports)) {"
new = "  const requiredExports = compileSkeletonContract(skeletonId).infrastructure.requiredExports;\n  const violations: ExportIntegrityViolation[] = [];\n  for (const [file, entries] of Object.entries(requiredExports)) {"
assert old in registry, 'checkExportIntegrity manifest read not found'
registry = registry.replace(old, new, 1)

registry, count = re.subn(
    r"export function isProtectedSkeletonFile\(skeletonId: SkeletonId, path: string\): boolean \{.*?\n\}",
    "export function isProtectedSkeletonFile(skeletonId: SkeletonId, path: string): boolean {\n"
    "  return compileSkeletonContract(skeletonId).infrastructure.protected\n"
    "    .some(pattern => pathMatchesSkeletonPattern(path, pattern));\n"
    "}",
    registry,
    count=1,
    flags=re.S,
)
assert count == 1, 'isProtectedSkeletonFile block not found'

old = "  const manifest = SKELETON_MANIFESTS[skeletonId];\n  const installedFiles = getSkeletonInstalledFiles(skeletonId);"
new = "  const contract = compileSkeletonContract(skeletonId);\n  const installedFiles = getSkeletonInstalledFiles(skeletonId);"
assert old in registry, 'buildSkeletonPromptBlock manifest read not found'
registry = registry.replace(old, new, 1)

old = "${manifest ? formatWorkingGroups(manifest.workingGroups) : formatPathList(installedFiles)}"
new = "${formatWorkingGroups(contract.infrastructure.workingGroups)}"
assert old in registry, 'working group prompt expression not found'
registry = registry.replace(old, new, 1)

assert './skeleton-manifests/' not in registry, 'Registry still imports raw manifests'
assert 'SKELETON_MANIFESTS' not in registry, 'Registry still owns a manifest map'
registry_path.write_text(registry)

output_path = Path('frontend/src/shared/outputTruth.ts')
output = output_path.read_text()
old = 'getSkeletonRuntimePolicy(skeletonId).fileContract.requiredProductSlots.map(normalizeProjectPath)'
new = 'getSkeletonRuntimePolicy(skeletonId).requiredSlots.map(normalizeProjectPath)'
assert old in output, 'outputTruth old runtime-policy access not found'
output = output.replace(old, new, 1)
assert 'fileContract.requiredProductSlots' not in output, 'outputTruth still reads legacy runtime policy shape'
output_path.write_text(output)
