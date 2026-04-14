/**
 * StudioToast — lightweight floating toast notifications.
 *
 * Listens for 'studio-toast' CustomEvents fired by services via toastBus.ts.
 * Mount once in App.tsx — no providers needed.
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { StudioToastEvent } from '../services/toastBus';

interface Toast {
  id: number;
  message: string;
  level: 'info' | 'warn' | 'error';
}

let _nextId = 0;

const LEVEL_BG: Record<string, string> = {
  info:  '#2563eb',
  warn:  '#d97706',
  error: '#dc2626',
};

const AUTO_DISMISS_MS = 5000;

export const StudioToast: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, level } = (e as CustomEvent<StudioToastEvent>).detail;
      const id = ++_nextId;
      setToasts(prev => [...prev.slice(-4), { id, message, level }]); // keep max 5
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    };
    window.addEventListener('studio-toast', handler);
    return () => window.removeEventListener('studio-toast', handler);
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 99999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "'Inter', system-ui, sans-serif",
            color: '#fff',
            background: LEVEL_BG[t.level] ?? LEVEL_BG.info,
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            maxWidth: 380,
            lineHeight: 1.45,
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
};
