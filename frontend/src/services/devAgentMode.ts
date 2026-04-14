export type DevAgentProvider = 'off' | 'claude' | 'codex';

export interface DevAgentModeStatus {
  provider?: DevAgentProvider;
  claudeMode?: boolean;
}

const PROVIDER_KEY = 'superadmin_dev_agent_provider';
const LEGACY_CLAUDE_KEY = 'admin_claude_max';
const CHANGE_EVENT = 'aic:dev-agent-provider-changed';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function getLocalDevAgentProvider(): DevAgentProvider {
  if (!isBrowser()) return 'off';

  const provider = localStorage.getItem(PROVIDER_KEY);
  if (provider === 'off' || provider === 'claude' || provider === 'codex') {
    return provider;
  }

  return localStorage.getItem(LEGACY_CLAUDE_KEY) === 'true' ? 'claude' : 'off';
}

export function setLocalDevAgentProvider(provider: DevAgentProvider): void {
  if (!isBrowser()) return;

  localStorage.setItem(PROVIDER_KEY, provider);
  localStorage.setItem(LEGACY_CLAUDE_KEY, String(provider === 'claude'));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { provider } }));
}

export function syncLocalDevAgentMode(status: DevAgentModeStatus | null | undefined): DevAgentProvider {
  const provider = status?.provider === 'off' || status?.provider === 'claude' || status?.provider === 'codex'
    ? status.provider
    : status?.claudeMode
      ? 'claude'
      : 'off';

  setLocalDevAgentProvider(provider);
  return provider;
}

export function isLocalDevAgentEnabled(): boolean {
  return getLocalDevAgentProvider() !== 'off';
}

export function getDevAgentChangeEventName(): string {
  return CHANGE_EVENT;
}
