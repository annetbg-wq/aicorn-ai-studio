import { initWorkspace } from './frontend/src/services/WorkspaceInitializer';

async function testWorkspaceInit() {
  console.log('Testing workspace initialization...');
  try {
    const registry = await initWorkspace();
    console.log('✅ Workspace initialized successfully');
    console.log('Registry version:', registry.version);
    console.log('Projects count:', registry.projects.length);
    console.log('Last sync:', registry.lastSync);
    
    // Check if registry.json was created/updated
    const fs = await import('fs');
    const registryPath = 'public/registry.json';
    if (fs.existsSync(registryPath)) {
      const content = fs.readFileSync(registryPath, 'utf-8');
      const parsed = JSON.parse(content);
      console.log('✅ registry.json exists and is valid JSON');
      console.log('Projects in file:', parsed.projects.length);
    } else {
      console.log('❌ registry.json not found');
    }
  } catch (error) {
    console.error('❌ Error during workspace initialization:', error);
  }
}

testWorkspaceInit();