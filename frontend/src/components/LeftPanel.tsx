import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Plus, Layout, Trash2, Settings,
  ChevronDown, Mic, Paperclip, History,
  X, Clock, RotateCcw, GitBranch,
  Undo2, Redo2, Square, Copy,
} from 'lucide-react';
import type { Snapshot, Attachment } from '../hooks/useStudio';
import { useAuth } from '../contexts/AuthContext';
// ProjectsList removed — see ProjectsScreen

// ── Интерфейс пропсов ──────────────────────────────────────────────────────

interface GenerationReport {
  mode: 'NEW' | 'EDIT';
  theme: string;
  filesCreated: string[];
  filesModified: string[];
  pageCount: number;
  duration: number;
}

interface ChatMessage {
  role: string;
  content: string;
  type?: string;
  report?: GenerationReport;
  questions?: string[];
}

interface Project {
  id: string;
  name: string;
  description: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
}

interface LeftPanelProps {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  progress: number;
  currentPhase: string;
  scrollRef: React.RefObject<HTMLDivElement>;
  projects: Project[];
  currentProjectId: string | null;
  onNewProject: () => void;
  onLoadProject: (p: Project) => void;
  onDeleteProject: (id: string) => void;
  onSettings: () => void;
  setTheme: (t: 'dark' | 'medium' | 'light') => void;
  currentTheme: 'dark' | 'medium' | 'light';
  // snapshots
  snapshots: Snapshot[];
  currentSnapshotId: string | null;
  currentVersion: number;
  onRestoreSnapshot: (s: Snapshot) => void;
  // undo / redo
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // AI context
  fullContextMode: boolean;
  setFullContextMode: (v: boolean) => void;
  activeFile: string;
  // billing
  sessionCost: number;
  sessionTokens: number;
  projectCost: number;
  selectedModel: string;
  // auto-routing
  autoRoute?:          boolean;
  setAutoRoute?:       (v: boolean) => void;
  // generation mode
  generationMode?:     'landing' | 'app' | 'superapp';
  setGenerationMode?:  (v: 'landing' | 'app' | 'superapp') => void;
  // language
  appLanguage?:   string;
  // attachments
  attachments?:      Attachment[];
  addAttachment?:    (a: Attachment) => void;
  removeAttachment?: (id: string) => void;
  // blueprint confirmation
  pendingPlan?:      object | null;
  confirmPlan?:      () => void;
  cancelPlan?:       () => void;
}

// ── i18n labels ───────────────────────────────────────────────────────────

const LABELS: Record<string, Record<string, string>> = {
  en: {
    file: 'File', voice: 'Voice', history: 'History',
    noProjects: 'No projects yet', recent: 'Recent Projects',
    settings: 'Settings', newProject: 'New Project',
    placeholder: 'How can we build today?',
    emptyTagline: 'Describe your idea below, or pick one from the ⚡ sidebar',
    billing: 'Project Billing', session: 'Session', total: 'Total',
  },
  ru: {
    file: 'Файл', voice: 'Голос', history: 'История',
    noProjects: 'Нет проектов', recent: 'Последние проекты',
    settings: 'Настройки', newProject: 'Новый проект',
    placeholder: 'Что строим сегодня?',
    emptyTagline: 'Опишите идею ниже или выберите из ⚡ сайдбара',
    billing: 'Биллинг проекта', session: 'Сессия', total: 'Итого',
  },
  es: {
    file: 'Archivo', voice: 'Voz', history: 'Historial',
    noProjects: 'Sin proyectos', recent: 'Proyectos recientes',
    settings: 'Ajustes', newProject: 'Nuevo proyecto',
    placeholder: '¿Qué construimos hoy?',
    emptyTagline: 'Describe tu idea abajo o elige del ⚡ panel lateral',
    billing: 'Facturación', session: 'Sesión', total: 'Total',
  },
  de: {
    file: 'Datei', voice: 'Stimme', history: 'Verlauf',
    noProjects: 'Keine Projekte', recent: 'Letzte Projekte',
    settings: 'Einstellungen', newProject: 'Neues Projekt',
    placeholder: 'Was bauen wir heute?',
    emptyTagline: 'Beschreibe deine Idee unten oder wähle aus dem ⚡ Menü',
    billing: 'Abrechnung', session: 'Sitzung', total: 'Gesamt',
  },
  fr: {
    file: 'Fichier', voice: 'Voix', history: 'Historique',
    noProjects: 'Aucun projet', recent: 'Projets récents',
    settings: 'Paramètres', newProject: 'Nouveau projet',
    placeholder: "Que construisons-nous aujourd'hui?",
    emptyTagline: 'Décrivez votre idée ci-dessous ou choisissez dans le ⚡ panneau',
    billing: 'Facturation', session: 'Session', total: 'Total',
  },
  zh: {
    file: '文件', voice: '语音', history: '历史',
    noProjects: '暂无项目', recent: '最近项目',
    settings: '设置', newProject: '新项目',
    placeholder: '今天构建什么？',
    emptyTagline: '在下方描述您的想法，或从 ⚡ 侧栏选择',
    billing: '项目账单', session: '本次', total: '合计',
  },
};

// ── Вспомогательные компоненты ────────────────────────────────────────────

const TypingDots = () => (
  <div className="flex items-center gap-1 px-1 py-0.5">
    {[0, 1, 2].map(i => (
      <span key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
        style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }} />
    ))}
  </div>
);

const GenerationReportCard: React.FC<{
  report: GenerationReport;
  content: string;
  isDark: boolean;
  textColor: string;
  subText: string;
}> = ({ report, content, isDark, textColor, subText }) => {
  const isNew = report.mode === 'NEW';
  const allFiles = isNew
    ? report.filesCreated
    : [...report.filesModified, ...report.filesCreated];
  const accent = isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.1)';
  const border = isDark ? 'rgba(16,185,129,0.22)' : 'rgba(16,185,129,0.18)';
  return (
    <div className="max-w-[92%]" style={{
      background: accent,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '11px 14px',
      userSelect: 'text',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 14 }}>{isNew ? '✅' : '✏️'}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{content}</span>
      </div>
      <div style={{ fontSize: 11, color: subText, marginBottom: 7 }}>
        {report.theme !== 'default' ? `Theme: ${report.theme} · ` : ''}
        {report.pageCount > 0 ? `${report.pageCount} page${report.pageCount !== 1 ? 's' : ''} · ` : ''}
        {`${report.duration}s`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {allFiles.slice(0, 8).map(f => {
          const isMod = !isNew && report.filesModified.includes(f);
          return (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span>{isMod ? '📝' : '📄'}</span>
              <span style={{ fontFamily: 'monospace', color: textColor, opacity: 0.8 }}>
                {f}{isMod ? ' (modified)' : ''}
              </span>
            </div>
          );
        })}
        {allFiles.length > 8 && (
          <div style={{ fontSize: 11, color: subText, marginTop: 1 }}>
            +{allFiles.length - 8} more
          </div>
        )}
      </div>
    </div>
  );
};

const ClarificationCard: React.FC<{
  questions: string[];
  isDark: boolean;
  textColor: string;
  subText: string;
}> = ({ questions, isDark, textColor, subText }) => {
  const accent = isDark ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.07)';
  const border = isDark ? 'rgba(139,92,246,0.22)' : 'rgba(139,92,246,0.18)';
  return (
    <div className="max-w-[92%]" style={{
      background: accent,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '11px 14px',
      userSelect: 'text',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>🤔</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>
          A couple of questions before I start:
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {questions.map((q, i) => (
          <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: textColor, lineHeight: 1.5 }}>
            <span style={{ color: subText, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
            <span>{q}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: subText }}>
        Just type your answer below ↓
      </div>
    </div>
  );
};

const THEME_COLORS: Record<string, string> = {
  'dark-slate': '#475569',
  'trust':      '#3b82f6',
  'warm':       '#f59e0b',
  'neon':       '#22d3ee',
  'bloom':      '#ec4899',
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH} ч назад`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ── Основной компонент ────────────────────────────────────────────────────

export const LeftPanel: React.FC<LeftPanelProps> = ({
  messages, input, setInput, onSend, onStop, isGenerating, progress, currentPhase, scrollRef,
  projects, currentProjectId, onNewProject, onLoadProject, onDeleteProject,
  onSettings, setTheme, currentTheme,
  snapshots, currentSnapshotId, currentVersion, onRestoreSnapshot,
  canUndo, canRedo, onUndo, onRedo,
  fullContextMode, setFullContextMode, activeFile,
  sessionCost, sessionTokens, projectCost, selectedModel,
  autoRoute = false, setAutoRoute = () => {},
  generationMode = 'app', setGenerationMode = () => {},
  appLanguage = 'en',
  attachments = [], addAttachment = () => {}, removeAttachment = () => {},
  pendingPlan = null, confirmPlan = () => {}, cancelPlan = () => {},
}) => {
  const lang = LABELS[appLanguage] ?? LABELS['en'];
  const t = (key: string) => lang[key] ?? LABELS['en'][key] ?? key;
  const { user: authUser, loading: authLoading, signInWithGoogle, signOut: authSignOut } = useAuth();
  const [projectsOpen, setProjectsOpen]       = useState(true); // kept for billing widget positioning
  const [historyOpen, setHistoryOpen]         = useState(false);
  const [previewSnap, setPreviewSnap]         = useState<Snapshot | null>(null);
  const [showModeSelect, setShowModeSelect]   = useState(false);
  const [copiedIdx, setCopiedIdx]             = useState<string | null>(null);
  const [isDragging, setIsDragging]           = useState(false);
  const [isDraggingInput, setIsDraggingInput] = useState(false);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Resize image to max 1920px wide and return JPEG data-URI (~85% quality). */
  const resizeImage = (file: File): Promise<string> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1920;
          const ratio = Math.min(1, MAX / img.width);
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    });

  /** Dynamically loads pdf.js from CDN (once) and extracts text from the first 5 pages. */
  async function extractPdfText(base64: string): Promise<string> {
    if (!(window as any).pdfjsLib) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload  = () => resolve();
        script.onerror = () => reject(new Error('Failed to load pdf.js'));
        document.head.appendChild(script);
      });
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const pdfjsLib = (window as any).pdfjsLib;
    const binaryStr = atob(base64.split(',')[1]);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const texts: string[] = [];
    const maxPages = Math.min(pdf.numPages, 5);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      texts.push(content.items.map((item: any) => item.str).join(' '));
    }
    return texts.join('\n\n').slice(0, 3000);
  }

  const handleFileSelect = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(async file => {
      if (file.size > 10 * 1024 * 1024) {
        console.warn(`File too large: ${file.name} (max 10MB)`);
        return;
      }
      if (file.type.startsWith('image/')) {
        const dataUri = await resizeImage(file);
        addAttachment({
          id:       crypto.randomUUID(),
          name:     file.name,
          type:     'image',
          data:     dataUri,
          mimeType: 'image/jpeg',
        });
      } else if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async ev => {
          const base64 = ev.target?.result as string;
          let textContent: string | undefined;
          try {
            textContent = await extractPdfText(base64);
            console.log(`[Intake] PDF extracted: ${textContent.length} chars`);
          } catch (e) {
            console.warn(`[Intake] PDF extraction failed: ${e}`);
          }
          addAttachment({
            id:          crypto.randomUUID(),
            name:        file.name,
            type:        'pdf',
            data:        base64,
            mimeType:    file.type,
            textContent,
          });
        };
        reader.readAsDataURL(file);
      } else {
        // Plain text / code — append content to the textarea
        const reader = new FileReader();
        reader.onload = ev => {
          const text = ev.target?.result as string;
          setInput(input + (input ? '\n\n' : '') + text);
        };
        reader.readAsText(file);
      }
    });
  };

  const isDark      = currentTheme !== 'light';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const panelBg     = isDark ? '#0a0a0a' : '#ffffff';
  const subText     = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)';
  const textColor   = isDark ? 'rgba(255,255,255,0.85)' : '#111';
  const hoverBg     = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
  const inputBg     = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

  // Compute current project name for registry display
  const projectName = currentProjectId
    ? projects.find(p => p.id === currentProjectId)?.name || 'Unnamed'
    : '';

  const phaseColor  =
    currentPhase === 'verify' ? '#f59e0b' :
    currentPhase === 'code'   ? '#818cf8' :
    currentPhase === 'plan'   ? '#3b82f6' :
    '#3b82f6';

  const phaseLabel  =
    currentPhase === 'think'  ? 'Анализ...'    :
    currentPhase === 'plan'   ? 'Планирование' :
    currentPhase === 'code'   ? 'Кодирование'  :
    currentPhase === 'verify' ? 'Проверка'     : '';

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }, [input]);

  // Auto-scroll to latest message
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col shrink-0 transition-colors duration-500 relative"
      style={{ width: 360, height: '100vh', background: panelBg, borderRight: `1px solid ${borderColor}`, zIndex: 40 }}>

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: `1px solid ${borderColor}` }}>
        <div className="flex items-center gap-2.5">
          <span onDoubleClick={onSettings}
            className="text-[10px] tracking-[0.35em] font-bold uppercase cursor-pointer hover:text-blue-400 transition-colors select-none"
            style={{ color: subText }}>
            AIC-RG STUDIO <span style={{ opacity: 0.4 }}>PRO</span>
          </span>
          {snapshots.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
              <GitBranch size={9} /> v{currentVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(['dark', 'medium', 'light'] as const).map(t => (
            <button key={t} onClick={() => setTheme(t)} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: t === 'dark' ? '#111' : t === 'medium' ? '#666' : '#fff',
              border: `1px solid ${t === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)'}`,
              outline: currentTheme === t ? '2px solid #3b82f6' : 'none',
              outlineOffset: 2,
              transform: currentTheme === t ? 'scale(1.15)' : 'scale(1)',
              opacity: currentTheme === t ? 1 : 0.3,
              transition: 'all .15s',
            }} />
          ))}
        </div>
      </header>

      {/* Projects list removed — see Projects screen (📁 icon in sidebar) */}

      {/* ── CHAT SECTION (messages + input) — takes remaining space ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

      {/* ── MESSAGES / EMPTY STATE ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar relative" style={{ minHeight: 0 }}
        onDragOver={e  => { e.preventDefault(); setIsDragging(true);  }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files); }}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 pointer-events-none"
            style={{ background: 'rgba(59,130,246,0.07)', border: '2px dashed rgba(59,130,246,0.4)', borderRadius: 8, margin: 8 }}>
            <Paperclip size={22} style={{ color: '#60a5fa' }} />
            <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>Drop images here</span>
          </div>
        )}
        {!hasMessages ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 10, opacity: 0.35,
            userSelect: 'none',
          }}>
            <svg width="26" height="26" viewBox="0 0 16 16" fill="currentColor" style={{ color: isDark ? '#fff' : '#000' }}>
              <rect x="1"   y="1"   width="5.5" height="5.5" rx="1.5" opacity="0.9"/>
              <rect x="9.5" y="1"   width="5.5" height="5.5" rx="1.5" opacity="0.45"/>
              <rect x="1"   y="9.5" width="5.5" height="5.5" rx="1.5" opacity="0.45"/>
              <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.5" opacity="0.9"/>
            </svg>
            <div style={{ fontSize: 12, fontWeight: 600, color: textColor, letterSpacing: '0.06em' }}>
              AIC-RG Studio
            </div>
            <div style={{ fontSize: 11, color: subText, textAlign: 'center', lineHeight: 1.5, maxWidth: 180 }}>
              {t('emptyTagline')}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {messages.map((m, i) => {
              const isUser          = m.role === 'user';
              const isTyping        = !isUser && m.content === '...' && isGenerating;
              const isReport        = m.type === 'generation-report' && !!m.report;
              const isClarification = m.type === 'clarification' && Array.isArray(m.questions) && (m.questions as string[]).length > 0;
              const isPlan          = m.type === 'generation-plan';
              const isBlueprint     = m.type === 'blueprint';

              if (isBlueprint) {
                const isPending = pendingPlan !== null;
                const bpPages: string[] = (m as any).pages ?? [];
                return (
                  <div key={(m as any).id ?? i} style={{
                    background: 'var(--card)',
                    border: '1px solid rgba(99,102,241,0.4)',
                    borderRadius: 12,
                    overflow: 'hidden',
                    margin: '8px 0',
                  }}>
                    {/* Header */}
                    <div style={{
                      padding: '12px 16px',
                      background: 'rgba(99,102,241,0.08)',
                      borderBottom: '1px solid rgba(99,102,241,0.2)',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{
                          fontSize: 13, fontWeight: 700,
                          color: textColor,
                        }}>
                          {(m as any).appName}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: subText,
                          marginTop: 2,
                        }}>
                          {bpPages.length} screens · {(m as any).theme} theme
                        </div>
                      </div>
                      {isPending && (
                        <div style={{
                          fontSize: 10, padding: '3px 8px',
                          borderRadius: 10,
                          background: 'rgba(251,191,36,0.15)',
                          color: '#f59e0b',
                          fontWeight: 600,
                        }}>
                          Awaiting confirmation
                        </div>
                      )}
                    </div>

                    {/* Blueprint text */}
                    <div style={{
                      padding: '12px 16px',
                      fontSize: 12,
                      color: textColor,
                      lineHeight: 1.6,
                      maxHeight: isPending ? 400 : 200,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {(m as any).blueprintText}
                    </div>

                    {/* Technical Blueprint — collapsible secondary diagnostics */}
                    {(m as any).technicalBlueprint && JSON.stringify((m as any).technicalBlueprint).length > 20 && (
                      <details style={{
                        margin: '0 16px 12px',
                        borderRadius: 8,
                        border: `1px solid ${borderColor}`,
                        overflow: 'hidden',
                      }}>
                        <summary style={{
                          padding: '8px 12px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: subText,
                          cursor: 'pointer',
                          background: 'rgba(99,102,241,0.05)',
                          userSelect: 'none',
                        }}>
                          Technical Blueprint
                        </summary>
                        <pre style={{
                          padding: '10px 12px',
                          fontSize: 10,
                          color: subText,
                          lineHeight: 1.5,
                          maxHeight: 300,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          margin: 0,
                          fontFamily: 'monospace',
                        }}>
                          {JSON.stringify((m as any).technicalBlueprint, null, 2)}
                        </pre>
                      </details>
                    )}

                    {/* Buttons — only while awaiting confirmation */}
                    {isPending && (
                      <div style={{
                        padding: '12px 16px',
                        borderTop: `1px solid ${borderColor}`,
                        display: 'flex', gap: 8,
                      }}>
                        <button
                          onClick={confirmPlan}
                          style={{
                            flex: 1, padding: '9px',
                            borderRadius: 8, cursor: 'pointer',
                            background: '#6366f1',
                            border: 'none',
                            color: '#fff',
                            fontSize: 13, fontWeight: 600,
                          }}
                        >
                          Build it
                        </button>
                        <button
                          onClick={cancelPlan}
                          style={{
                            padding: '9px 16px',
                            borderRadius: 8, cursor: 'pointer',
                            background: 'transparent',
                            border: `1px solid ${borderColor}`,
                            color: subText,
                            fontSize: 13,
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              if (isPlan) {
                const isDone      = (m as any).buildStatus === 'ready';
                const isBuilding  = (m as any).buildStatus === 'building';
                const steps: Array<{ id: string; label: string; status: string }> = (m as any).steps ?? [];
                const pages: string[] = (m as any).pages ?? [];
                const appName: string = (m as any).appName ?? '';
                const progress: number = (m as any).progress ?? 0;
                const streamingCode: string = (m as any).streamingCode ?? '';
                return (
                  <div key={(m as any).id ?? i} style={{
                    background: 'var(--card)',
                    border: `1px solid ${isDone ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.3)'}`,
                    borderRadius: 12, padding: '14px 16px', margin: '8px 0',
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      {isDone ? (
                        <span style={{ fontSize: 16 }}>✅</span>
                      ) : (
                        <div style={{
                          width: 14, height: 14, flexShrink: 0,
                          border: '2px solid rgba(99,102,241,0.3)',
                          borderTopColor: '#6366f1', borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: textColor }}>
                          {isDone
                            ? `${appName || 'App'} ready`
                            : appName ? `Building ${appName}…` : 'Analyzing your idea…'}
                        </div>
                        {isBuilding && (
                          <div style={{ fontSize: 11, color: subText, marginTop: 2 }}>
                            Vite is compiling…
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Steps */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {steps.map(step => (
                        <div key={step.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          fontSize: 12,
                          opacity: step.status === 'pending' ? 0.4 : 1,
                          color: textColor,
                        }}>
                          {step.status === 'done' && <span style={{ color: '#22c55e', fontSize: 11 }}>✓</span>}
                          {step.status === 'active' && <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#6366f1', flexShrink: 0,
                            animation: 'pulse 1.5s ease infinite',
                          }} />}
                          {step.status === 'pending' && <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            border: '1px solid var(--border)', flexShrink: 0,
                          }} />}
                          {step.label}
                        </div>
                      ))}
                    </div>

                    {/* Progress bar */}
                    {!isDone && (
                      <div style={{
                        marginTop: 10, height: 2, borderRadius: 1,
                        background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', width: `${progress}%`,
                          background: '#6366f1', transition: 'width 0.5s ease',
                        }} />
                      </div>
                    )}

                    {/* Pages */}
                    {pages.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        {pages.map(p => (
                          <span key={p} style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 20,
                            background: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                            color: '#818cf8',
                          }}>{p}</span>
                        ))}
                      </div>
                    )}

                    {/* Streaming code — collapsible */}
                    {streamingCode && (
                      <details style={{ marginTop: 10 }}>
                        <summary style={{
                          fontSize: 11, color: subText,
                          cursor: 'pointer', userSelect: 'none',
                        }}>
                          {isDone
                            ? 'View code'
                            : `Generating… (${Math.round(streamingCode.length / 1000)}k chars)`}
                        </summary>
                        <div style={{ position: 'relative', marginTop: 6 }}>
                          <pre style={{
                            padding: 8, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                            borderRadius: 6, fontSize: 10, fontFamily: 'monospace',
                            overflow: 'auto', maxHeight: 180,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                            color: subText, margin: 0,
                          }}>
                            {isDone ? streamingCode.slice(0, 3000) : streamingCode.slice(-2000)}
                          </pre>
                          {isDone && (
                            <button
                              onClick={() => navigator.clipboard.writeText(streamingCode)}
                              style={{
                                position: 'absolute', top: 6, right: 6,
                                padding: '3px 8px', fontSize: 10, borderRadius: 4,
                                border: `1px solid ${borderColor}`,
                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                                color: subText, cursor: 'pointer',
                              }}
                            >Copy</button>
                          )}
                        </div>
                      </details>
                    )}

                    <style>{`
                      @keyframes spin  { to { transform: rotate(360deg); } }
                      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
                    `}</style>
                  </div>
                );
              }

              return (
                <div key={(m as any).id} className={`flex flex-col group ${isUser ? 'items-end' : 'items-start'}`}
                  style={{ animation: 'fadeSlideIn 0.2s ease both' }}>
                  {isClarification ? (
                    <ClarificationCard
                      questions={m.questions as string[]}
                      isDark={isDark}
                      textColor={textColor}
                      subText={subText}
                    />
                  ) : isReport && m.report ? (
                    <GenerationReportCard
                      report={m.report}
                      content={m.content}
                      isDark={isDark}
                      textColor={textColor}
                      subText={subText}
                    />
                  ) : (
                    <div className="relative max-w-[92%]">
                      <div className="allow-copy px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed"
                        style={{
                          background: isUser ? 'rgba(59,130,246,0.12)' : hoverBg,
                          border: `1px solid ${isUser ? 'rgba(59,130,246,0.2)' : borderColor}`,
                          color: textColor,
                          userSelect: 'text',
                        }}>
                        {isTyping ? <TypingDots /> : (() => {
                          // content may be a vision array: [{type:'image_url',...},{type:'text',...}]
                          const imgUrls: string[] = Array.isArray(m.content)
                            ? (m.content as Array<{type: string; image_url?: {url: string}}>)
                                .filter(c => c.type === 'image_url')
                                .map(c => c.image_url?.url ?? '')
                                .filter(Boolean)
                            : [];
                          const textContent: string = Array.isArray(m.content)
                            ? (m.content as Array<{type: string; text?: string}>)
                                .filter(c => c.type === 'text')
                                .map(c => c.text ?? '')
                                .join(' ')
                            : (m.content as string);
                          return (
                            <>
                              {imgUrls.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-1">
                                  {imgUrls.map((url, idx) => (
                                    <img key={idx} src={url} alt="attachment"
                                      style={{ maxHeight: 80, maxWidth: 120, borderRadius: 6, objectFit: 'cover' }} />
                                  ))}
                                </div>
                              )}
                              <div className={`allow-copy prose prose-sm max-w-none ${isDark ? 'prose-invert' : 'prose-slate'}`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {!isUser && !isTyping && (
                        <button
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded-md transition-all"
                          style={{
                            color: subText,
                            background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                          }}
                          onClick={() => {
                            navigator.clipboard.writeText(m.content as string).catch(() => {});
                            const msgId = (m as any).id as string;
                            setCopiedIdx(msgId);
                            setTimeout(() => setCopiedIdx(c => c === msgId ? null : c), 2000);
                          }}
                          title="Copy response">
                          {copiedIdx === (m as any).id
                            ? <span style={{ fontSize: 10, color: '#4ade80' }}>✓</span>
                            : <Copy size={11} />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="h-2" />
          </div>
        )}
      </div>

      {/* ── INPUT ── */}
      <div className="shrink-0 px-3 pb-3 relative" style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 10 }}
        onDragOver={e => { e.preventDefault(); setIsDraggingInput(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingInput(false); }}
        onDrop={e => { e.preventDefault(); setIsDraggingInput(false); handleFileSelect(e.dataTransfer.files); }}
      >
        {isDraggingInput && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            backgroundColor: 'rgba(99,102,241,0.1)',
            border: '2px dashed #6366f1',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#6366f1', fontWeight: 600,
            pointerEvents: 'none',
            gap: 6,
          }}>
            <Paperclip size={15} />
            Drop image or PDF here
          </div>
        )}

        {/* toolbar — left-aligned, compact, AUTO first */}
        <div className="flex items-center mb-2 px-1" style={{ gap: 2, overflowX: 'auto' }}>

          {/* 1 — AUTO toggle (first) */}
          <button
            onClick={() => setAutoRoute(!autoRoute)}
            title={autoRoute ? 'Auto-routing ON — click to disable' : 'Auto-routing OFF — click to enable'}
            className="flex items-center gap-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0"
            style={{
              padding: '4px 7px',
              background: autoRoute ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
              color:      autoRoute ? '#fbbf24' : subText,
              border:    `1px solid ${autoRoute ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`,
              boxShadow:  autoRoute ? '0 0 8px rgba(251,191,36,0.18)' : 'none',
              transition: 'all 0.2s',
            }}>
            🤖 AUTO
          </button>

          {/* 2 — Generation mode toggle: App / Landing / Superapp */}
          {(['app', 'landing', 'superapp'] as const).map(m => (
            <button key={m}
              onClick={() => setGenerationMode(m)}
              title={m === 'app' ? 'Full app with multiple pages' : m === 'landing' ? 'Single-page landing' : 'Super app (complex multi-module)'}
              className="flex items-center gap-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0"
              style={{
                padding: '4px 7px',
                background: generationMode === m ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                color:      generationMode === m ? '#a78bfa' : subText,
                border:    `1px solid ${generationMode === m ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                transition: 'all 0.2s',
              }}>
              {m === 'app' ? '⬡ APP' : m === 'landing' ? '⬢ PAGE' : '⬟ SUPER'}
            </button>
          ))}

          {/* 4 — ALL / FILE context toggle */}
          <button
            onClick={() => setFullContextMode(!fullContextMode)}
            title={fullContextMode ? 'Context: all files' : `Context: ${activeFile} only`}
            className="flex items-center gap-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0"
            style={{
              padding: '4px 7px',
              background: fullContextMode ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
              color:      fullContextMode ? '#60a5fa' : subText,
              border:    `1px solid ${fullContextMode ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
            }}>
            {fullContextMode ? '⊞ ALL' : '⊡ FILE'}
          </button>

          {/* thin divider */}
          <div style={{ width: 1, height: 14, background: borderColor, flexShrink: 0, margin: '0 1px' }} />

          {/* 5 — File / Voice / History */}
          {[
            { icon: <Paperclip size={11} />, label: t('file'),    onClick: () => fileInputRef.current?.click() },
            { icon: <Mic size={11} />,       label: t('voice'),   onClick: () => {} },
            { icon: <History size={11} />,   label: t('history'), onClick: () => setHistoryOpen(true) },
          ].map(btn => (
            <button key={btn.label} onClick={btn.onClick}
              className="flex items-center gap-0.5 rounded-lg text-[10px] font-medium transition-all hover:bg-blue-500/10 hover:text-blue-400 shrink-0"
              style={{ color: subText, padding: '4px 6px' }}>
              {btn.icon} {btn.label}
              {btn.label === t('history') && snapshots.length > 0 && (
                <span className="ml-0.5 px-1 py-0 rounded-full text-[9px] font-bold"
                  style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                  {snapshots.length}
                </span>
              )}
            </button>
          ))}

          {/* thin divider */}
          <div style={{ width: 1, height: 14, background: borderColor, flexShrink: 0, margin: '0 1px' }} />

          {/* 4 — Undo / Redo */}
          <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className="flex items-center justify-center rounded-lg transition-all hover:bg-blue-500/10 disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
            style={{ color: canUndo ? '#60a5fa' : subText, width: 26, height: 26 }}>
            <Undo2 size={11} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"
            className="flex items-center justify-center rounded-lg transition-all hover:bg-blue-500/10 disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
            style={{ color: canRedo ? '#60a5fa' : subText, width: 26, height: 26 }}>
            <Redo2 size={11} />
          </button>
        </div>

        {/* progress bar — visible only while generating */}
        {isGenerating && (
          <div style={{ marginBottom: 8 }}>
            <div style={{
              height: 3, borderRadius: 2, overflow: 'hidden',
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${progress}%`,
                background: phaseColor,
                transition: 'width 0.5s ease, background 0.3s ease',
                boxShadow: `0 0 6px ${phaseColor}80`,
              }} />
            </div>
            {phaseLabel && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: 4, fontSize: 10, fontWeight: 600,
                color: phaseColor, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                <span>{phaseLabel}</span>
                <span>{progress}%</span>
              </div>
            )}
          </div>
        )}

        {/* Attachment thumbnails */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map(att => (
              <div key={att.id} className="relative flex items-center gap-1 rounded-lg overflow-hidden shrink-0"
                style={{ background: inputBg, border: `1px solid ${borderColor}` }}>
                {att.type === 'image' ? (
                  <img src={att.data} alt={att.name}
                    className="object-cover"
                    style={{ width: 44, height: 44, flexShrink: 0 }} />
                ) : att.type === 'pdf' ? (
                  <div className="flex flex-col items-center justify-center gap-0.5"
                    style={{ width: 44, height: 44, flexShrink: 0 }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>📄</span>
                    <span style={{ fontSize: 8, color: subText, fontWeight: 600 }}>PDF</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center"
                    style={{ width: 44, height: 44, flexShrink: 0 }}>
                    <Paperclip size={16} style={{ color: subText }} />
                  </div>
                )}
                <div className="flex flex-col justify-center" style={{ maxWidth: 72, paddingRight: 2 }}>
                  <span className="text-[9px] truncate leading-tight" style={{ color: subText }}>
                    {att.name}
                  </span>
                </div>
                <button onClick={() => removeAttachment(att.id)}
                  className="p-0.5 mr-1 rounded hover:text-red-400 transition-colors"
                  style={{ color: subText }}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* textarea + send / stop */}
        <div className="flex items-end gap-2 rounded-2xl p-2"
          style={{ background: inputBg, border: `1px solid ${borderColor}` }}>
          <textarea ref={textareaRef} rows={1} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), !isGenerating && onSend())}
            placeholder={t('placeholder')}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-3 resize-none outline-none"
            style={{ color: textColor, minHeight: 44, maxHeight: 128 }} />

          {isGenerating ? (
            <button onClick={onStop} title="Stop generation"
              className="p-2.5 rounded-xl text-white transition-all active:scale-90 shrink-0"
              style={{ background: '#dc2626' }}>
              <Square size={18} fill="currentColor" strokeWidth={0} />
            </button>
          ) : (
            <button onClick={onSend} disabled={!input.trim()}
              className="p-2.5 rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-500 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" className="hidden"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.ts,.tsx,.js,.jsx,.css,.json,.md"
          multiple
          onChange={e => { handleFileSelect(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* ── PROJECTS ── */}
      <div className="shrink-0" style={{ borderTop: `1px solid ${borderColor}` }}>
        <div className="px-3 pt-3 pb-2">
          <button onClick={() => setShowModeSelect(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white rounded-xl transition-all text-sm font-medium"
            style={{ boxShadow: '0 4px 16px rgba(37,99,235,0.25)' }}>
            <Plus size={16} /> {t('newProject')}
          </button>
        </div>

        {/* ── MODE SELECT OVERLAY ── */}
        {showModeSelect && (
          <div className="absolute inset-0 z-50 flex flex-col"
            style={{ background: isDark ? 'rgba(5,5,5,0.96)' : 'rgba(249,250,251,0.97)', backdropFilter: 'blur(8px)' }}>
            <div className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ borderBottom: `1px solid ${borderColor}` }}>
              <span className="text-sm font-semibold" style={{ color: textColor }}>
                {appLanguage === 'ru' ? 'Выберите тип проекта' : 'Choose project type'}
              </span>
              <button onClick={() => setShowModeSelect(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                style={{ color: subText }}>
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 flex flex-col gap-3 px-4 py-5 overflow-y-auto">
              {([
                {
                  mode: 'landing' as const,
                  icon: '⬢',
                  title: appLanguage === 'ru' ? 'Лендинг' : 'Landing',
                  subtitle: appLanguage === 'ru' ? 'до 3 стр' : 'up to 3 pages',
                  desc: appLanguage === 'ru'
                    ? 'Промо, визитка, портфолио — быстро и красиво'
                    : 'Promo, portfolio, business card — fast and beautiful',
                  color: '#3b82f6',
                  bg: 'rgba(59,130,246,0.08)',
                  border: 'rgba(59,130,246,0.25)',
                },
                {
                  mode: 'app' as const,
                  icon: '⬡',
                  title: appLanguage === 'ru' ? 'Приложение' : 'Application',
                  subtitle: appLanguage === 'ru' ? '3–8 стр' : '3–8 pages',
                  desc: appLanguage === 'ru'
                    ? 'Трекер, менеджер, дашборд — полноценный продукт'
                    : 'Tracker, manager, dashboard — fully featured product',
                  color: '#8b5cf6',
                  bg: 'rgba(139,92,246,0.08)',
                  border: 'rgba(139,92,246,0.25)',
                },
                {
                  mode: 'superapp' as const,
                  icon: '⬟',
                  title: appLanguage === 'ru' ? 'Супер-апп' : 'Super App',
                  subtitle: appLanguage === 'ru' ? '8+ стр' : '8+ pages',
                  desc: appLanguage === 'ru'
                    ? 'Полноценный продукт уровня Momna — сложная архитектура'
                    : 'Full product with complex architecture and many modules',
                  color: '#a855f7',
                  bg: 'rgba(168,85,247,0.08)',
                  border: 'rgba(168,85,247,0.25)',
                },
              ] as const).map(({ mode, icon, title, subtitle, desc, color, bg, border }) => (
                <button key={mode}
                  onClick={() => {
                    setGenerationMode(mode);
                    setShowModeSelect(false);
                    onNewProject();
                  }}
                  className="w-full text-left rounded-2xl transition-all active:scale-[0.98] hover:opacity-90"
                  style={{ background: bg, border: `1px solid ${border}`, padding: '16px 18px' }}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span style={{ fontSize: 22 }}>{icon}</span>
                    <div>
                      <span className="font-semibold text-sm" style={{ color }}>{title}</span>
                      <span className="ml-2 text-[11px] font-medium rounded-full px-2 py-0.5"
                        style={{ background: `${color}22`, color }}>{subtitle}</span>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: subText }}>{desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent projects removed — see Projects screen (📁 icon in sidebar) */}
        {projects.length > 0 && currentProjectId && (() => {
          const cur = projects.find((p: any) => p.id === currentProjectId);
          if (!cur) return null;
          return (
            <div className="px-4 pb-2 pt-1 flex items-center gap-2" style={{ color: subText }}>
              <span className="w-2 h-2 rounded-full shrink-0"
                style={{ background: THEME_COLORS[(cur as any).theme] ?? '#475569' }} />
              <span className="text-[11px] truncate flex-1" style={{ color: textColor }}>
                {(cur as any).name || 'Untitled'}
              </span>
              <span className="text-[10px]" style={{ color: subText }}>current</span>
            </div>
          );
        })()}

        {/* ── BILLING WIDGET ── */}
        {(sessionCost > 0 || projectCost > 0) && (() => {
          const modelShort = (selectedModel ?? '').split('/').pop()?.replace(/:free$/, '') ?? '—';
          const fmtCost = (n: number) => n < 0.0001 ? '$0.0000' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;
          const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
          return (
            <div style={{ margin: '0 12px 8px', padding: '10px 12px', borderRadius: 12, background: isDark ? 'rgba(15,23,42,0.7)' : 'rgba(0,0,0,0.04)', border: `1px solid ${borderColor}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: subText, marginBottom: 7 }}>
                {t('billing')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                <span style={{ fontSize: 10, color: subText }}>{t('session')}</span>
                <span style={{ fontSize: 10, color: subText }}>{t('total')}</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#4ade80' }}>{fmtCost(sessionCost)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: textColor }}>{fmtCost(projectCost)}</span>
              </div>
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: subText }}>
                  {fmtTokens(sessionTokens)} tokens
                </span>
                <span style={{ fontSize: 9, color: subText, fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {modelShort}
                </span>
              </div>
            </div>
          );
        })()}


        <div className="px-3 pb-3" style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 10 }}>
          {/* ── AUTH WIDGET ── */}
          {authLoading ? null : authUser ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', marginBottom: 6,
                borderRadius: 8,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                cursor: 'pointer',
              }} onClick={authSignOut} title="Sign out">
                {authUser.avatar_url ? (
                  <img src={authUser.avatar_url} alt=""
                    style={{ width: 22, height: 22, borderRadius: '50%' }} />
                ) : (
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: '#6366f1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#fff', fontWeight: 600,
                  }}>
                    {(authUser.name ?? authUser.email ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <span style={{ fontSize: 11, color: subText,
                               maxWidth: 80, overflow: 'hidden',
                               textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {authUser.name ?? authUser.email}
                </span>
              </div>
          ) : (
              <button
                onClick={signInWithGoogle}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', marginBottom: 6, borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${borderColor}`, background: 'transparent',
                  color: subText, fontSize: 11,
                  width: '100%',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>
          )}
          <button onClick={onSettings}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all hover:bg-blue-500/5"
            style={{ color: subText }}>
            <Settings size={16} /> {t('settings')}
          </button>
        </div>
      </div>

      {/* ── HISTORY DRAWER ── */}
      {historyOpen && (
        <div className="absolute inset-0 flex flex-col z-50"
          style={{ background: panelBg, borderRight: `1px solid ${borderColor}` }}>

          <div className="flex items-center justify-between px-5 py-4 shrink-0"
            style={{ borderBottom: `1px solid ${borderColor}` }}>
            <div className="flex items-center gap-2">
              <Clock size={15} style={{ color: '#60a5fa' }} />
              <span className="text-sm font-semibold" style={{ color: textColor }}>История версий</span>
              {snapshots.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                  {snapshots.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onUndo} disabled={!canUndo} title="Undo"
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                style={{ color: canUndo ? '#60a5fa' : subText }}>
                <Undo2 size={14} />
              </button>
              <button onClick={onRedo} disabled={!canRedo} title="Redo"
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                style={{ color: canRedo ? '#60a5fa' : subText }}>
                <Redo2 size={14} />
              </button>
              <button onClick={() => setHistoryOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all ml-1"
                style={{ color: subText }}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 custom-scrollbar">
              {snapshots.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3" style={{ opacity: 0.3 }}>
                  <Clock size={32} style={{ color: subText }} />
                  <span className="text-xs" style={{ color: subText }}>Версии появятся после первой генерации</span>
                </div>
              ) : (
                [...snapshots].reverse().map((snap) => {
                  const isActive     = snap.id === currentSnapshotId;
                  const isPreviewing = previewSnap?.id === snap.id;
                  return (
                    <div key={snap.id}
                      className="group relative flex flex-col gap-1.5 p-3 rounded-xl cursor-pointer transition-all"
                      style={{
                        background: isActive ? 'rgba(59,130,246,0.1)' : isPreviewing ? 'rgba(255,255,255,0.04)' : hoverBg,
                        border: `1px solid ${isActive ? 'rgba(59,130,246,0.25)' : isPreviewing ? 'rgba(255,255,255,0.1)' : borderColor}`,
                      }}
                      onMouseEnter={() => setPreviewSnap(snap)}
                      onMouseLeave={() => setPreviewSnap(null)}
                      onClick={() => { onRestoreSnapshot(snap); setHistoryOpen(false); }}>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{
                              background: isActive ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                              color: isActive ? '#60a5fa' : subText,
                            }}>
                            <GitBranch size={8} /> v{snap.version}
                          </span>
                          {isActive && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[10px]" style={{ color: subText }}>{formatTime(snap.createdAt)}</span>
                      </div>

                      <p className="text-xs leading-relaxed" style={{ color: isActive ? textColor : subText }}>
                        {snap.label}
                      </p>

                      {!isActive && (
                        <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-all">
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium"
                            style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                            <RotateCcw size={10} /> Восстановить
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Snapshot mini-preview — ALWAYS mounted; display:none avoids removeChild crash */}
            {(() => {
              const snapFiles = previewSnap?.files ?? {};
              const previewCode = previewSnap
                ? (typeof snapFiles === 'string'
                    ? snapFiles
                    : (snapFiles['index.html'] ?? Object.values(snapFiles)[0] ?? ''))
                : '';
              return (
                <div
                  className="w-40 shrink-0 flex flex-col overflow-hidden"
                  style={{
                    display: previewSnap ? 'flex' : 'none',
                    borderLeft: `1px solid ${borderColor}`,
                    background: isDark ? '#050505' : '#f0f0f0',
                  }}
                >
                  <div
                    className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-widest shrink-0"
                    style={{ color: subText, borderBottom: `1px solid ${borderColor}` }}
                  >
                    Preview v{previewSnap?.version}
                  </div>
                  <div className="flex-1 overflow-hidden pointer-events-none" style={{ background: '#fff' }}>
                    <iframe
                      srcDoc={previewCode ? `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script><style>*{margin:0;padding:0;box-sizing:border-box}body{transform:scale(0.4);transform-origin:top left;width:250%;height:250%}</style></head><body>${previewCode}</body></html>` : ''}
                      className="w-full h-full border-none"
                      style={{ pointerEvents: 'none' }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${borderColor}` }}>
            <p className="text-[10px] text-center" style={{ color: subText }}>
              Наведи для превью • Нажми для отката
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .custom-scrollbar::-webkit-scrollbar { width:4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background:transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:2px; }
      `}</style>
      </div>{/* end chat section wrapper */}
    </div>
  );
};
