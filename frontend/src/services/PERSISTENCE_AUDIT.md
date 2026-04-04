# Configuration Persistence Audit

## Current Implementation Status

### ConfigService.ts Architecture
✅ **Immediate-write pattern**: All config is written to localStorage synchronously
- `get(key)` → reads from localStorage (safe try-catch)
- `set(key, value)` → writes to localStorage (safe try-catch)
- No batched useEffect delays (eliminates HMR/refresh data loss)

### Keys Currently Persisted ✅

| Key | ConfigService Method | Read By | Status |
|-----|---------------------|---------|--------|
| `OPENROUTER_API_KEY` | getApiKey() / setApiKey() | useStudio, SettingsModal | ✅ Persisted |
| `SELECTED_MODEL` | getModel() / setModel() | useStudio, SettingsModal | ✅ Persisted |
| `APP_THEME` | getTheme() / setTheme() | App.tsx (data-theme attr) | ✅ Persisted |
| `APP_LANGUAGE` | getLanguage() / setLanguage() | SettingsModal | ✅ Persisted |
| `AUTO_ROUTE` | getAutoRoute() / setAutoRoute() | useStudio | ✅ Persisted |
| `FULL_CONTEXT_MODE` | getFullContext() / setFullContext() | useStudio | ✅ Persisted |
| `ENGINE_API_KEY` | getEngineApiKey() / setEngineApiKey() | useStudio, SettingsModal | ✅ Persisted |
| `ENGINE_MODEL_ID` | getEngineModel() / setEngineModel() | useStudio, SettingsModal | ✅ Persisted |
| `AGENT_CONFIG_{agentId}` | getAgentConfig() / setAgentConfig() | useStudio, SettingsModal | ✅ Persisted |

**Agent Configs** (5 separate keys):
- `AGENT_CONFIG_agent_primary`
- `AGENT_CONFIG_agent_fix`
- `AGENT_CONFIG_agent_spec`
- `AGENT_CONFIG_agent_build`
- `AGENT_CONFIG_agent_qa`

Each stores: `{ provider, apiKey, modelId }` as JSON

### Data-Only Storage (NOT Config) ✅

These are user projects/sessions, not config settings:

| Key | Size | Cleaned On | Status |
|-----|------|-----------|--------|
| `CHAT_HISTORY` | Unbounded | Manual clear | ✅ Persisted via useEffect |
| `LAST_FILES` | Unbounded | Manual clear | ✅ Persisted via useEffect |
| `LAST_CODE` | Unbounded | Manual clear | ✅ Persisted via useEffect |
| `PROJECTS_BANK` | Unbounded | Manual clear | ✅ Persisted via useEffect |
| `CURRENT_PROJECT_ID` | Small | Project switch | ✅ Persisted via useEffect |
| `CHAT_SNAPSHOTS` | Unbounded | Manual clear | ✅ Persisted via useEffect |

---

## Initialization Flow ✅

```
App.tsx mount
  ↓
useStudio() initializes
  ↓
useState initializers call ConfigService.get*()
  ↓
localStorage values loaded into React state
  ↓
User changes setting (e.g., API key)
  ↓
studio.setApiKey() called
  ↓
ConfigService.setApiKey() → localStorage IMMEDIATELY
  ↓
React state updated (callback)
  ↓
useEffect persists data (chat, files, projects)
```

---

## Code Leaks Analysis

### ✅ PROPERLY PERSISTED

**useStudio.ts (lines 272-362)**
```typescript
const setApiKey = useCallback((v: string) => {
  ConfigService.setApiKey(v);           // ✅ ConfigService called
  setApiKeyState(v);
}, []);

const setAgentConfig = useCallback((agentId: string, config: AgentConfig) => {
  ConfigService.setAgentConfig(agentId, config);  // ✅ ConfigService called
  setAgentConfigsState(prev => ({ ...prev, [key]: config }));
}, []);
```

**SettingsModal.tsx (lines 488, 541)**
```typescript
setLocalAgentConfigs(p => ({ ...p, [key]: config }));
setAgentConfig?.(slotDef.agentId, config);  // ✅ Calls studio.setAgentConfig
```

**App.tsx (lines 244-246)**
```typescript
setApiKey={studio.setApiKey}           // ✅ Wrapped by ConfigService
setSelectedModel={studio.setSelectedModel}  // ✅ Wrapped by ConfigService
```

### ⚠️ UNUSED CODE (No Impact)

**ConfigService.ts (lines 143-156)**
```typescript
hydrate() {  // ← DEFINED BUT NEVER CALLED
  return {
    apiKey: this.getApiKey(),
    selectedModel: this.getModel(),
    // ... all config fields
  };
}
```
**Status**: Dead code, doesn't affect persistence since individual getters are used instead.

---

## Potential Issues Identified

### 1. ✅ Agent Configs ARE Persisted
- Each of 5 agents has separate localStorage key
- Updated in real-time via `setAgentConfig()`
- Reloaded on app start from `useState(() => getAgentConfig())`

### 2. ✅ API Keys ARE Persisted
- Main OpenRouter key: `OPENROUTER_API_KEY`
- Engine key: `ENGINE_API_KEY`
- Agent keys: Part of `AGENT_CONFIG_{agentId}` JSON

### 3. ✅ Model Selections ARE Persisted
- Main model: `SELECTED_MODEL`
- Engine model: `ENGINE_MODEL_ID`
- Agent models: Part of `AGENT_CONFIG_{agentId}` JSON

### 4. ⚠️ Provider Selection May Have Issue
- Agent configs store `provider: ApiProvider`
- BUT: SettingsModal initializes localAgentConfigs from agentConfigs
- ON FIRST LOAD: agentConfigs reads from ConfigService (✅ correct)
- ON CHANGE: updateCfg() calls setAgentConfig (✅ correct)
- **Possible issue**: If localStorage is cleared, provider defaults to 'openrouter'

---

## Verification Checklist

- [x] ConfigService uses localStorage (immediate write)
- [x] All setState calls in useStudio wrap ConfigService
- [x] All setState calls in SettingsModal call parent setters
- [x] Parent setters (from useStudio) call ConfigService
- [x] App.tsx passes studio.setters to SettingsModal
- [x] Agent configs stored as separate AGENT_CONFIG_* keys
- [x] Provider field included in AgentConfig JSON
- [x] localStorage.setItem() has error handling
- [x] localStorage.getItem() has fallback defaults
- [ ] hydrate() function is actually used (unused dead code)

---

## Recommendations

### 1. **Remove Unused hydrate() Function**
```typescript
// DELETE from ConfigService.ts (lines 143-156)
// It's defined but never called - just clutter
```

### 2. **Add Provider to hydrate() If Kept**
```typescript
hydrate() {
  return {
    // ... existing fields ...
    agentConfigs: {  // Add this if keeping hydrate()
      primary: this.getAgentConfig('agent_primary'),
      fix:     this.getAgentConfig('agent_fix'),
      spec:    this.getAgentConfig('agent_spec'),
      build:   this.getAgentConfig('agent_build'),
      qa:      this.getAgentConfig('agent_qa'),
    },
  };
}
```

### 3. **Document Provider Defaults**
Add comment in ConfigService:
```typescript
const AGENT_DEFAULTS: Record<string, AgentConfig> = {
  // These are fallback values when localStorage is cleared
  // OR when reading first time (new installation)
  agent_primary: {
    provider: 'openrouter',  // Default: OpenRouter
    apiKey: '',              // Empty: user must provide
    modelId: 'google/gemini-2.5-pro-preview',
  },
  // ...
};
```

### 4. **Add Migration Helper** (Optional)
For when adding new config keys in future:
```typescript
export const migrateConfig = (oldKey: string, newKey: string) => {
  const value = get(oldKey);
  if (value) {
    set(newKey, value);
    try { localStorage.removeItem(oldKey); } catch {}
  }
};
```

---

## Summary

✅ **Configuration IS being persisted correctly** between page reloads.

**All paths verified**:
1. Settings Modal → studio setters → ConfigService → localStorage ✅
2. useStudio initialization → ConfigService.get*() → localStorage ✅
3. Agent configs → AGENT_CONFIG_* keys → localStorage ✅

**No data loss should occur** unless localStorage is manually cleared by:
- Browser privacy/data clearing
- DevTools Application tab clear
- Third-party storage cleaners

**Dead code identified but harmless**: `hydrate()` function defined but unused.

