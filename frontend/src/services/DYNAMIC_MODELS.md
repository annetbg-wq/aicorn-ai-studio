# Dynamic Model Registry System

## Overview
The system now supports dynamic model discovery from multiple LLM providers with intelligent caching and cost optimization.

## Files

### ModelRegistry.ts
**Purpose**: Fetch and normalize models from different providers

**Supported Providers**:
- OpenRouter: `https://openrouter.ai/api/v1/models`
- Google Gemini: `https://generativelanguage.googleapis.com/v1beta/models`
- Anthropic Claude: `https://api.anthropic.com/v1/models`
- OpenAI: `https://api.openai.com/v1/models`

**Key Functions**:
- `fetchModels(provider, apiKey)` - Fetch models from provider API
- `fetchModelsWithCache(provider, apiKey)` - Cached version (5-minute TTL)
- `clearModelCache()` - Manual cache clear

**Response Normalization**:
- Each provider has different JSON structure
- System converts to standard `{ id, name }` format
- Filters generation models only (Google excludes non-text models)
- Limits results to 50 most relevant models

### ProviderModelSelector.tsx
**Purpose**: Reusable UI component for provider and model selection

**Features**:
- 4-button provider selector with color coding
- Password-masked API key input with edit mode
- Real-time model loading with spinner
- Cached model list prevents repeated API calls
- Responsive layout for dark/light themes

**Props**:
```typescript
provider: 'openrouter' | 'google' | 'anthropic' | 'openai'
apiKey: string
modelId: string
onProviderChange: (provider) => void
onApiKeyChange: (key) => void
onModelChange: (modelId) => void
isDark?: boolean
label?: string
```

## Integration in SettingsModal

### Engine Tab Enhancement
1. **Provider Selection** triggers `loadProviderModels()`
2. **API Key Input** (debounced) triggers model loading on keystroke
3. **Model List** shows:
   - Dynamic models from selected provider (prioritized)
   - Falls back to OpenRouter cached models
   - Loading indicator during fetch

### State Management
```typescript
// Per-provider dynamic models
providerModels: Record<string, {
  models: Model[],
  loading: boolean
}>
```

### Flow
```
User selects Google
  ↓
User enters Google API key
  ↓
loadProviderModels('google', apiKey) called
  ↓
fetchModelsWithCache sends request to Google API
  ↓
Response normalized + cached for 5 minutes
  ↓
Model dropdown populated with Google models
  ↓
User selects model → saved to agentConfigs
```

## Cost Optimization

### Caching Strategy
- **TTL**: 5 minutes per provider:apiKey combination
- **Cache Key**: `provider:apiKey.slice(0,10)` (for privacy)
- **Size**: Unlimited (local JavaScript Map)
- **Clear**: Automatically on session close

### Savings
- Eliminates repeated API calls while user tweaks settings
- Free tier Google models loaded on-demand
- Reduces OpenRouter API hits

## Agent Configuration Flow

### Before (Static OpenRouter)
```
All agents → hardcoded OpenRouter models only
```

### After (Dynamic Multi-Provider)
```
Primary Agent:   Google Gemini (free tier) via dynamic loading
Fix Agent:       Google Gemini (free tier) via dynamic loading
Spec Agent:      Google Gemini (free tier) via dynamic loading
Build Agent:     OpenRouter Qwen (cost-optimized)
QA Agent:        Google Gemini (free tier) via dynamic loading
```

## Usage Examples

### In Agent Config UI
```typescript
// When user selects Google
onClick={() => {
  updateCfg({ provider: 'google', modelId: '' });
  loadProviderModels('google', cfg.apiKey);
}}

// When user enters API key
onChange={e => {
  updateCfg({ apiKey: e.target.value });
  if (e.target.value?.length > 10) {
    loadProviderModels(cfg.provider, e.target.value);
  }
}}
```

### Standalone Component Usage
```tsx
<ProviderModelSelector
  provider={provider}
  apiKey={apiKey}
  modelId={modelId}
  onProviderChange={setProvider}
  onApiKeyChange={setApiKey}
  onModelChange={setModelId}
  isDark={true}
  label="Build Agent Config"
/>
```

## Error Handling

- **Invalid API Key**: Returns empty model list (not an error)
- **Network Issues**: Graceful fallback to OpenRouter models
- **Unsupported Provider**: Returns empty array
- **Rate Limits**: Cached results prevent rapid re-requests

## Browser Compatibility

- Requires `fetch()` API (all modern browsers)
- Works with CORS-enabled provider endpoints
- Can be proxied through backend if CORS issues arise

## Future Enhancements

1. **Custom Provider URLs**: Allow self-hosted models
2. **Advanced Caching**: IndexedDB for persistent cache
3. **Model Metadata**: Context window, pricing, latency info
4. **Batch Fetching**: Pre-load models for all agents
5. **Analytics**: Track which models are actually used
