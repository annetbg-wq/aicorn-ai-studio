import fs from 'node:fs';
const required = ['src/App.tsx','src/main.tsx','src/index.css','src/route-manifest.json'];
const missing = required.filter((p)=>!fs.existsSync(p));
if (missing.length) { console.error('Missing required skeleton files:', missing); process.exit(1); }
console.log('Skeleton validation passed.');
