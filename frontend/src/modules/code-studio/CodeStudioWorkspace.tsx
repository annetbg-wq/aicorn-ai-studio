/**
 * CodeStudioWorkspace — Stability Terminal (DevModePanel) only.
 * Editor and preview live in System Engine.
 */

import React from 'react';
import { DevModePanel } from '../code-studio-internal';

// ── Types ────────────────────────────────────────────────────────────────────

type FileMap = Record<string, string>;

interface CodeStudioWorkspaceProps {
  theme: 'dark' | 'medium' | 'light';
  files: FileMap;
  setFiles: (f: FileMap) => void;
  activeFile: string;
  setActiveFile: (f: string) => void;
  apiKey: string;
  addLog: (msg: string, level?: 'info' | 'warn' | 'error') => void;
  initialInput?: string;
  onBack: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

const CodeStudioWorkspace: React.FC<CodeStudioWorkspaceProps> = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      overflow: 'hidden',
      background: '#0f0f1a',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: '#13131d',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#a78bfa',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          ⚙ Stability Terminal
        </span>
        <span style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
        }}>
          Admin — Dev Tools
        </span>
      </div>

      {/* DevModePanel full height */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DevModePanel />
      </div>
    </div>
  );
};

export default CodeStudioWorkspace;
