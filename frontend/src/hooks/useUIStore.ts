/**
 * useUIStore — floating panel visibility manager
 * Analytics → right slide-in 480px
 * AgentLab  → centre modal 80% screen
 */

import { useState, useEffect } from 'react';

export interface UIStore {
  showAnalytics:       boolean;
  showAgentLab:        boolean;
  agentLabTask:        string;
  setShowAnalytics:    (v: boolean) => void;
  setShowAgentLab:     (v: boolean) => void;
  openAgentLabWithTask:(task: string) => void;
  closeAll:            () => void;
}

export function useUIStore(): UIStore {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAgentLab,  setShowAgentLab]  = useState(false);
  const [agentLabTask,  setAgentLabTask]  = useState('');

  // Esc closes the topmost open panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showAgentLab)  { setShowAgentLab(false);  return; }
      if (showAnalytics) { setShowAnalytics(false); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAnalytics, showAgentLab]);

  const openAgentLabWithTask = (task: string) => {
    setAgentLabTask(task);
    setShowAnalytics(false);
    setShowAgentLab(true);
  };

  return {
    showAnalytics, setShowAnalytics,
    showAgentLab,  setShowAgentLab,
    agentLabTask,
    openAgentLabWithTask,
    closeAll: () => { setShowAnalytics(false); setShowAgentLab(false); },
  };
}
