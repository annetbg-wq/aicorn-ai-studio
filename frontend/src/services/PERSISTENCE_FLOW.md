# Configuration Persistence Flow Diagram

## Happy Path: Settings Persist ✅

```
┌─────────────────────────────────────────────────────────────────────┐
│ USER CHANGES API KEY IN SETTINGS MODAL                              │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SettingsModal.tsx (line 250)                                        │
│ onClick={() => { setApiKey(localKey); ... }}                       │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ App.tsx (line 244)                                                  │
│ setApiKey={studio.setApiKey}  ← prop passed from useStudio         │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ useStudio.ts (lines 272-275)                                        │
│ const setApiKey = useCallback((v: string) => {                     │
│   ConfigService.setApiKey(v);         ← ✅ WRITE TO localStorage    │
│   setApiKeyState(v);                  ← Update React state          │
│ }, []);                                                             │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ ConfigService.ts (line 66)                                          │
│ setApiKey(v: string): void {                                       │
│   set(K.API_KEY, v);  ← Write to localStorage immediately          │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ ConfigService.ts (line 55-56)                                       │
│ function set(key: string, value: string): void {                   │
│   try { localStorage.setItem(key, value); } catch {}  ← PERSISTED   │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ ✅ SAVED TO localStorage WITH KEY: "OPENROUTER_API_KEY"            │
│ Value: "sk-or-v1-xxxx..." (user's new API key)                    │
│                                                                     │
│ Persists across:                                                   │
│ • Page refresh                                                     │
│ • Browser close/reopen                                             │
│ • HMR during development                                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## On App Startup: Config Restored ✅

```
┌─────────────────────────────────────────────────────────────────────┐
│ User opens / refreshes app                                          │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ App.tsx (line 19)                                                   │
│ const studio = useStudio();  ← Initialize hook                      │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ useStudio.ts (lines 264-265)                                        │
│ const [apiKey, setApiKeyState] = useState(() =>                    │
│   ConfigService.getApiKey()  ← ✅ READ FROM localStorage            │
│ );                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ ConfigService.ts (line 65)                                          │
│ getApiKey(): string {                                              │
│   return get(K.API_KEY) ?? '';  ← Read with fallback ''             │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ ConfigService.ts (line 51-53)                                       │
│ function get(key: string): string | null {                         │
│   try { return localStorage.getItem(key); }  ← ✅ RESTORED!         │
│   catch { return null; }                                            │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ ✅ apiKey state initialized with saved value:                      │
│ "sk-or-v1-xxxx..." (same key from previous session)                │
│                                                                     │
│ Now available throughout app via:                                  │
│ • studio.apiKey (React state)                                      │
│ • Passed to SettingsModal as prop                                  │
│ • Used in LLM API calls                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Agent Configs: Same Pattern ✅

```
┌──────────────────────────────────────────────────────────────────────┐
│ User changes agent config in SettingsModal                           │
│ (e.g., selects Google provider for Spec Agent)                      │
└──────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│ SettingsModal.tsx (line 541)                                         │
│ setAgentConfig?.(slot.agentId, next);  ← Call parent setter         │
└──────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│ useStudio.ts (lines 358-362)                                         │
│ const setAgentConfig = useCallback((agentId: string, config) => {  │
│   ConfigService.setAgentConfig(agentId, config);  ← ✅ PERSIST      │
│   setAgentConfigsState(prev => ({                                  │
│     ...prev, [key]: config                                          │
│   }));                                                              │
│ }, []);                                                             │
└──────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│ ConfigService.ts (lines 133-135)                                     │
│ setAgentConfig(agentId: string, config: AgentConfig): void {        │
│   set(`AGENT_CONFIG_${agentId}`, JSON.stringify(config));           │
│   // Stored as: AGENT_CONFIG_agent_spec                             │
│   // Value: {"provider":"google","apiKey":"...","modelId":"..."}    │
│ }                                                                    │
└──────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│ ✅ PERSISTED TO localStorage:                                       │
│ KEY: "AGENT_CONFIG_agent_spec"                                      │
│ VALUE: {"provider":"google","apiKey":"AIza...","modelId":"..."}    │
│                                                                      │
│ On next startup, line 337-340 in useStudio loads all 5 agents       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Complete Config Key Map

```
┌─ OPENROUTER_API_KEY ─────────┐     ┌─ APP_THEME ───────────┐
│ sk-or-v1-xxxxx              │     │ 'dark' | 'medium'     │
│                             │     │      | 'light'        │
│ setApiKey()                 │     │ setTheme()            │
│ studio.apiKey               │     │ studio.theme          │
└─────────────────────────────┘     └───────────────────────┘

┌─ SELECTED_MODEL ──────────────┐     ┌─ AUTO_ROUTE ──────────┐
│ 'google/gemini-2.5-...'       │     │ 'true' | 'false'      │
│                               │     │                       │
│ setSelectedModel()            │     │ setAutoRoute()        │
│ studio.selectedModel          │     │ studio.autoRoute      │
└───────────────────────────────┘     └───────────────────────┘

┌─ ENGINE_API_KEY ──────────────┐     ┌─ ENGINE_MODEL_ID ─────┐
│ sk-ant-xxx | (empty)          │     │ 'anthropic/claude-... │
│                               │     │                       │
│ setEngineApiKey()             │     │ setEngineModel()      │
│ studio.engineApiKey           │     │ studio.engineModelId  │
└───────────────────────────────┘     └───────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ AGENT_CONFIG_agent_primary                                  │
│ { "provider": "openrouter",                                 │
│   "apiKey": "sk-or-v1-...",                                 │
│   "modelId": "google/gemini-2.5-pro-preview" }              │
│                                                             │
│ AGENT_CONFIG_agent_fix                                      │
│ { "provider": "openrouter",                                 │
│   "apiKey": "sk-or-v1-...",                                 │
│   "modelId": "google/gemini-2.0-flash-001" }                │
│                                                             │
│ AGENT_CONFIG_agent_spec                                     │
│ { "provider": "google",                                     │
│   "apiKey": "AIzaS...",                                     │
│   "modelId": "gemini-2.0-flash" }                           │
│                                                             │
│ AGENT_CONFIG_agent_build                                    │
│ { "provider": "openrouter",                                 │
│   "apiKey": "sk-or-v1-...",                                 │
│   "modelId": "qwen/qwen-vl-plus" }                          │
│                                                             │
│ AGENT_CONFIG_agent_qa                                       │
│ { "provider": "google",                                     │
│   "apiKey": "AIzaS...",                                     │
│   "modelId": "gemini-2.0-flash" }                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Verification Tests

### Test 1: API Key Persistence ✅
```
1. Set API key to "sk-or-test-123" in Settings
2. Refresh page (F5)
3. Check SettingsModal → should show "sk-or-test-**3" (masked)
4. Check console: console.log(studio.apiKey) → "sk-or-test-123"
5. Open DevTools → Application → localStorage
   Look for: OPENROUTER_API_KEY = "sk-or-test-123"
```

### Test 2: Agent Config Persistence ✅
```
1. In Settings Engine tab:
   - Select Spec Agent
   - Change provider to "google"
   - Paste Google API key
   - Observe models load from Google API
2. Refresh page (F5)
3. Open Spec Agent config again
   - Provider should still be "google"
   - API key should still be set
   - Models should show Google models
4. Open DevTools → Application → localStorage
   Look for: AGENT_CONFIG_agent_spec = {"provider":"google",...}
```

### Test 3: Multiple Agent Configs ✅
```
1. Configure all 5 agents with different providers
2. Refresh page
3. Check each agent in Settings → all configs restored
4. Verify in localStorage:
   - AGENT_CONFIG_agent_primary
   - AGENT_CONFIG_agent_fix
   - AGENT_CONFIG_agent_spec
   - AGENT_CONFIG_agent_build
   - AGENT_CONFIG_agent_qa
```

---

## If Settings are NOT Persisting

### Common Causes:
1. **localStorage disabled** → check browser privacy settings
2. **localStorage quota exceeded** → clear old data (CHAT_HISTORY, etc.)
3. **Private/Incognito mode** → uses in-memory storage, cleared on close
4. **Browser extensions** → some block localStorage access
5. **localStorage manually cleared** → DevTools → Application → Clear

### How to Verify localStorage Works:
```javascript
// In browser console:
localStorage.setItem('TEST_KEY', 'test_value');
console.log(localStorage.getItem('TEST_KEY'));  // Should print: test_value
localStorage.removeItem('TEST_KEY');
```

### If Still Not Working:
- Check browser console for errors
- Check that setItem/getItem don't throw exceptions
- ConfigService.ts already has try-catch, so errors are silent
- Try in Incognito mode (rules out extensions)
