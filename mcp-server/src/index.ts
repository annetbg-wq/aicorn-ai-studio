import { createApp } from './app.js';
import { env, repoSlug } from './env.js';

createApp().listen(env.PORT, env.HOST, () => {
  console.log(`[mcp] Superadmin MCP for ${repoSlug()} listening on http://${env.HOST}:${env.PORT}`);
});
