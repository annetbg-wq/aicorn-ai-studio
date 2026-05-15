/**
 * useSettingsState — API keys, model selection, theme, auto-route, and agent configs.
 *
 * Extracted from useStudio so that settings changes (which are rare) don't
 * trigger re-renders in chat/preview/figma domains.
 */

import { useState, useCallback } from 'react';
import { ConfigService } from '../services/ConfigService';
import type { AgentConfig } from '../services/ConfigService';

export function useSettingsState() {
  const [apiKey,          setApiKeyState]     = useState(() => ConfigService.getApiKey());
  const [selectedModel,   setModelState]      = useState(() => ConfigService.resolveModel('chat'));
  const [theme,           setThemeState]      = useState<'dark' | 'medium' | 'light'>(() => ConfigService.getTheme());
  const [fullContextMode, setFullCtxState]    = useState(() => ConfigService.getFullContext());
  const [autoRoute,       setAutoRouteRaw]    = useState<boolean>(() => ConfigService.getAutoRoute());
  const [appLanguage,     setAppLanguageRaw]  = useState<string>(() => ConfigService.getLanguage());

  // ── 5-agent system ────────────────────────────────────────────────────────
  const [agentConfigs, setAgentConfigsState] = useState(() => ({
    primary: ConfigService.getAgentConfig('agent_primary'),
    fix:     ConfigService.getAgentConfig('agent_fix'),
    spec:    ConfigService.getAgentConfig('agent_spec'),
    build:   ConfigService.getAgentConfig('agent_build'),
    qa:      ConfigService.getAgentConfig('agent_qa'),
  }));

  // ── Immediate-write setters ───────────────────────────────────────────────

  const setApiKey = useCallback((v: string) => {
    ConfigService.setApiKey(v);
    setApiKeyState(v);
  }, []);

  const setSelectedModel = useCallback((v: string) => {
    setModelState(v);
    try { localStorage.setItem('SELECTED_MODEL', v); } catch { /* ignore */ }
  }, []);

  const setTheme = useCallback((v: 'dark' | 'medium' | 'light') => {
    ConfigService.setTheme(v);
    setThemeState(v);
  }, []);

  const setFullContextMode = useCallback((v: boolean) => {
    ConfigService.setFullContext(v);
    setFullCtxState(v);
  }, []);

  const setAutoRoute = useCallback((v: boolean) => {
    ConfigService.setAutoRoute(v);
    setAutoRouteRaw(v);
  }, []);

  const setAppLanguage = useCallback((lang: string) => {
    ConfigService.setLanguage(lang);
    setAppLanguageRaw(lang);
  }, []);

  const setAgentConfig = useCallback((agentId: string, config: AgentConfig) => {
    ConfigService.setAgentConfig(agentId, config);
    const key = agentId.replace('agent_', '') as keyof typeof agentConfigs;
    setAgentConfigsState(prev => ({ ...prev, [key]: config }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshFromConfig = useCallback(() => {
    setModelState(ConfigService.resolveModel('chat'));
    setFullCtxState(ConfigService.getFullContext());
    setAutoRouteRaw(ConfigService.getAutoRoute());
    setAgentConfigsState({
      primary: ConfigService.getAgentConfig('agent_primary'),
      fix:     ConfigService.getAgentConfig('agent_fix'),
      spec:    ConfigService.getAgentConfig('agent_spec'),
      build:   ConfigService.getAgentConfig('agent_build'),
      qa:      ConfigService.getAgentConfig('agent_qa'),
    });
  }, []);

  return {
    apiKey, setApiKey,
    selectedModel, setSelectedModel,
    theme, setTheme,
    fullContextMode, setFullContextMode,
    autoRoute, setAutoRoute,
    appLanguage, setAppLanguage,
    agentConfigs, setAgentConfig,
    refreshFromConfig,
  } as const;
}
