import fs from 'node:fs';

const file = 'backend/preview-manager.ts';
const source = fs.readFileSync(file, 'utf8');
const oldBlock = `        await cleanupLRU();
        setPreviewBuildStatus({
          buildId,
          status: 'ready',
`;
const newBlock = `        await cleanupLRU();
        const builtIndexPath = path.join(BUILDS_WORKSPACE, buildId, 'index.html');
        if (!fs.existsSync(builtIndexPath)) {
          throw new Error(\`Preview build artifact missing after compile: \${builtIndexPath}\`);
        }
        setPreviewBuildStatus({
          buildId,
          status: 'ready',
`;
if (!source.includes(oldBlock)) throw new Error('target block not found');
fs.writeFileSync(file, source.replace(oldBlock, newBlock), 'utf8');
