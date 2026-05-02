/**
 * AgentLabPanel — Split Layout v2
 * Left: task form + session list  |  Right: Live Agent Console
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlaskConical, Play, Check, X, ChevronDown, ChevronUp,
  Loader2, FileText, Zap, PlayCircle, Send, Terminal, Bot,
} from 'lucide-react';
import { AgentLoopService, estimateBudget } from '../services/AgentLoopService';
import type { AgentSession, AgentSessionStatus, TokenBudget } from '../services/AgentLoopService';
import type { AgentConfig } from '../services/ConfigService';
import { ConfigService } from '../services/ConfigService';
import { BenchmarkGate, type GateVerdict } from '../services/benchmark/BenchmarkGate';
import { STUDIO_MODULES } from '../config/studioModules';
import { supabase } from '../lib/supabase';
import { SandpackView } from './SandpackPreview';
import { StudioTerminal, type LogEntry } from './StudioTerminal';
import { ModelEfficiencyPanel } from './ModelEfficiencyPanel';
import { ModelEfficiencyPanel } from './ModelEfficiencyPanel';

type FileMap = Record<string, string>;

// ── Chat message ──────────────────────────────────────────────────────────────

interface ChatMessage {
  id:      string;
  time:    string;
  icon:    string;
  text:    string;
  isUser?: boolean;
}

function uid():  string { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function nowTs(): string { return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

const PHASE_ICON: Record<string, string> = {
  pending:              '🔍',
  spec_review:          '✅',
  clarifying:           '❓',
  needs_clarification:  '❓',
  building:             '🔨',
  qa_review:            '🔬',
  ready:                '🎉',
  paused:               '⏸',
  applied:              '✓',
  merged:               '🔗',
  rejected:             '❌',
  partial_success:      '🔶',
  warn:                 '⚠️',
  error:                '🚨',
};

// ── Status metadata ──────────────────────────────────────────────────────────

const STATUS_META: Record<AgentSessionStatus, { label: string; color: string; bg: string; dot: string }> = {
  pending:              { label: 'Запуск',                color: '#888',    bg: 'rgba(136,136,136,0.08)',  dot: '#555'    },
  spec_review:          { label: 'Спек готов',            color: '#a78bfa', bg: 'rgba(167,139,250,0.08)',  dot: '#a78bfa' },
  needs_clarification:  { label: '❓ Уточнение',          color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   dot: '#f59e0b' },
  building:             { label: 'Сборка',                color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',   dot: '#60a5fa' },
  qa_review:            { label: 'QA проверка',           color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   dot: '#f59e0b' },
  ready:                { label: '✅ Готово',              color: '#34d399', bg: 'rgba(52,211,153,0.08)',   dot: '#34d399' },
  applied:              { label: 'Применено',             color: '#555',    bg: 'rgba(85,85,85,0.06)',     dot: '#374151' },
  rejected:             { label: 'Отклонено',             color: '#f87171', bg: 'rgba(248,113,113,0.06)',  dot: '#f87171' },
  paused:               { label: '⏸ Пауза',               color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   dot: '#f59e0b' },
  merged:               { label: 'Подключено',            color: '#34d399', bg: 'rgba(52,211,153,0.08)',   dot: '#34d399' },
  partial_success:      { label: '🔶 Частичн. восст.',    color: '#fb923c', bg: 'rgba(251,146,60,0.08)',   dot: '#fb923c' },
};

// ── Preview file path normalization ──────────────────────────────────────────

/** Strips /src/ prefix, prepends generated/ */
const normalizeToGeneratedPath = (key: string): string => {
  let p = key.startsWith('/') ? key.slice(1) : key;
  if (p.startsWith('src/')) p = p.slice(4);
  return `generated/${p}`;
};

/** Convert a FileMap to use generated/ paths */
const mapFilesToGenerated = (files: FileMap): FileMap => {
  const result: FileMap = {};
  for (const [key, content] of Object.entries(files)) {
    result[normalizeToGeneratedPath(key)] = content;
  }
  return result;
};

// ── Props ────────────────────────────────────────────────────────────────────

interface AgentLabPanelProps {
  files:            FileMap;
  agentConfigs:     Record<string, AgentConfig>;
  currentTheme:     'dark' | 'medium' | 'light';
  onApplyFiles:     (files: FileMap) => void;
  writeFilesToDisk?: (files: FileMap) => void;
  addLog:           (msg: string) => void;
  initialTask?:     string;               // pre-fill task description
  onNavigate?:      (view: string) => void; // called after merge
}

// ── Main component ────────────────────────────────────────────────────────────

export const AgentLabPanel: React.FC<AgentLabPanelProps> = ({
  files, agentConfigs, currentTheme, onApplyFiles, writeFilesToDisk, addLog,
  initialTask, onNavigate,
}) => {
  if (typeof window === 'undefined') return null;

  // ── Sessions state ────────────────────────────────────────────────────────
  const [sessions,        setSessions]        = useState<AgentSession[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [selectedModule,  setSelectedModule]  = useState(STUDIO_MODULES[0].id);
  const [selectedBlock,   setSelectedBlock]   = useState<string | null>(null);
  const [taskDescription, setTaskDescription] = useState('');
  const [launching,       setLaunching]       = useState(false);
  const [runStatus,       setRunStatus]       = useState<Record<string, string>>({});
  const [progress,        setProgress]        = useState<Record<string, number>>({});
  const [timeLeft,        setTimeLeft]        = useState<Record<string, number>>({});
  const [loadingIds,      setLoadingIds]      = useState<Set<string>>(new Set());
  const [budgets,         setBudgets]         = useState<Record<string, TokenBudget>>({});
  const [isCleaningUp,    setIsCleaningUp]    = useState(false);
  const [isCleaningArchive, setIsCleaningArchive] = useState(false);
  const [previewFiles,    setPreviewFiles]    = useState<FileMap | null>(null);
  const [previewActive,   setPreviewActive]   = useState('');
  const [terminalLogs,   setTerminalLogs]     = useState<LogEntry[]>([]);

  // ── Split layout state ────────────────────────────────────────────────────
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [chatLogs,      setChatLogs]      = useState<Record<string, ChatMessage[]>>({});
  const [liveStream,    setLiveStream]    = useState('');
  const [consoleInput,  setConsoleInput]  = useState('');
  const [showEfficiency, setShowEfficiency] = useState(false);
  const [clarAnswers,   setClarAnswers]   = useState<string[]>([]);
  const [showReport,    setShowReport]    = useState(false);
  const [showRefineBox, setShowRefineBox] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── BenchmarkGate state ───────────────────────────────────────────────────
  const [gateRunning,   setGateRunning]   = useState(false);
  const [gateVerdict,   setGateVerdict]   = useState<GateVerdict | null>(null);
  const [gateSuite,     setGateSuite]     = useState<'fast' | 'full'>('fast');
  const [gateProgress,  setGateProgress]  = useState<{ done: number; total: number } | null>(null);

  // ── Self-Healing state ────────────────────────────────────────────────────
  const [isSuggestedFix,    setIsSuggestedFix]    = useState(false);
  const [suggestedFixBlock, setSuggestedFixBlock] = useState('');
  const [autoFixToast,      setAutoFixToast]      = useState('');
  const autoFixHistory = useRef<Record<string, { count: number; lastAt: number }>>({});
  const [autopilotEnabled, setAutopilotEnabled] = useState(() => {
    try {
      const val = localStorage.getItem('AUTOPILOT_ENABLED');
      if (val === null) return false;
      return val === 'true';
    } catch {
      return false;
    }
  });
  const [autopilotStopped, setAutopilotStopped]  = useState(false);
  const autoRetryCount = useRef<number>(0);
  useEffect(() => {
    try {
      const val = localStorage.getItem('AUTOPILOT_RETRY_COUNT');
      if (val !== null) {
        const parsed = parseInt(val, 10);
        if (Number.isFinite(parsed)) {
          autoRetryCount.current = parsed;
        }
      }
    } catch {}
  }, []);

  const LIMIT_USD = 1.0;

  // ── API key / model shortcuts ─────────────────────────────────────────────
  const specApiKey  = ConfigService.getKeyForAgent('spec')  || ConfigService.getKeyForAgent('primary');
  const buildApiKey = ConfigService.getKeyForAgent('build') || ConfigService.getKeyForAgent('primary');
  const qaApiKey    = ConfigService.getKeyForAgent('qa')    || ConfigService.getKeyForAgent('fix');
  const specModel   = agentConfigs.spec?.modelId  || ConfigService.resolveModel('spec');
  const buildModel  = agentConfigs.build?.modelId || 'xiaomi/mimo-v2-pro';
  const qaModel     = agentConfigs.qa?.modelId    || 'openai/gpt-4o-mini';

  const selectedSession = sessions.find(s => s.id === selectedId) ?? null;

  // ── Load sessions on mount ────────────────────────────────────────────────
  const reload = useCallback(async () => {
    try {
      const data = await AgentLoopService.getSessions();
      setSessions(data);
    } catch { /* Supabase offline */ }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Auto-cleanup stalled building sessions on panel mount (fire-and-forget)
    void AgentLoopService.cleanupStalledSessions().then(n => {
      if (n > 0) {
        addLog(`[AgentLab] Auto-cleanup: ${n} stalled session(s) archived`);
        void reload(); // refresh list after cleanup
      }
    }).catch(() => { /* non-critical */ });
  }, [reload, addLog]);

  // ── Live stream listener ─────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: Event) => setLiveStream(prev => prev + (e as CustomEvent<string>).detail);
    window.addEventListener('agent-live-stream', h);
    return () => window.removeEventListener('agent-live-stream', h);
  }, []);

  // ── Terminal log listener ─────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent<{ msg: string; type: string }>).detail;
      window.dispatchEvent(new CustomEvent('studio-log', {
        detail: { source: 'Bundler', message: `[${detail.type}] ${detail.msg}` },
      }));
      // Добавляем лог в terminalLogs для StudioTerminal
      setTerminalLogs(prev => [...prev, {
        level: detail.type === 'error' ? 'error' : detail.type === 'warn' ? 'warn' : 'info',
        message: detail.msg,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }]);
    };
    window.addEventListener('terminal-log', h);
    return () => window.removeEventListener('terminal-log', h);
  }, []);

  // ── Progress timer for building sessions ─────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setSessions(prev => {
        const hasBuilding = prev.some(s => s.status === 'building');
        if (!hasBuilding) return prev;

        return prev.map(s => {
          if (s.status !== 'building') return s;
          const currentProgress = progress[s.id] ?? 5;
          const currentTime = timeLeft[s.id] ?? 35;

          // При получении статуса ready — мгновенно 100% и 0 сек (обрабатывается в statusUpdater)
          if (currentProgress >= 95) return s;

          const newProgress = Math.min(currentProgress + 2, 95);
          const newTime = Math.max(currentTime - 1, 0);

          setProgress(p => ({ ...p, [s.id]: newProgress }));
          setTimeLeft(t => ({ ...t, [s.id]: newTime }));

          return s;
        });
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [progress, timeLeft]);

  // ── Auto-scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs, selectedId, liveStream]);

  // ── Re-init clarification answers when session changes ───────────────────
  useEffect(() => {
    if (!selectedSession) return;
    const qs = getClarQuestions(selectedSession);
    setClarAnswers(qs.map(() => ''));
    setShowReport(false);
    setShowRefineBox(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Pre-fill task from initialTask prop ───────────────────────────────────
  useEffect(() => {
    if (initialTask) setTaskDescription(initialTask);
  }, [initialTask]);

  // ── Self-Healing: listen for auto-fix events ──────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        prompt: string;
        affectedFiles: string[];
        priority: string;
        error?: string;
      }>).detail;

      const key   = detail.affectedFiles[0] ?? 'unknown';
      const error = detail.error ?? 'неизвестная ошибка';

      if (autopilotEnabled) {
        try {
          // ── AUTOPILOT MODE ──────────────────────────────────────────────────
          const count = autoRetryCount.current;
          if (count >= 3) {
            // Stop autopilot — limit exceeded
            setAutopilotEnabled(false);
            try { localStorage.setItem('AUTOPILOT_ENABLED', 'false'); } catch { /* quota */ }
            setAutopilotStopped(true);
            setAutoFixToast('🛑 Автопилот остановлен: превышено число попыток.');
            setTimeout(() => setAutoFixToast(''), 8000);
            return;
          }
          // Increment counter
          autoRetryCount.current = count + 1;
          try { localStorage.setItem('AUTOPILOT_RETRY_COUNT', String(autoRetryCount.current)); } catch { /* quota */ }

          const attempt   = autoRetryCount.current;
          const blockName = `🤖 Автопилот: Fix #${attempt} — ${key}`;
          const hardPrompt = `${detail.prompt}\n\n⚠️ КРИТИЧЕСКОЕ УСЛОВИЕ: Предыдущая сборка упала с ошибкой "${error}". Исправь это. Соблюдай формат тегов <!--FILE:path-->, иначе сессия будет аннулирована. Попытка ${attempt}/3.`;

          addLog(`[Автопилот] Запускаю авто-исправление #${attempt} для ${key}`);
          void doLaunch(hardPrompt, blockName);
          return;
        } catch (e) {
          console.error(e);
        }
      }

      // ── MANUAL MODE — pre-fill form, user clicks launch ────────────────
      // Circuit Breaker — same file already attempted in last 5 min
      const hist     = autoFixHistory.current[key];
      const FIVE_MIN = 5 * 60 * 1000;
      if (hist && hist.count >= 1 && Date.now() - hist.lastAt < FIVE_MIN) {
        setAutoFixToast('❌ Авто-исправление не помогло. Требуется ручное вмешательство.');
        setTimeout(() => setAutoFixToast(''), 6000);
        return;
      }
      autoFixHistory.current[key] = { count: (hist?.count ?? 0) + 1, lastAt: Date.now() };

      setTaskDescription(detail.prompt);
      setIsSuggestedFix(true);
      setSuggestedFixBlock('🛠 Fix Suggested: ' + key);
      setAutoFixToast('🤖 Система нашла решение ошибки! Проверьте форму ниже.');
      setTimeout(() => setAutoFixToast(''), 6000);
    };

    window.addEventListener('auto-fix-triggered', handler);
    return () => window.removeEventListener('auto-fix-triggered', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilotEnabled]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getClarQuestions(s: AgentSession): string[] {
    let qs: string[] = s.clarify_questions ?? [];
    if (!qs.length && s.status === 'needs_clarification' && s.review_report) {
      try {
        const r = JSON.parse(s.review_report);
        if (r.clarification_questions) qs = r.clarification_questions;
      } catch { /* ignore */ }
    }
    return qs;
  }

  function pushChat(sessionId: string, icon: string, text: string, isUser = false) {
    setChatLogs(p => ({
      ...p,
      [sessionId]: [...(p[sessionId] ?? []), { id: uid(), time: nowTs(), icon, text, isUser }],
    }));
  }

  const statusUpdater = (sessionId: string) => (status: string, detail: string) => {
    setRunStatus(p => ({ ...p, [sessionId]: `[${status}] ${detail}` }));
    addLog(`[AgentLab:${sessionId.slice(0, 6)}] ${detail}`);
    window.dispatchEvent(new CustomEvent('studio-log', {
      detail: { source: 'AgentLab', message: `[${status}] ${detail}` },
    }));
    const icon = PHASE_ICON[status] ?? '💬';
    pushChat(sessionId, icon, detail);
    if (status === 'ready') {
      autoRetryCount.current = 0;
      try { localStorage.setItem('AUTOPILOT_RETRY_COUNT', '0'); } catch {}
      setAutopilotStopped(false);
      // Мгновенно ставим 100% и 0 сек при статусе ready
      setProgress(p => ({ ...p, [sessionId]: 100 }));
      setTimeLeft(t => ({ ...t, [sessionId]: 0 }));
    } else if (status === 'building') {
      // При старте сборки устанавливаем начальные значения
      setProgress(p => ({ ...p, [sessionId]: 5 }));
      setTimeLeft(t => ({ ...t, [sessionId]: 35 }));
    }
  };

  const progressUpdater = (sessionId: string) => (pct: number) => {
    setProgress(p => ({ ...p, [sessionId]: pct }));
  };

  const budgetUpdater = (sessionId: string) => (b: TokenBudget) => {
    setBudgets(p => ({ ...p, [sessionId]: b }));
  };

  const selectedModuleObj  = STUDIO_MODULES.find(m => m.id === selectedModule);
  const selectedBlockObj   = selectedModuleObj?.blocks.find(b => b.id === selectedBlock) ?? null;

  // ── Actions ───────────────────────────────────────────────────────────────

  // ── Core launch logic (used by both UI button and autopilot) ─────────────
  const doLaunch = async (taskDesc: string, blockLabel: string) => {
    if (!specApiKey || specApiKey.trim().length === 0) {
      addLog('[AgentLab] ❌ Нет API ключа для Spec Agent → Settings → Engine');
      return;
    }
    setLiveStream('');
    setLaunching(true);
    const tempId = `temp_${Date.now()}`;

    setSessions(prev => [...prev, {
      id: tempId, block_name: blockLabel, status: 'pending', spec: null, iterations: 0,
      max_iterations: 2, isolated_files: null, result_files: null, qa_report: null,
      review_report: null, spec_result: null, clarify_questions: null, clarify_answers: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }]);
    setSelectedId(tempId);
    setBudgets(p => ({ ...p, [tempId]: estimateBudget(files, specModel, buildModel, qaModel, 2, LIMIT_USD) }));

    try {
      const sessionId = await AgentLoopService.startSession(
        blockLabel, files, specApiKey, specModel,
        statusUpdater(tempId),
        taskDesc,
        agentConfigs.spec?.provider || 'openrouter',
      );

      setRunStatus(p => { const { [tempId]: live, ...rest } = p; return live ? { ...rest, [sessionId]: live } : rest; });
      setBudgets(p => { const { [tempId]: b, ...rest } = p; return b ? { ...rest, [sessionId]: b } : rest; });
      setChatLogs(p => { const { [tempId]: msgs, ...rest } = p; return msgs ? { ...rest, [sessionId]: msgs } : rest; });
      setSessions(prev => prev.filter(s => s.id !== tempId));
      setSelectedId(sessionId);
      await reload();
      addLog(`[AgentLab] Сессия: ${sessionId.slice(0, 8)}…`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(new CustomEvent('studio-log', { detail: { source: 'AgentLab', message: `[ERROR] ${msg}` } }));
      setSessions(prev => prev.filter(s => s.id !== tempId));
      addLog(`[AgentLab] ❌ ${msg}`);
    } finally {
      setLaunching(false);
    }
  };

  const [webContextLoading, setWebContextLoading] = useState(false);

  const handleWebContext = useCallback(async () => {
    const query = taskDescription.trim();
    if (!query || webContextLoading) return;
    setWebContextLoading(true);
    addLog('[WebContext] Searching: ' + query.slice(0, 80) + '...');
    try {
      // DuckDuckGo Instant Answer — free, no key required
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const { data, error } = await supabase.functions.invoke('llm-proxy', {
        body: {
          url: ddgUrl,
          method: 'GET',
          headers: {},
        },
      });
      if (error) throw new Error(error.message ?? 'llm-proxy error');

      let contextBlock = '\n\n--- Web Context ---\n';
      if (data?.AbstractText) contextBlock += data.AbstractText + '\n';
      if (data?.Answer) contextBlock += data.Answer + '\n';
      const topics: Array<{ Text?: string; FirstURL?: string }> = data?.RelatedTopics ?? [];
      topics.slice(0, 3).forEach(t => {
        if (t.Text) contextBlock += `\n• ${t.Text}`;
      });
      contextBlock += '\n--- End Web Context ---\n';

      if (contextBlock.length > 60) {
        setTaskDescription(prev => prev + contextBlock);
        addLog('[WebContext] Context added');
      } else {
        addLog('[WebContext] No results found for this query');
      }
    } catch (e: unknown) {
      addLog('[WebContext] Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setWebContextLoading(false);
    }
  }, [taskDescription, webContextLoading, addLog]);

  const handleLaunch = async () => {
    if (!taskDescription.trim()) return;
    const blockName = isSuggestedFix
      ? suggestedFixBlock
      : selectedBlockObj
        ? `${selectedModuleObj?.name} → ${selectedBlockObj.name}`
        : selectedModuleObj?.name ?? 'Unknown Module';
    const moduleContext = `Модуль: ${selectedModuleObj?.name} [${selectedModuleObj?.status}]
Блок: ${selectedBlockObj?.name ?? 'весь модуль'}
Задача: ${taskDescription}`;
    await doLaunch(moduleContext, blockName);
    setTaskDescription('');
    setIsSuggestedFix(false);
    setSuggestedFixBlock('');
  };

  const handleConfirm = async (sessionId: string) => {
    const bKey = ConfigService.getKeyForAgent('build') || ConfigService.getKeyForAgent('primary');
    const bMod = agentConfigs.build?.modelId || buildModel;
    const qKey = ConfigService.getKeyForAgent('qa') || ConfigService.getKeyForAgent('primary');
    const qMod = agentConfigs.qa?.modelId   || qaModel;
    if (!bKey) { addLog('[AgentLab] Нет API ключа для Build Agent'); return; }
    setLiveStream('');
    setLoadingIds(p => new Set(p).add(sessionId));
    try {
      await AgentLoopService.confirmAndBuild(
        sessionId, bKey, bMod, qKey, qMod,
        statusUpdater(sessionId), progressUpdater(sessionId),
        budgets[sessionId], budgetUpdater(sessionId), LIMIT_USD, 1,
        agentConfigs.build?.provider || 'openrouter',
        agentConfigs.qa?.provider   || 'openrouter',
      );
      await reload();
    } catch (e) {
      addLog(`[AgentLab] Build error: ${(e as Error).message}`);
    } finally {
      setLoadingIds(p => { const s = new Set(p); s.delete(sessionId); return s; });
    }
  };

  const handleApply = async (sessionId: string) => {
    try {
      const resultFiles = await AgentLoopService.applySession(sessionId);
      onApplyFiles(resultFiles);
      addLog(`[AgentLab] Применено: ${Object.keys(resultFiles).length} файлов`);
      await reload();
    } catch (e) { addLog(`[AgentLab] Apply error: ${(e as Error).message}`); }
  };

  const handleReject = async (sessionId: string) => {
    try {
      await AgentLoopService.rejectSession(sessionId);
      await reload();
    } catch (e) { addLog(`[AgentLab] Reject error: ${(e as Error).message}`); }
  };

  const handleMerge = async (sessionId: string) => {
    try {
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return;

      // Protected files guard — block merge if result touches files from spec.protectedFiles
      if (session.result_files && session.spec?.protectedFiles?.length) {
        const changedFiles  = Object.keys(session.result_files);
        const blocked = changedFiles.filter(f => session.spec!.protectedFiles.includes(f));
        if (blocked.length > 0) {
          alert(`⛔ Мердж заблокирован: изменены защищённые файлы:\n${blocked.join('\n')}\n\nОтредактируйте задачу или снимите защиту с этих файлов.`);
          addLog(`[AgentLab] Мердж заблокирован — защищённые файлы: ${blocked.join(', ')}`);
          return;
        }
      }

      if (session.result_files) {
        onApplyFiles(session.result_files);
        // Преобразуем пути для записи на диск в generated/ чтобы избежать коллизии с shell App.tsx
        const generatedFiles = mapFilesToGenerated(session.result_files);
        writeFilesToDisk?.(generatedFiles);
        addLog(`[AgentLab] Подключено: ${Object.keys(session.result_files).length} файлов`);
        // Диагностический лог
        console.log('[AgentLab] Preview files written to generated/:', Object.keys(generatedFiles));
      }
      await supabase.from('agent_sessions')
        .update({ status: 'merged', updated_at: new Date().toISOString() })
        .eq('id', sessionId);
      await reload();
    } catch (e) { addLog(`[AgentLab] Merge error: ${(e as Error).message}`); }
  };

  const handleRefine = async (sessionId: string, feedback: string) => {
    const bKey = ConfigService.getKeyForAgent('build') || ConfigService.getKeyForAgent('primary');
    const bMod = agentConfigs.build?.modelId || buildModel;
    const qKey = ConfigService.getKeyForAgent('qa') || ConfigService.getKeyForAgent('primary');
    const qMod = agentConfigs.qa?.modelId    || qaModel;
    if (!bKey) { addLog('[AgentLab] Нет API ключа'); return; }
    setLiveStream('');
    setLoadingIds(p => new Set(p).add(sessionId));
    try {
      await AgentLoopService.refineSession(
        sessionId, feedback, bKey, bMod, qKey, qMod,
        statusUpdater(sessionId), progressUpdater(sessionId),
        budgets[sessionId], budgetUpdater(sessionId), LIMIT_USD,
        agentConfigs.build?.provider || 'openrouter',
        agentConfigs.qa?.provider   || 'openrouter',
      );
      await reload();
    } catch (e) { addLog(`[AgentLab] Refine error: ${(e as Error).message}`); }
    finally { setLoadingIds(p => { const s = new Set(p); s.delete(sessionId); return s; }); }
  };

  const handleResume = async (sessionId: string) => {
    const bKey = ConfigService.getKeyForAgent('build') || ConfigService.getKeyForAgent('primary');
    const bMod = agentConfigs.build?.modelId || buildModel;
    const qKey = ConfigService.getKeyForAgent('qa') || ConfigService.getKeyForAgent('primary');
    const qMod = agentConfigs.qa?.modelId || qaModel;
    const budget = budgets[sessionId];
    if (!budget || !bKey) return;
    setLiveStream('');
    setLoadingIds(p => new Set(p).add(sessionId));
    try {
      await AgentLoopService.resumeSession(
        sessionId, bKey, bMod, qKey, qMod,
        statusUpdater(sessionId), progressUpdater(sessionId),
        budget, budgetUpdater(sessionId), LIMIT_USD,
        agentConfigs.build?.provider || 'openrouter',
        agentConfigs.qa?.provider   || 'openrouter',
      );
      await reload();
    } catch (e) { addLog(`[AgentLab] Resume error: ${(e as Error).message}`); }
    finally { setLoadingIds(p => { const s = new Set(p); s.delete(sessionId); return s; }); }
  };

  const handleRestartWithSpec = async (sessionId: string) => {
    if (!specApiKey) { addLog('[AgentLab] Нет API ключа'); return; }
    setLaunching(true);
    try {
      const newId = await AgentLoopService.restartWithSpec(sessionId, statusUpdater(sessionId));
      addLog(`[AgentLab] Перезапуск: ${newId.slice(0, 8)}…`);
      setSelectedId(newId);
      await reload();
    } catch (e) { addLog(`[AgentLab] Restart error: ${(e as Error).message}`); }
    finally { setLaunching(false); }
  };

  const handleAnswerClarifications = async (sessionId: string, answers: string[]) => {
    try {
      await AgentLoopService.answerClarifications(sessionId, answers);
      addLog('[AgentLab] Ответы сохранены. Строю...');
      const bKey = ConfigService.getKeyForAgent('build') || ConfigService.getKeyForAgent('primary');
      const bMod = agentConfigs.build?.modelId || buildModel;
      const qKey = ConfigService.getKeyForAgent('qa') || ConfigService.getKeyForAgent('primary');
      const qMod = agentConfigs.qa?.modelId || qaModel;
      if (!bKey) { addLog('[AgentLab] Нет API ключа для Build Agent'); return; }
      setLiveStream('');
      setLoadingIds(p => new Set(p).add(sessionId));
      try {
        await AgentLoopService.confirmAndBuild(
          sessionId, bKey, bMod, qKey, qMod,
          statusUpdater(sessionId), progressUpdater(sessionId),
          budgets[sessionId], budgetUpdater(sessionId), LIMIT_USD, 1,
          agentConfigs.build?.provider || 'openrouter',
          agentConfigs.qa?.provider   || 'openrouter',
        );
        await reload();
      } finally {
        setLoadingIds(p => { const s = new Set(p); s.delete(sessionId); return s; });
      }
    } catch (e) { addLog(`[AgentLab] Answer error: ${(e as Error).message}`); }
  };

  const ARCHIVE_STATUSES: AgentSessionStatus[] = ['rejected', 'applied', 'merged', 'failed' as AgentSessionStatus];

  const handleClearArchive = async () => {
    setIsCleaningArchive(true);
    try {
      const toDelete = sessions.filter(s => ARCHIVE_STATUSES.includes(s.status)).map(s => s.id);
      // Optimistic local update
      setSessions(prev => prev.filter(s => !toDelete.includes(s.id)));
      if (selectedId && toDelete.includes(selectedId)) setSelectedId(null);
      // Remove from Supabase
      if (toDelete.length > 0) {
        await supabase.from('agent_sessions').delete().in('id', toDelete);
      }
      addLog(`[AgentLab] Архив очищен: ${toDelete.length} сессий удалено`);
    } catch (e) { addLog(`[AgentLab] Clear archive error: ${(e as Error).message}`); }
    finally { setIsCleaningArchive(false); }
  };

  const handleClearCompleted = async () => {
    setIsCleaningUp(true);
    try {
      const fiveMin = Date.now() - 5 * 60 * 1000;
      const toDelete = sessions
        .filter(s => (s.status === 'pending' && new Date(s.created_at).getTime() < fiveMin))
        .map(s => s.id);
      setSessions(prev => prev.filter(s => !toDelete.includes(s.id)));
      for (const id of toDelete) await AgentLoopService.deleteSession(id);
      const n = await AgentLoopService.deleteOldPendingSessions();
      // Also archive stalled building sessions
      const stalled = await AgentLoopService.cleanupStalledSessions();
      addLog(`[AgentLab] Очищено: ${toDelete.length} сессий, удалено ${n} из БД, stalled archived: ${stalled}`);
    } catch (e) { addLog(`[AgentLab] Cleanup error: ${(e as Error).message}`); }
    finally { setIsCleaningUp(false); }
  };

  // ── Deactivate active session → paused ───────────────────────────────────

  const handleDeactivate = async (sessionId: string) => {
    try {
      await supabase.from('agent_sessions')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', sessionId);
      await reload();
      addLog(`[AgentLab] Деактивировано: ${sessionId.slice(0, 8)}…`);
    } catch (e) { addLog(`[AgentLab] Deactivate error: ${(e as Error).message}`); }
  };

  // ── Delete archived/paused session from Supabase ─────────────────────────

  const handleDeleteSession = async (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (selectedId === sessionId) setSelectedId(null);
    try {
      await AgentLoopService.deleteSession(sessionId);
      addLog(`[AgentLab] Удалено: ${sessionId.slice(0, 8)}…`);
    } catch (e) { addLog(`[AgentLab] Delete error: ${(e as Error).message}`); }
  };

  // ── Console input send ────────────────────────────────────────────────────

  const handleConsoleSend = () => {
    const text = consoleInput.trim();
    if (!text || !selectedId || !selectedSession) return;
    setConsoleInput('');
    pushChat(selectedId, '👤', text, true);

    const status = selectedSession.status;
    if (status === 'needs_clarification') {
      void handleAnswerClarifications(selectedId, [text]);
    } else if (status === 'paused') {
      void handleResume(selectedId);
    } else if (status === 'qa_review' || status === 'ready') {
      void handleRefine(selectedId, text);
    } else {
      addLog(`[AgentLab] Заметка:${selectedId.slice(0, 6)}: ${text.slice(0, 80)}`);
    }
  };

  // ── Partitions ────────────────────────────────────────────────────────────
  const activeSessions  = sessions.filter(s => !['applied', 'rejected', 'merged'].includes(s.status));
  const archiveSessions = sessions.filter(s =>  ['applied', 'rejected', 'merged'].includes(s.status));

  // ── Btn style helper ─────────────────────────────────────────────────────
  const btn = (color: string, bg: string) => ({
    padding: '8px 14px', borderRadius: 9, border: 'none',
    background: bg, color, fontWeight: 700, fontSize: 12,
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 5, transition: '0.15s',
  } as React.CSSProperties);

  // ── BenchmarkGate handler ─────────────────────────────────────────────────
  const handleRunGate = useCallback(async () => {
    const apiKey = specApiKey || buildApiKey;
    if (!apiKey) return;
    setGateRunning(true);
    setGateVerdict(null);
    setGateProgress(null);
    try {
      const verdict = await BenchmarkGate.check({
        apiKey,
        modelId:     specModel || ConfigService.getModel(),
        fixModelId:  buildModel,
        suite:       gateSuite,
        onProgress:  (done, total) => setGateProgress({ done, total }),
      });
      setGateVerdict(verdict);
      addLog(`[BenchmarkGate] ${verdict.passed ? '✅ PASSED' : '❌ FAILED'} — ${gateSuite} suite | regressions=${verdict.regressions.length}`);
    } catch (err) {
      addLog(`[BenchmarkGate] error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGateRunning(false);
      setGateProgress(null);
    }
  }, [specApiKey, buildApiKey, specModel, buildModel, gateSuite, addLog]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed',
      width: 'min(900px, 95vw)',
      maxHeight: '90vh',
      overflow: 'hidden',
      background: '#06060a',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Split layout wrapper ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* ══════════════ LEFT COLUMN ══════════════ */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto',
      }}>

        {/* Loading indicator */}
        {loading && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, color: '#444',
          }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Загрузка сессий…</span>
          </div>
        )}

        {/* Self-Healing toast */}
        {autoFixToast && (
          <div style={{
            margin: '10px 16px 0', padding: '9px 14px', borderRadius: 10,
            background: autoFixToast.startsWith('🛑') || autoFixToast.startsWith('❌')
              ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
            border: `1px solid ${autoFixToast.startsWith('🛑') || autoFixToast.startsWith('❌')
              ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
            fontSize: 12, color: autoFixToast.startsWith('🛑') || autoFixToast.startsWith('❌')
              ? '#f87171' : '#f59e0b',
            flexShrink: 0,
          }}>
            {autoFixToast}
          </div>
        )}

        {/* Autopilot stopped card */}
        {autopilotStopped && (
          <div style={{
            margin: '10px 16px 0', padding: '12px 14px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171', marginBottom: 6 }}>
              🛑 Автопилот остановлен: превышено число попыток
            </div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
              Агент совершил 3 неудачных попытки. Требуется ручное вмешательство.
            </div>
            <button
              onClick={() => {
                autoRetryCount.current = 0;
                try { localStorage.setItem('AUTOPILOT_RETRY_COUNT', '0'); } catch {}
                setAutopilotStopped(false);
              }}
              style={{
                padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: 'rgba(248,113,113,0.15)', color: '#f87171',
                fontSize: 11, fontWeight: 700,
              }}
            >
              Сбросить счётчик
            </button>
          </div>
        )}

        {/* Suggested Fix card — manual mode only */}
        {isSuggestedFix && !autopilotEnabled && (
          <div style={{
            margin: '10px 16px 0', padding: '11px 14px', borderRadius: 10,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>
              🛠 Suggested Fix
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>
              {suggestedFixBlock} — форма заполнена. Нажмите «Запустить исправление».
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
            <FlaskConical size={18} style={{ color: '#60a5fa' }} />
            <span style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Agent Lab</span>
            {/* Autopilot toggle */}
            <button
              onClick={() => {
                try {
                  const next = !autopilotEnabled;
                  setAutopilotEnabled(next);
                  localStorage.setItem('AUTOPILOT_ENABLED', String(next));
                  if (next) { setAutopilotStopped(false); }
                } catch {}
              }}
              title={autopilotEnabled ? 'Автопилот включён — нажми для выключения' : 'Включить Автопилот'}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                background: autopilotEnabled ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.05)',
                color:      autopilotEnabled ? '#f87171'               : '#888',
                transition: '0.15s',
                boxShadow: autopilotEnabled ? '0 0 8px rgba(248,113,113,0.4)' : 'none',
              }}
            >
              <Bot size={12} />
              🤖 АВТОПИЛОТ
            </button>
            {/* Retry indicator */}
            {autoRetryCount.current > 0 && (
              <div style={{
                marginLeft: 8, padding: '3px 8px', borderRadius: 6,
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
                fontSize: 10, fontWeight: 700, color: '#f87171',
              }}>
                Попытка {autoRetryCount.current}/3
              </div>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#444' }}>Автономная разработка блоков</p>
        </div>

        <div style={{ flex: 1, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── New task form ── */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Новая задача</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select
                value={selectedModule}
                onChange={e => { setSelectedModule(e.target.value); setSelectedBlock(null); }}
                disabled={launching}
                style={{ padding: '10px 13px', borderRadius: 11, background: '#111114', border: '1px solid rgba(255,255,255,0.07)', color: '#fff', fontSize: 12, outline: 'none', cursor: 'pointer' }}
              >
                {STUDIO_MODULES.map(m => (
                  <option key={m.id} value={m.id}>{m.name} {m.status === 'soon' ? '(скоро)' : ''}</option>
                ))}
              </select>

              {selectedModuleObj && selectedModuleObj.blocks.length > 0 && (
                <select
                  value={selectedBlock ?? ''}
                  onChange={e => setSelectedBlock(e.target.value || null)}
                  disabled={launching}
                  style={{ padding: '10px 13px', borderRadius: 11, background: '#111114', border: '1px solid rgba(255,255,255,0.07)', color: '#fff', fontSize: 12, outline: 'none', cursor: 'pointer' }}
                >
                  <option value="">— весь модуль —</option>
                  {selectedModuleObj.blocks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}

              <textarea
                value={taskDescription}
                onChange={e => setTaskDescription(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey && !launching) void handleLaunch(); }}
                placeholder="Описание задачи…  (Ctrl+Enter)"
                disabled={launching}
                style={{ padding: '10px 13px', borderRadius: 11, background: '#111114', border: '1px solid rgba(255,255,255,0.07)', color: '#fff', fontSize: 12, outline: 'none', minHeight: 72, fontFamily: 'inherit', resize: 'vertical' }}
              />
              <button
                onClick={() => void handleWebContext()}
                disabled={webContextLoading || !taskDescription.trim()}
                style={{
                  alignSelf: 'flex-start',
                  padding: '4px 10px',
                  fontSize: 11,
                  borderRadius: 6,
                  border: 'none',
                  cursor: webContextLoading || !taskDescription.trim() ? 'not-allowed' : 'pointer',
                  background: webContextLoading ? 'rgba(255,255,255,0.05)' : 'rgba(99,102,241,0.15)',
                  color: webContextLoading || !taskDescription.trim() ? 'rgba(255,255,255,0.3)' : '#818cf8',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
              >
                {webContextLoading ? '...' : '🌐 Web context'}
              </button>

              <button
                onClick={() => void handleLaunch()}
                disabled={launching || !taskDescription.trim()}
                style={{ ...btn(
                  taskDescription.trim() && !launching ? (isSuggestedFix ? '#f59e0b' : '#60a5fa') : '#444',
                  taskDescription.trim() && !launching ? (isSuggestedFix ? 'rgba(245,158,11,0.18)' : 'rgba(96,165,250,0.18)') : 'rgba(255,255,255,0.03)',
                ) }}
              >
                {launching
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Запуск…</>
                  : isSuggestedFix
                    ? <>▶ Запустить исправление</>
                    : <><Play size={13} /> Запустить</>}
              </button>
            </div>

            {!specApiKey && (
              <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 9, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', fontSize: 11, color: '#f59e0b' }}>
                ⚠️ Добавь API ключ в Settings → Engine
              </div>
            )}
          </div>

          {/* ── BenchmarkGate ── */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Quality Gate
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {(['fast', 'full'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setGateSuite(s)}
                  disabled={gateRunning}
                  style={{
                    padding: '4px 10px', borderRadius: 7, border: `1px solid ${gateSuite === s ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.07)'}`,
                    background: gateSuite === s ? 'rgba(96,165,250,0.12)' : 'transparent',
                    color: gateSuite === s ? '#60a5fa' : '#555', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {s === 'fast' ? '⚡ fast (5)' : '🔬 full (15)'}
                </button>
              ))}
              <button
                onClick={() => void handleRunGate()}
                disabled={gateRunning || !specApiKey && !buildApiKey}
                style={{ ...btn(
                  gateRunning ? '#555' : '#a78bfa',
                  gateRunning ? 'rgba(255,255,255,0.03)' : 'rgba(167,139,250,0.15)',
                ), marginLeft: 'auto' }}
              >
                {gateRunning
                  ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      {gateProgress ? `${gateProgress.done}/${gateProgress.total}` : 'Running…'}
                    </>
                  : <><Zap size={12} /> Run Gate</>}
              </button>
            </div>

            {/* Verdict card */}
            {gateVerdict && (
              <div style={{
                marginTop: 8, padding: '10px 13px', borderRadius: 10,
                background: gateVerdict.passed ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
                border: `1px solid ${gateVerdict.passed ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: gateVerdict.passed ? '#34d399' : '#f87171', marginBottom: 4 }}>
                  {gateVerdict.passed ? '✅ Gate PASSED' : '❌ Gate FAILED'}
                  <span style={{ fontSize: 10, fontWeight: 400, color: '#666', marginLeft: 8 }}>
                    {gateVerdict.report.summary.previewReady}/{gateVerdict.report.summary.total} ready
                    · {(gateVerdict.report.summary.avgDurationMs / 1000).toFixed(1)}s avg
                  </span>
                </div>
                {gateVerdict.regressions.map((r, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>
                    🔴 {r.message}
                  </div>
                ))}
                {gateVerdict.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>
                    ⚠️ {w.message}
                  </div>
                ))}
                {gateVerdict.improvements.map((imp, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#34d399', marginTop: 2 }}>
                    📈 {imp.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Active sessions ── */}
          {activeSessions.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Активные ({activeSessions.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {activeSessions.map(s => {
                  const meta      = STATUS_META[s.status] ?? STATUS_META.pending;
                  const isSelected = s.id === selectedId;
                  const isAlive   = ['building', 'pending', 'needs_clarification'].includes(s.status);
                  const isAutoFix = s.block_name?.startsWith('🛠 Fix Suggested');
                  const pct = progress[s.id] ?? 0;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      style={{
                        padding: '10px 13px', borderRadius: 11, cursor: 'pointer',
                        background: isSelected
                          ? (isAutoFix ? 'rgba(245,158,11,0.08)' : 'rgba(96,165,250,0.1)')
                          : 'rgba(255,255,255,0.025)',
                        border: `1px solid ${isAutoFix ? 'rgba(245,158,11,0.4)' : isSelected ? 'rgba(96,165,250,0.3)' : meta.dot + '28'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: pct > 0 ? 6 : 0 }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%', background: isAutoFix ? '#f59e0b' : meta.dot, flexShrink: 0,
                          boxShadow: isAlive ? `0 0 5px ${isAutoFix ? '#f59e0b' : meta.dot}99` : 'none',
                          animation: isAlive ? 'pulse 2s ease-in-out infinite' : 'none',
                        }} />
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.block_name}
                        </span>
                        {isAutoFix && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                            🤖 Auto-diagnosed
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: meta.color, fontWeight: 700, flexShrink: 0 }}>{meta.label}</span>
                        {/* Deactivate → paused */}
                        <button
                          onClick={e => { e.stopPropagation(); void handleDeactivate(s.id); }}
                          title="Деактивировать"
                          style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 12, padding: '1px 4px', borderRadius: 4, lineHeight: 1, flexShrink: 0 }}
                        >⏸</button>
                      </div>
                      {pct > 0 && (
                        <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: meta.dot, borderRadius: 1, transition: 'width 0.4s ease' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Empty state ── */}
          {activeSessions.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#2a2a2a', paddingTop: 30 }}>
              <FlaskConical size={36} strokeWidth={1.5} />
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Нет активных задач</div>
            </div>
          )}

          {/* ── Archive ── */}
          {archiveSessions.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Архив ({archiveSessions.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {archiveSessions.slice(0, 8).map(s => {
                  const meta = STATUS_META[s.status];
                  const canRestart = s.status === 'rejected' && !!s.spec_result;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      style={{
                        padding: '8px 11px', borderRadius: 9, cursor: 'pointer',
                        background: s.id === selectedId ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)',
                        border: `1px solid ${canRestart ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)'}`,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 11, color: '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.block_name}</span>
                      <span style={{ fontSize: 10, color: '#333' }}>{meta.label}</span>
                      {canRestart && (
                        <button
                          onClick={e => { e.stopPropagation(); void handleRestartWithSpec(s.id); }}
                          style={{ padding: '2px 7px', borderRadius: 5, border: 'none', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                        >🔄</button>
                      )}
                      {/* Delete archived session */}
                      <button
                        onClick={e => { e.stopPropagation(); void handleDeleteSession(s.id); }}
                        title="Удалить"
                        style={{ background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '1px 3px', borderRadius: 4, lineHeight: 1, flexShrink: 0 }}
                      >🗑</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Clear archive button ── */}
          {archiveSessions.length > 0 && (
            <button
              onClick={() => void handleClearArchive()}
              disabled={isCleaningArchive}
              style={{ ...btn(isCleaningArchive ? '#a87171' : '#f87171', 'rgba(248,113,113,0.08)'), opacity: isCleaningArchive ? 0.6 : 1 }}
            >
              {isCleaningArchive
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Очищаю архив…</>
                : <>🗑️ Очистить архив</>}
            </button>
          )}

          {/* ── Cleanup ── */}
          {(activeSessions.length + archiveSessions.length) > 0 && (
            <button
              onClick={() => void handleClearCompleted()}
              disabled={isCleaningUp}
              style={{ ...btn(isCleaningUp ? '#a87171' : '#f87171', 'rgba(248,113,113,0.08)'), opacity: isCleaningUp ? 0.6 : 1 }}
            >
              {isCleaningUp
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Очищаю…</>
                : <>🗑️ Очистить завершённые</>}
            </button>
          )}
        </div>

        {/* ── Model Efficiency ── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <button
            onClick={() => setShowEfficiency(p => !p)}
            style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6,
              color: '#6b7280', fontSize: 12, fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 14 }}>📊</span>
            Model Efficiency
            <span style={{ marginLeft: 'auto', fontSize: 10 }}>{showEfficiency ? '▲' : '▼'}</span>
          </button>
          {showEfficiency && <ModelEfficiencyPanel />}
        </div>
      </div>

      {/* ══════════════ RIGHT COLUMN — LIVE CONSOLE ══════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {!selectedSession ? (
          /* ── Placeholder ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#2a2a2a' }}>
            <Terminal size={44} strokeWidth={1} />
            <div style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>Live Agent Console</div>
            <div style={{ fontSize: 12, color: '#2a2a2a', textAlign: 'center', maxWidth: 220 }}>
              Выбери сессию слева для мониторинга
            </div>
          </div>
        ) : (() => {
          const sess    = selectedSession;
          const meta    = STATUS_META[sess.status] ?? STATUS_META.pending;
          const pct     = progress[sess.id] ?? 0;
          const isAlive = ['building', 'pending', 'needs_clarification', 'paused'].includes(sess.status);
          const budget  = budgets[sess.id];
          const msgs    = chatLogs[sess.id] ?? [];
          const clarQs  = getClarQuestions(sess);
          const iter    = sess.iterations ?? 0;
          const maxIter = sess.max_iterations ?? 2;
          const loading = loadingIds.has(sess.id);

          return (
            <>
              {/* ── Console header ── */}
              <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: '#080810' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: meta.dot, flexShrink: 0,
                    boxShadow: isAlive ? `0 0 6px ${meta.dot}99` : 'none',
                    animation: isAlive ? 'pulse 2s ease-in-out infinite' : 'none',
                  }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sess.block_name}
                  </span>
                  <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 6, background: `${meta.dot}18`, color: meta.color, fontWeight: 700, flexShrink: 0 }}>
                    {meta.label}
                  </span>
                </div>

                {/* Progress bar with gradient and time */}
                {pct > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#555' }}>
                        Обработка: <span style={{ color: '#fff', fontWeight: 700 }}>{pct}%</span> | Осталось: ~{timeLeft[sess.id] ?? 0} сек.
                      </span>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>Итерация {iter}/{maxIter}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, #fb923c, #34d399)`,
                        borderRadius: 2,
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Chat feed ── */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>

                {msgs.length === 0 && (
                  <div style={{ color: '#333', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
                    Ожидание активности агента…
                  </div>
                )}

                {msgs.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    flexDirection: m.isUser ? 'row-reverse' : 'row',
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{m.icon}</span>
                    <div style={{
                      maxWidth: '85%', padding: '7px 11px', borderRadius: 10,
                      background: m.isUser ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${m.isUser ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.06)'}`,
                      fontSize: 12, color: m.isUser ? '#93c5fd' : 'rgba(255,255,255,0.75)',
                      lineHeight: 1.5,
                    }}>
                      {m.text}
                    </div>
                    <span style={{ fontSize: 9, color: '#333', flexShrink: 0, marginTop: 9 }}>{m.time}</span>
                  </div>
                ))}

                {/* Live stream */}
                {liveStream && (sess.status === 'building' || loading) && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>⚡</span>
                    <div style={{ padding: '7px 11px', borderRadius: 10, background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.12)', fontFamily: 'monospace', fontSize: 10, color: '#60a5fa', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflowY: 'auto', flex: 1 }}>
                      {liveStream.slice(-800)}
                    </div>
                  </div>
                )}

                {/* ── Action panels by status ── */}

                {/* spec_review */}
                {sess.status === 'spec_review' && sess.spec && (
                  <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.18)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', marginBottom: 8 }}>📋 Спецификация</div>
                    <div style={{ fontSize: 11, color: '#999', lineHeight: 1.7, marginBottom: 12 }}>
                      <div><strong style={{ color: '#a78bfa' }}>Цель:</strong> {sess.spec.goal}</div>
                      <div><strong style={{ color: '#a78bfa' }}>Фичи:</strong> {sess.spec.mustHaveFeatures.join(' · ')}</div>
                      {sess.spec.risks.length > 0 && <div><strong style={{ color: '#f59e0b' }}>Риски:</strong> {sess.spec.risks.join(' · ')}</div>}
                      <div><strong style={{ color: '#34d399' }}>Защита:</strong> {sess.spec.protectedFiles.join(', ') || 'нет'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => void handleConfirm(sess.id)} disabled={loading}
                        style={{ ...btn('#34d399', 'rgba(52,211,153,0.18)'), flex: 1, opacity: loading ? 0.6 : 1 }}>
                        {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Подтвердить и строить
                      </button>
                      <button onClick={() => void handleReject(sess.id)} style={btn('#f87171', 'rgba(248,113,113,0.12)')}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* needs_clarification */}
                {sess.status === 'needs_clarification' && clarQs.length > 0 && (
                  <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 10 }}>❓ Уточняющие вопросы</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                      {clarQs.map((q, idx) => (
                        <div key={idx}>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{idx + 1}. {q}</div>
                          <input
                            type="text"
                            value={clarAnswers[idx] ?? ''}
                            onChange={e => { const a = [...clarAnswers]; a[idx] = e.target.value; setClarAnswers(a); }}
                            placeholder="Ответ…"
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, background: '#111114', border: '1px solid rgba(255,255,255,0.07)', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          pushChat(sess.id, '👤', clarAnswers.filter(a => a.trim()).join(' | '), true);
                          void handleAnswerClarifications(sess.id, clarAnswers.filter(a => a.trim()));
                        }}
                        disabled={loading || clarAnswers.every(a => !a.trim())}
                        style={{ ...btn('#60a5fa', 'rgba(96,165,250,0.18)'), flex: 1, opacity: loading ? 0.6 : 1 }}
                      >
                        {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Ответить и строить
                      </button>
                      <button onClick={() => void handleReject(sess.id)} style={btn('#f87171', 'rgba(248,113,113,0.12)')}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* paused */}
                {sess.status === 'paused' && (
                  <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
                    <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 10 }}>⏸ {runStatus[sess.id] || 'Сессия приостановлена'}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => void handleResume(sess.id)} disabled={loading}
                        style={{ ...btn('#34d399', 'rgba(52,211,153,0.15)'), flex: 1, opacity: loading ? 0.6 : 1 }}>
                        <PlayCircle size={12} /> Возобновить
                      </button>
                      <button onClick={() => void handleReject(sess.id)} style={btn('#f87171', 'rgba(248,113,113,0.12)')}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* partial_success — частичное восстановление после обрыва стрима */}
                {sess.status === 'partial_success' && (() => {
                  // Извлекаем X и Y из review_report
                  const reportText = sess.review_report ?? '';
                  const match = reportText.match(/получено (\d+) файлов из (\d+)/);
                  const received = match ? parseInt(match[1]) : (sess.result_files ? Object.keys(sess.result_files).length : 0);
                  const total    = match ? parseInt(match[2]) : (sess.spec?.touchedFiles.length ?? '?');
                  return (
                    <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.25)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fb923c', marginBottom: 6 }}>🔶 Частичное восстановление</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10, lineHeight: 1.6 }}>
                        Соединение прервалось в середине стрима. Система автоматически сохранила все успешно закрытые файлы.
                        <br />
                        <span style={{ color: '#fb923c', fontWeight: 700 }}>
                          Получено {received} файлов из {total}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {sess.result_files && Object.keys(sess.result_files).length > 0 && (
                          <button
                            onClick={() => { if (sess.result_files) { setPreviewFiles(sess.result_files); setPreviewActive(Object.keys(sess.result_files)[0] ?? ''); } }}
                            style={{ ...btn('#aaa', 'rgba(255,255,255,0.05)'), flex: 1 }}
                          >
                            👁 Предпросмотр
                          </button>
                        )}
                        <button onClick={() => void handleMerge(sess.id)} disabled={loading}
                          style={{ ...btn('#fb923c', 'rgba(251,146,60,0.18)'), flex: 1, opacity: loading ? 0.6 : 1 }}>
                          <Check size={12} /> Применить частично
                        </button>
                        <button onClick={() => void handleResume(sess.id)} disabled={loading}
                          style={{ ...btn('#60a5fa', 'rgba(96,165,250,0.15)'), flex: 1, opacity: loading ? 0.6 : 1 }}>
                          <PlayCircle size={12} /> Достроить
                        </button>
                        <button onClick={() => void handleReject(sess.id)} style={btn('#f87171', 'rgba(248,113,113,0.12)')}>
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* qa_review */}
                {sess.status === 'qa_review' && (
                  <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
                    <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 10 }}>🔍 QA завершена — примите решение</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => { const s = sessions.find(x => x.id === sess.id); if (s?.result_files) { setPreviewFiles(s.result_files); setPreviewActive(Object.keys(s.result_files)[0] ?? ''); } }}
                        style={{ ...btn('#aaa', 'rgba(255,255,255,0.05)'), flex: 1 }}>
                        👁 Предпросмотр
                      </button>
                      <button onClick={() => void handleMerge(sess.id)} style={{ ...btn('#34d399', 'rgba(52,211,153,0.18)'), flex: 1 }}>
                        <Check size={12} /> Подключить
                      </button>
                      <button onClick={() => setShowRefineBox(p => !p)}
                        style={{ ...btn('#a78bfa', showRefineBox ? 'rgba(167,139,250,0.25)' : 'rgba(167,139,250,0.12)'), flex: 1 }}>
                        ✏️ Доработать
                      </button>
                      <button onClick={() => void handleReject(sess.id)} style={btn('#f87171', 'rgba(248,113,113,0.12)')}>
                        <X size={12} />
                      </button>
                    </div>
                    {showRefineBox && (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          value={consoleInput}
                          onChange={e => setConsoleInput(e.target.value)}
                          placeholder="Что исправить…"
                          rows={2}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: '#111114', border: '1px solid rgba(167,139,250,0.25)', color: '#fff', fontSize: 12, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                        <button
                          onClick={() => { const t = consoleInput.trim(); if (t) { setShowRefineBox(false); setConsoleInput(''); void handleRefine(sess.id, t); } }}
                          disabled={!consoleInput.trim() || loading}
                          style={{ ...btn('#a78bfa', 'rgba(167,139,250,0.18)'), marginTop: 6, width: '100%', opacity: !consoleInput.trim() || loading ? 0.5 : 1 }}
                        >
                          <Play size={11} /> Отправить в BuildAgent
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ready */}
                {sess.status === 'ready' && (
                  <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.18)' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: showReport ? 10 : 0, flexWrap: 'wrap' }}>
                      <button onClick={() => setShowReport(p => !p)}
                        style={{ ...btn('#888', 'rgba(255,255,255,0.05)') }}>
                        <FileText size={11} /> Отчёт {showReport ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                      <button onClick={() => void handleApply(sess.id)} style={{ ...btn('#34d399', 'rgba(52,211,153,0.2)'), flex: 2 }}>
                        <Zap size={12} /> Применить к проекту
                      </button>
                      <button onClick={() => void handleReject(sess.id)} style={btn('#f87171', 'rgba(248,113,113,0.1)')}>
                        <X size={12} />
                      </button>
                    </div>
                    {showReport && sess.review_report && (
                      <div style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: '#888', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                        {sess.review_report}
                      </div>
                    )}
                  </div>
                )}

                {/* rejected with spec */}
                {sess.status === 'rejected' && sess.spec_result && (
                  <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                      <strong style={{ color: '#a78bfa' }}>Спек:</strong> {sess.spec_result.goal}
                    </div>
                    <button onClick={() => void handleRestartWithSpec(sess.id)} style={{ ...btn('#a78bfa', 'rgba(167,139,250,0.15)'), width: '100%' }}>
                      🔄 Перезапустить с готовым спеком
                    </button>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* ── Input bar ── */}
              {['building', 'needs_clarification', 'paused', 'qa_review', 'pending'].includes(sess.status) && !showRefineBox && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, display: 'flex', gap: 8, background: '#080810' }}>
                  <textarea
                    value={consoleInput}
                    onChange={e => setConsoleInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleConsoleSend(); } }}
                    placeholder={
                      sess.status === 'needs_clarification' ? 'Ответить агенту… (Enter)' :
                      sess.status === 'paused'              ? 'Заметка для возобновления… (Enter)' :
                      sess.status === 'qa_review'           ? 'Что исправить… (Enter)' :
                      'Сообщение агенту… (Enter)'
                    }
                    rows={2}
                    style={{ flex: 1, padding: '8px 11px', borderRadius: 9, background: '#111114', border: '1px solid rgba(255,255,255,0.07)', color: '#fff', fontSize: 12, outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
                  />
                  <button
                    onClick={handleConsoleSend}
                    disabled={!consoleInput.trim() || loading}
                    style={{ ...btn('#60a5fa', 'rgba(96,165,250,0.18)'), padding: '8px 14px', alignSelf: 'flex-end', opacity: !consoleInput.trim() || loading ? 0.4 : 1 }}
                  >
                    <Send size={13} />
                  </button>
                </div>
              )}

              {/* ── Metrics footer ── */}
              <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, display: 'flex', gap: 18, alignItems: 'center', background: '#050508' }}>
                {budget ? (
                  <>
                    <span style={{ fontSize: 10, color: '#444' }}>
                      🟢 Tokens: <span style={{ color: '#34d399', fontFamily: 'monospace' }}>{(budget.actualInputTokens + budget.actualOutputTokens).toLocaleString()}</span>
                    </span>
                    <span style={{ fontSize: 10, color: '#444' }}>
                      💰 <span style={{ color: budget.actualCostUsd > budget.limitUsd * 0.8 ? '#f59e0b' : '#34d399', fontFamily: 'monospace' }}>
                        ${budget.actualCostUsd.toFixed(4)}
                      </span>
                    </span>
                    <span style={{ fontSize: 10, color: '#444' }}>
                      ⏱ <span style={{ color: '#888', fontFamily: 'monospace' }}>
                        {Math.round((Date.now() - new Date(sess.created_at).getTime()) / 1000 / 60)}m
                      </span>
                    </span>
                    <span style={{ fontSize: 10, color: '#333', marginLeft: 'auto', fontFamily: 'monospace' }}>
                      limit ${budget.limitUsd}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: '#333', fontFamily: 'monospace' }}>
                    ⏱ {Math.round((Date.now() - new Date(sess.created_at).getTime()) / 1000 / 60)}m elapsed
                  </span>
                )}
              </div>
            </>
          );
        })()}
      </div>
      </div>{/* ── end split layout wrapper ── */}

      {/* ── Studio Terminal ── */}
      <StudioTerminal
        logs={terminalLogs}
        modules={[]}
        onClear={() => setTerminalLogs([])}
      />

      <style>{`
        @keyframes spin  { from { transform: rotate(0deg);   } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* ── Preview modal ── */}
      {previewFiles && (
        <div
          onClick={() => setPreviewFiles(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()}
            style={{ width: '90vw', height: '80vh', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>👁 Предпросмотр результата</span>
              <button onClick={() => setPreviewFiles(null)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <SandpackView files={previewFiles} activeFile={previewActive} setActiveFile={setPreviewActive} theme={currentTheme === 'light' ? 'light' : 'dark'} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
