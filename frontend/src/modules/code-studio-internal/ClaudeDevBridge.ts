const BRIDGE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';

export type DevAgentProvider = 'off' | 'claude' | 'codex';

export interface BridgeResponse {
  text: string;
  sessionId: string;
  messageCount: number;
}

export interface ModeStatus {
  provider: DevAgentProvider;
  claudeMode: boolean;
  claudeAvailable: boolean;
  codexAvailable?: boolean;
  providers?: {
    claude?: { available: boolean; version: string | null; reason?: string };
    codex?: { available: boolean; version: string | null; reason?: string };
  };
  activeProvider: string;
  updatedAt: string;
}

/**
 * Send a message to the active dev-agent backend and return text with session metadata.
 * Throws an Error with a description if the request fails.
 */
export async function callDevAgentBridge(
  message: string,
  sessionId: string | null,
  model: string = 'claude-sonnet-4-6',
  system?: string,
): Promise<BridgeResponse> {
  const response = await fetch(`${BRIDGE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, model, system }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  return {
    text: data.content?.[0]?.text ?? '',
    sessionId: data.sessionId,
    messageCount: data.messageCount,
  };
}

/**
 * Check local CLI availability.
 */
export async function getDevAgentCliStatus(): Promise<{
  claude: { available: boolean; version: string | null; reason?: string };
  codex: { available: boolean; version: string | null; reason?: string };
}> {
  try {
    const r = await fetch(`${BRIDGE_URL}/token`);
    const d = await r.json();
    return {
      claude: {
        available: !!d?.claude?.available,
        version: d?.claude?.version ?? null,
        reason: d?.claude?.reason ?? '',
      },
      codex: {
        available: !!d?.codex?.available,
        version: d?.codex?.version ?? null,
        reason: d?.codex?.reason ?? '',
      },
    };
  } catch {
    return {
      claude: { available: false, version: null, reason: 'bridge_unreachable' },
      codex: { available: false, version: null, reason: 'bridge_unreachable' },
    };
  }
}

export async function getDevAgentMode(): Promise<ModeStatus> {
  try {
    const r = await fetch(`${BRIDGE_URL}/dev-agent-mode`);
    return await r.json();
  } catch {
    return {
      provider: 'off',
      claudeMode: false,
      claudeAvailable: false,
      codexAvailable: false,
      activeProvider: 'Standard Agents',
      updatedAt: '',
    };
  }
}

export async function setDevAgentMode(provider: DevAgentProvider): Promise<ModeStatus> {
  const r = await fetch(`${BRIDGE_URL}/dev-agent-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  if (!r.ok) throw new Error('Failed to set mode');
  return await r.json();
}

// Legacy aliases kept to minimize refactor churn in callers that still import old names.
export const callClaudeBridge = callDevAgentBridge;
export const checkClaudeAvailable = async () => {
  const status = await getDevAgentCliStatus();
  return { available: status.claude.available, version: status.claude.version ?? '' };
};
export const getClaudeMode = getDevAgentMode;
export const toggleClaudeMode = async () => {
  const mode = await getDevAgentMode();
  return setDevAgentMode(mode.provider === 'claude' ? 'off' : 'claude');
};

export async function createSession(
  idea?: string,
  stack?: string,
  features?: string[],
): Promise<{ sessionId: string; projectSummary: any }> {
  const r = await fetch(`${BRIDGE_URL}/sessions/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, stack, features }),
  });
  if (!r.ok) throw new Error('Failed to create session');
  return await r.json();
}
