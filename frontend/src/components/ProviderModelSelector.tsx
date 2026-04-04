/**
 * ProviderModelSelector — Dynamic provider & model selection with live loading.
 * Fetches available models from selected provider.
 */

import React, { useState, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { fetchModelsWithCache, Model } from '../services/ModelRegistry';

interface ProviderModelSelectorProps {
  provider: 'openrouter' | 'google' | 'anthropic' | 'openai';
  apiKey: string;
  modelId: string;
  onProviderChange: (provider: 'openrouter' | 'google' | 'anthropic' | 'openai') => void;
  onApiKeyChange: (key: string) => void;
  onModelChange: (modelId: string) => void;
  label?: string;
  isDark?: boolean;
}

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', color: '#60a5fa' },
  { id: 'google', name: 'Google Gemini', color: '#34d399' },
  { id: 'anthropic', name: 'Anthropic Claude', color: '#a78bfa' },
  { id: 'openai', name: 'OpenAI GPT', color: '#f59e0b' },
] as const;

export const ProviderModelSelector: React.FC<ProviderModelSelectorProps> = ({
  provider,
  apiKey,
  modelId,
  onProviderChange,
  onApiKeyChange,
  onModelChange,
  label = 'Agent Configuration',
  isDark = true,
}) => {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);

  const bgColor = isDark ? '#111114' : '#f9fafb';
  const borderColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#fff' : '#000';
  const secondaryText = isDark ? '#888' : '#555';

  // Load models when provider or API key changes
  useEffect(() => {
    if (!apiKey) {
      setModels([]);
      return;
    }

    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
        const loaded = await fetchModelsWithCache(provider, apiKey);
        setModels(loaded);
      } finally {
        setIsLoadingModels(false);
      }
    };

    const timer = setTimeout(loadModels, 500); // Debounce
    return () => clearTimeout(timer);
  }, [provider, apiKey]);

  const providerInfo = PROVIDERS.find(p => p.id === provider);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Label */}
      {label && (
        <div style={{ fontSize: 11, fontWeight: 700, color: secondaryText, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </div>
      )}

      {/* Provider Selector */}
      <div>
        <label style={{ fontSize: 11, color: secondaryText, marginBottom: 6, display: 'block', fontWeight: 600 }}>
          Provider
        </label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
        }}>
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => onProviderChange(p.id)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: `2px solid ${provider === p.id ? p.color : borderColor}`,
                background: provider === p.id ? `${p.color}15` : bgColor,
                color: provider === p.id ? p.color : textColor,
                fontWeight: provider === p.id ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
                transition: '0.2s',
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* API Key Input */}
      <div>
        <label style={{ fontSize: 11, color: secondaryText, marginBottom: 6, display: 'block', fontWeight: 600 }}>
          API Key
        </label>
        {!showApiKeyInput && apiKey ? (
          <div style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: bgColor,
            border: `1px solid ${borderColor}`,
            color: secondaryText,
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'monospace',
          }}>
            <span>{'•'.repeat(apiKey.length - 4) + apiKey.slice(-4)}</span>
            <button
              onClick={() => setShowApiKeyInput(true)}
              style={{
                background: 'none',
                border: 'none',
                color: providerInfo?.color,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              EDIT
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={tempApiKey}
              onChange={e => setTempApiKey(e.target.value)}
              placeholder="Paste API key…"
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 10,
                background: bgColor,
                border: `1px solid ${borderColor}`,
                color: textColor,
                fontSize: 12,
                outline: 'none',
              }}
            />
            <button
              onClick={() => {
                onApiKeyChange(tempApiKey);
                setShowApiKeyInput(false);
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: providerInfo?.color + '20',
                border: `1px solid ${providerInfo?.color}`,
                color: providerInfo?.color,
                fontWeight: 700,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              OK
            </button>
          </div>
        )}
      </div>

      {/* Model Selector */}
      <div>
        <label style={{ fontSize: 11, color: secondaryText, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          Model
          {isLoadingModels && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
        </label>
        {models.length > 0 ? (
          <select
            value={modelId}
            onChange={e => onModelChange(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              background: bgColor,
              border: `1px solid ${borderColor}`,
              color: textColor,
              fontSize: 12,
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${isDark ? '%23888' : '%23555'}' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
              backgroundSize: '18px',
              paddingRight: '32px',
            }}
          >
            <option value="">— Select model —</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : apiKey ? (
          <div style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${borderColor}`,
            color: secondaryText,
            fontSize: 11,
            textAlign: 'center',
          }}>
            {isLoadingModels ? 'Loading models…' : 'No models found'}
          </div>
        ) : (
          <div style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${borderColor}`,
            color: secondaryText,
            fontSize: 11,
            textAlign: 'center',
          }}>
            Add API key to load models
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
