# Model Registry Diagnostic Guide

## Added Console Logging

Logging has been added to trace the entire flow of loading models from different providers.

### Log Locations

1. **SettingsModal.tsx** - Agent configuration panel
   - Provider button clicks
   - API key input changes
   - `loadProviderModels()` function calls

2. **ModelRegistry.ts** - Core model loading service
   - `fetchModels()` - Raw API calls
   - `fetchModelsWithCache()` - Cache hits/misses
   - Response parsing per provider

---

## Testing Steps

### Step 1: Open Browser DevTools
```
Press F12 (or Ctrl+Shift+I)
Go to Console tab
Clear any existing logs
```

### Step 2: Open Settings Modal
```
Click Settings button in app
Go to Engine tab
Find one of the 5 agent cards (e.g., Spec Agent)
Click to expand it
```

### Step 3: Test Google Provider

**3a. Test with NO API Key**
```
1. Click "Google Gemini" provider button
2. Check console output:

Expected logs:
[SettingsModal] User clicked provider: google for spec
[SettingsModal] No API key for google, skipping model load
```

**3b. Test with API Key (Short)**
```
1. Paste short text in API key field: "test123"
2. Check console output:

Expected logs:
[SettingsModal] API key changed for spec, length=7
[SettingsModal] API key too short (7), not loading models yet
```

**3c. Test with Real Google API Key**
```
1. Get a valid Google API key from https://aistudio.google.com/apikey
2. Paste full key in API key field
3. Check console output:

Expected logs sequence:
[SettingsModal] API key changed for spec, length=XX
[SettingsModal] API key length XX > 10, loading models for google...
[ModelRegistry] Fetching google models...
[ModelRegistry] API key present: true
[ModelRegistry] API key length: XX
[ModelRegistry] Fetch URL: https://generativelanguage.googleapis.com/v1beta/models...
[ModelRegistry] Response status: 200
[ModelRegistry] Raw response type: object Object.keys: ["models","nextPageToken"]
[ModelRegistry] Parsing Google response...
[ModelRegistry] Raw models count: XX
[ModelRegistry] After filter: YY models
[ModelRegistry] Final parsed count: YY
[ModelRegistry] First Google model: {id: "gemini-2.0-flash", name: "Gemini 2.0 Flash"}
[SettingsModal] ✅ Received YY models for google
[SettingsModal] Sample models: [...]
```

---

## What Each Log Message Means

### From SettingsModal

```log
[SettingsModal] User clicked provider: google for spec
→ User selected Google provider for Spec Agent
```

```log
[SettingsModal] API key exists, loading models for google...
→ User has API key, attempting to fetch models
```

```log
[SettingsModal] loadProviderModels called: provider=google, apiKey present=true
→ Function called with valid inputs
```

```log
[SettingsModal] Setting loading state for google...
→ UI spinner should appear now
```

```log
[SettingsModal] Calling fetchModelsWithCache for google...
→ About to query the API
```

```log
[SettingsModal] ✅ Received 30 models for google
→ SUCCESS: Models loaded and displayed
```

```log
[SettingsModal] ⚠️ Zero models returned for google
→ API call succeeded but returned no models (check API key scope)
```

```log
[SettingsModal] ❌ Error loading google models: ...
→ Network error or API error (see error message)
```

### From ModelRegistry

```log
[ModelRegistry] Fetching google models...
→ Starting the fetch operation
```

```log
[ModelRegistry] API key present: true
[ModelRegistry] API key length: 39
→ API key validation passed
```

```log
[ModelRegistry] Fetch URL: https://generativelanguage.googleapis.com/v1beta/models...
→ Correct endpoint being used
```

```log
[ModelRegistry] Response status: 200
→ HTTP request succeeded
```

```log
[ModelRegistry] Response status: 401
→ PROBLEM: Invalid API key or insufficient permissions
```

```log
[ModelRegistry] Response status: 403
→ PROBLEM: Forbidden - API key not allowed for this operation
```

```log
[ModelRegistry] Response status: 429
→ PROBLEM: Rate limited - too many requests
```

```log
[ModelRegistry] Parsing Google response...
[ModelRegistry] Raw models count: 45
[ModelRegistry] After filter: 30 models
→ Found 45 total models, 30 support text generation
```

```log
[ModelRegistry] ✅ Cache hit for google (30 models)
→ Used cached results (won't hit API again for 5 minutes)
```

```log
[ModelRegistry] Cache expired for google, fetching fresh...
→ Previous cache expired, fetching new data
```

---

## Common Issues & Solutions

### Issue 1: No logs appear after clicking provider

**Cause**: Provider button click not being detected

**Solution**:
```
1. Check that you're clicking the colored provider buttons
2. Make sure Settings modal is fully open
3. Check browser console is recording
4. Try refreshing page (F5)
```

### Issue 2: Logs show "API key present: false"

**Cause**: API key input is empty

**Solution**:
```
1. Click API key input field
2. Paste your Google API key from https://aistudio.google.com/apikey
3. Ensure full key is pasted (should start with AIza...)
4. Wait for "loading..." indicator
```

### Issue 3: Response status 401

**Cause**: Invalid or expired API key

**Solution**:
```
1. Go to https://aistudio.google.com/apikey
2. Create new API key or verify existing one
3. Copy full key (check you got entire thing)
4. Paste in SettingsModal
5. Make sure key has "Generative Language API" enabled
```

### Issue 4: Response status 403

**Cause**: API key doesn't have permission for this operation

**Solution**:
```
1. Go to https://console.cloud.google.com/
2. Find your project
3. Enable "Generative Language API"
4. Regenerate API key if needed
```

### Issue 5: Models returned but not displaying in dropdown

**Cause**: Models loaded but UI not updating

**Solution**:
```
1. Check console shows "Received XX models for google"
2. Look for first model in logs - check format is correct
3. Try scrolling down model dropdown
4. Check if loading spinner is stuck (might indicate error)
5. Try different model selector (some agents use different code path)
```

### Issue 6: Getting "After filter: 0 models"

**Cause**: Returned models don't support text generation

**Solution**:
```
1. This means API returned models but they're not text models
2. Check Google API types - might be vision-only models
3. Verify API key has access to generative models
4. Try using https://aistudio.google.com/app/apikey instead
```

---

## Debug Console Commands

You can run these in the browser console to inspect state:

```javascript
// Check cache contents
const cacheMap = new Map();  // This is simplified, but shows concept
console.log('Cache keys:', Array.from(cacheMap.keys()));

// Clear cache manually
localStorage.clear();  // Clears entire localStorage

// Check localStorage for config
console.log('Google config:', localStorage.getItem('AGENT_CONFIG_agent_spec'));

// Check if ModelRegistry module exists
import { fetchModelsWithCache } from './services/ModelRegistry.ts';
console.log('ModelRegistry loaded:', typeof fetchModelsWithCache);
```

---

## Expected Console Output (Complete Example)

When successfully loading Google models for Spec Agent:

```
[SettingsModal] User clicked provider: google for spec
[SettingsModal] API key exists, loading models for google...
[SettingsModal] Setting loading state for google...
[SettingsModal] Calling fetchModelsWithCache for google...
[ModelRegistry] Fetching google models...
[ModelRegistry] API key present: true
[ModelRegistry] API key length: 39
[ModelRegistry] Fetch URL: https://generativelanguage.googleapis.com/v1beta/models...
[ModelRegistry] Headers: ["Authorization","Content-Type"]
[ModelRegistry] Response status: 200
[ModelRegistry] Raw response type: object Object.keys: ["models","nextPageToken"]
[ModelRegistry] Parsing Google response...
[ModelRegistry] Raw models count: 45
[ModelRegistry] Filtered out models/gemini-1.5-pro-vision (no generateContent)
[ModelRegistry] After filter: 30 models
[ModelRegistry] Final parsed count: 30
[ModelRegistry] First Google model: {id: "gemini-2.0-flash", name: "Gemini 2.0 Flash"}
[ModelRegistry] Caching 30 models for google
[SettingsModal] ✅ Received 30 models for google
[SettingsModal] Sample models: Array(3) [
  {id: "gemini-2.0-flash", name: "Gemini 2.0 Flash"},
  {id: "gemini-1.5-pro", name: "Gemini 1.5 Pro"},
  {id: "gemini-1.5-flash", name: "Gemini 1.5 Flash"}
]
```

---

## Copy-Paste Log Checklist

When collecting logs for debugging, make sure you have:

- [ ] "[SettingsModal] User clicked provider:" - Shows provider was selected
- [ ] "[ModelRegistry] Fetching google models:" - Shows fetch started
- [ ] "[ModelRegistry] Response status:" - Shows HTTP response (200 is good)
- [ ] "[ModelRegistry] Raw models count:" - Shows raw API response
- [ ] "[ModelRegistry] After filter:" - Shows filtered count
- [ ] "[SettingsModal] ✅ Received" OR "[SettingsModal] ❌ Error" - Shows final result

If any of these are missing, the process stopped at that step.

---

## Report Template

If you need to report an issue, include:

```
1. Browser: [Chrome/Firefox/Safari/Edge]
2. OS: [Windows/Mac/Linux]
3. Provider: [google/openrouter/anthropic/openai]
4. API Key present: [yes/no]
5. API Key type: [Google/OpenRouter/etc]

Console output (copy from DevTools):
[paste logs here]

Expected behavior:
[what should happen]

Actual behavior:
[what happened instead]
```

---

## Tips for Debugging

1. **Keep console open while testing** - Logs are visible in real-time
2. **Scroll console up** - First log appears at the top
3. **Use filters** - Type `[ModelRegistry]` in console filter to see only those logs
4. **Check network tab** - DevTools Network tab shows actual HTTP requests
5. **Refresh before testing** - Press F5 to clear old logs
6. **Test one provider at a time** - Change to Google, test completely, then try others

