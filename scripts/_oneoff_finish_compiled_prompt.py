from pathlib import Path

path = Path('frontend/src/services/SkeletonRegistry.ts')
text = path.read_text()

replacements = {
    "  const manifestDeltaFiles = manifest?.ownership.requiredProductSlots ?? [];\n  const manifestEditableFiles = manifest?.ownership.agentEditable ?? [];":
    "  const manifestDeltaFiles = contract.requiredSlots;\n  const manifestEditableFiles = contract.editable;",
    "${formatPathList(manifest?.protectedFiles ?? installedFiles.filter(path => isProtectedSkeletonFile(skeletonId, path)))}":
    "${formatPathList(contract.infrastructure.protected)}",
    "${manifest?.requiredExports ? `\\n${buildRequiredExportsPromptBlock(manifest.requiredExports)}\\n` : ''}${injectBlock ? `\\n${injectBlock}\\n` : ''}":
    "${Object.keys(contract.infrastructure.requiredExports).length > 0 ? `\\n${buildRequiredExportsPromptBlock(contract.infrastructure.requiredExports)}\\n` : ''}${injectBlock ? `\\n${injectBlock}\\n` : ''}",
}

for old, new in replacements.items():
    assert old in text, f'missing expected prompt fragment: {old[:80]}'
    text = text.replace(old, new, 1)

assert 'manifest?.' not in text
assert 'manifest.' not in text
path.write_text(text)
