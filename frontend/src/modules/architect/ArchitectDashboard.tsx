import React, { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { ProjectRepository, type ProjectRecord } from '../../services/ProjectRepository';
import { ProjectStorage } from '../../services/ProjectStorage';
import type { ProjectRevision } from '../../services/ProjectStorage';
import { getArchitectCopy } from './architectureViewModel';
import { ProjectsHub, type StudioProject } from './components/ProjectsHub';
import { BranchArchitectureScreen } from './components/BranchArchitectureScreen';
import { llmFetchStream } from '../../services/LLMProxy';
import { ConfigService } from '../../services/ConfigService';

interface ArchitectDashboardProps {
  theme: 'dark' | 'medium' | 'light';
  projects: StudioProject[];
  currentProjectId: string | null;
  onLoadProject: (p: StudioProject) => void;
  onNavigateEngine: () => void;
  appLanguage: string;
}

function useTheme(theme: 'dark' | 'medium' | 'light') {
  const isDark = theme !== 'light';
  return {
    isDark,
    bg: isDark ? '#07070b' : '#f5f5f5',
    panel: isDark ? '#0d0d12' : '#ffffff',
    panelAlt: isDark ? '#08080e' : '#f9fafb',
    border: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    text: isDark ? '#e5e5ea' : '#111827',
    sub: isDark ? '#6b6b7a' : '#6b7280',
    accent: isDark ? '#a78bfa' : '#7c3aed',
    accentBg: isDark ? 'rgba(167,139,250,0.10)' : 'rgba(124,58,237,0.07)',
    accentBorder: isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,58,237,0.22)',
    danger: '#ef4444',
  };
}

function StatePanel({
  title,
  body,
  theme,
  tone = 'neutral',
}: {
  title: string;
  body: string;
  theme: ReturnType<typeof useTheme>;
  tone?: 'neutral' | 'error';
}) {
  const color = tone === 'error' ? theme.danger : theme.accent;
  return (
    <div
      style={{
        margin: 20,
        padding: 24,
        borderRadius: 16,
        border: `1px solid ${tone === 'error' ? `${color}33` : theme.border}`,
        background: tone === 'error' ? `${color}10` : theme.panel,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: theme.sub }}>{body}</div>
    </div>
  );
}

const ProjectDetailPanel: React.FC<{
  project: any;
  theme: ReturnType<typeof useTheme>;
  onOpenInStudio: () => void;
  onBack: () => void;
  onProjectSaved?: (updated: any) => void;
}> = ({ project, theme: c, onOpenInStudio, onBack, onProjectSaved }) => {
  const [changeReqOpen, setChangeReqOpen] = useState(false);
  const [changeText, setChangeText]       = useState('');
  const [bugOpen, setBugOpen]             = useState(false);
  const [bugText, setBugText]             = useState('');
  const [activeTab, setActiveTab]         = useState<'overview' | 'files' | 'history' | 'upgrade'>('overview');
  const [copiedField, setCopiedField]     = useState<string | null>(null);

  // ── Upgrade state ─────────────────────────────────────────────
  const [upgradeTask,   setUpgradeTask]   = useState('');
  const [upgradeModel,  setUpgradeModel]  = useState(() =>
    ConfigService.getEngineModel() || ConfigService.getModel() || 'anthropic/claude-sonnet-4-5'
  );
  const [upgradeStatus, setUpgradeStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [upgradeStream, setUpgradeStream] = useState('');
  const [upgradeDiff,   setUpgradeDiff]   = useState<{
    added: string[];
    modified: string[];
    newFiles: Record<string, string>;
  } | null>(null);
  const [upgradeError,  setUpgradeError]  = useState('');
  const upgradeAbortRef = useRef<AbortController | null>(null);

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(f => f === field ? null : f), 1500);
  };

  const fileList = Object.keys(project.files ?? {});
  const revisions = project.revisions ?? [];

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function parseUpgradeFiles(text: string): Record<string, string> {
    const files: Record<string, string> = {};
    const re = /<!--FILE:([^>]+)-->([\s\S]*?)<!--\/FILE-->/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim().replace(/^[./]+/, '');
      const body = m[2].trim().replace(/^```[\w]*\n?/gm, '').replace(/```\s*$/gm, '').trim();
      if (name && body) files[name] = body;
    }
    return files;
  }

  const runUpgrade = async () => {
    const apiKey = ConfigService.getKeyForAgent('primary') || ConfigService.getApiKey();
    if (!apiKey) {
      setUpgradeError('Нет API ключа. Настройте его в Settings → Engine.');
      setUpgradeStatus('error');
      return;
    }
    setUpgradeStatus('running');
    setUpgradeStream('');
    setUpgradeDiff(null);
    setUpgradeError('');

    const MAX_FILE_CHARS = 3000;
    const fileContext = Object.entries(project.files ?? {})
      .map(([path, content]) =>
        `<!--FILE:${path}-->\n${(content as string).slice(0, MAX_FILE_CHARS)}\n<!--/FILE-->`)
      .join('\n\n');

    const prompt = `You are an expert React/TypeScript developer. Upgrade this existing project.

TASK: ${upgradeTask}

CURRENT PROJECT FILES:
${fileContext}

INSTRUCTIONS:
- Return ONLY the files you are changing or creating.
- Use EXACTLY this format for each file (no exceptions):
<!--FILE:/path/to/file.tsx-->
[complete file content here]
<!--/FILE-->
- Include the COMPLETE file content (not just diffs or snippets).
- Do NOT return files that don't need changes.
- Preserve existing code patterns, imports, and component structure where not touched.`;

    const ctrl = new AbortController();
    upgradeAbortRef.current = ctrl;

    let fullText = '';
    try {
      const resp = await llmFetchStream(
        'https://openrouter.ai/api/v1/chat/completions',
        { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.origin },
        JSON.stringify({
          model: upgradeModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 16000,
          stream: true,
        }),
        ctrl.signal,
      );

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const clean = line.replace(/^data: /, '').trim();
          if (!clean || clean === '[DONE]') continue;
          try {
            const parsed = JSON.parse(clean) as { choices?: Array<{ delta?: { content?: string } }> };
            const chunk = parsed.choices?.[0]?.delta?.content ?? '';
            if (chunk) { fullText += chunk; setUpgradeStream(fullText); }
          } catch { /* skip */ }
        }
      }

      const newFiles = parseUpgradeFiles(fullText);
      if (Object.keys(newFiles).length === 0) {
        setUpgradeError('Агент не вернул файлы в правильном формате. Попробуйте ещё раз или уточните задачу.');
        setUpgradeStatus('error');
        return;
      }
      const original = project.files ?? {};
      const added    = Object.keys(newFiles).filter(f => !original[f]);
      const modified = Object.keys(newFiles).filter(f => original[f] && original[f] !== newFiles[f]);
      setUpgradeDiff({ added, modified, newFiles });
      setUpgradeStatus('done');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setUpgradeStatus('idle');
      } else {
        setUpgradeError(e instanceof Error ? e.message : String(e));
        setUpgradeStatus('error');
      }
    }
  };

  const acceptUpgrade = () => {
    if (!upgradeDiff) return;
    const mergedFiles = { ...(project.files ?? {}), ...upgradeDiff.newFiles };
    const revision: ProjectRevision = {
      id: crypto.randomUUID(),
      prompt: upgradeTask,
      source: 'agent-upgrade',
      files: { ...(project.files ?? {}) },
      createdAt: new Date().toISOString(),
      modelId: upgradeModel,
      isBookmarked: false,
    };
    const revisions = [revision, ...(project.revisions ?? [])].slice(0, 10);
    const updated = { ...project, files: mergedFiles, updatedAt: new Date().toISOString(), revisions };
    ProjectStorage.saveProject(updated);
    onProjectSaved?.(updated);
    setUpgradeStatus('idle');
    setUpgradeDiff(null);
    setUpgradeStream('');
    setUpgradeTask('');
  };

  const rollbackToRevision = (rev: ProjectRevision) => {
    const rollbackRevision: ProjectRevision = {
      id: crypto.randomUUID(),
      prompt: `↩ Откат к: "${rev.prompt.slice(0, 60)}"`,
      source: 'agent-upgrade',
      files: { ...(project.files ?? {}) },
      createdAt: new Date().toISOString(),
      isBookmarked: false,
    };
    const revisions = [rollbackRevision, ...(project.revisions ?? [])].slice(0, 10);
    const updated = { ...project, files: rev.files, updatedAt: new Date().toISOString(), revisions };
    ProjectStorage.saveProject(updated);
    onProjectSaved?.(updated);
  };

  const TabBtn: React.FC<{ id: typeof activeTab; label: string }> = ({ id, label }) => (
    <button onClick={() => setActiveTab(id)} style={{
      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
      background: activeTab === id ? (c.isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.1)') : 'transparent',
      color: activeTab === id ? c.accent : c.sub,
    }}>{label}</button>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Back */}
      <button onClick={onBack} style={{
        alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 8, border: `1px solid ${c.border}`,
        background: 'transparent', color: c.sub, fontSize: 12, cursor: 'pointer', marginBottom: 20,
      }}>← Назад</button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: c.text, margin: '0 0 6px' }}>
          {project.name || project.title || 'Untitled'}
        </h1>
        {project.description && (
          <p style={{ fontSize: 13, color: c.sub, lineHeight: 1.6, margin: '0 0 12px' }}>
            {project.description}
          </p>
        )}
        <div style={{ fontSize: 11, color: c.sub, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {project.createdAt && <span>Создан: {formatDate(project.createdAt)}</span>}
          {project.updatedAt && <span>Обновлён: {formatDate(project.updatedAt)}</span>}
          {project.source && project.source !== 'chat' && (
            <span style={{ color: c.accent }}>Источник: {project.source}</span>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Файлов',    value: fileList.length },
          { label: 'Страниц',   value: project.pagesCount ?? '—' },
          { label: 'Модель',    value: project.modelId?.split('/').pop() ?? '—' },
          { label: 'Время',     value: project.durationMs ? `${Math.round(project.durationMs / 1000)}с` : '—' },
          { label: 'Токены',    value: project.billingTokens ?? '—' },
          { label: 'Стоимость', value: project.billingCost ? `$${project.billingCost.toFixed(4)}` : '—' },
          { label: 'Версий',    value: revisions.length },
        ].map(s => (
          <div key={s.label} style={{
            padding: '10px 14px', borderRadius: 10,
            background: c.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
            border: `1px solid ${c.border}`,
          }}>
            <div style={{ fontSize: 10, color: c.sub, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.text }}>{String(s.value)}</div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <button onClick={onOpenInStudio} style={{
          padding: '9px 20px', borderRadius: 10, fontSize: 12, fontWeight: 700,
          background: c.accent, color: '#fff', border: 'none', cursor: 'pointer',
          boxShadow: `0 4px 16px ${c.accentBg}`,
        }}>
          ▶ Открыть в Студии
        </button>
        <button onClick={() => setChangeReqOpen(v => !v)} style={{
          padding: '9px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
          background: changeReqOpen ? c.accentBg : 'transparent',
          border: `1px solid ${changeReqOpen ? c.accentBorder : c.border}`,
          color: changeReqOpen ? c.accent : c.sub, cursor: 'pointer',
        }}>
          ✏️ Запросить изменение
        </button>
        <button onClick={() => setBugOpen(v => !v)} style={{
          padding: '9px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
          background: bugOpen ? 'rgba(239,68,68,0.08)' : 'transparent',
          border: `1px solid ${bugOpen ? 'rgba(239,68,68,0.3)' : c.border}`,
          color: bugOpen ? c.danger : c.sub, cursor: 'pointer',
        }}>
          🐛 Сообщить об ошибке
        </button>
        {project.intent && (
          <button onClick={() => copyText(project.intent, 'intent')} style={{
            padding: '9px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: 'transparent', border: `1px solid ${c.border}`,
            color: copiedField === 'intent' ? '#4ade80' : c.sub, cursor: 'pointer',
          }}>
            {copiedField === 'intent' ? '✓ Скопировано' : '⎘ Копировать промт'}
          </button>
        )}
      </div>

      {/* Change request form */}
      {changeReqOpen && (
        <div style={{
          marginBottom: 20, padding: '16px', borderRadius: 12,
          background: c.isDark ? c.accentBg : 'rgba(124,58,237,0.05)',
          border: `1px solid ${c.accentBorder}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 10 }}>
            Что изменить в проекте?
          </div>
          <textarea
            value={changeText}
            onChange={e => setChangeText(e.target.value)}
            placeholder="Опишите что нужно изменить, добавить или улучшить..."
            rows={4}
            style={{
              width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 8,
              background: c.isDark ? 'rgba(255,255,255,0.06)' : '#fff',
              border: `1px solid ${c.accentBorder}`,
              color: c.text, fontSize: 12, lineHeight: 1.6, outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              disabled={!changeText.trim()}
              onClick={() => {
                if (changeText.trim()) {
                  copyText(`Изменение в проекте "${project.name || 'Untitled'}":\n\n${changeText}`, 'change');
                  onOpenInStudio();
                }
              }}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: changeText.trim() ? c.accent : 'rgba(167,139,250,0.3)',
                color: '#fff', border: 'none', cursor: changeText.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Открыть в Студии с запросом →
            </button>
            <button onClick={() => { setChangeReqOpen(false); setChangeText(''); }} style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12,
              background: 'transparent', border: `1px solid ${c.border}`,
              color: c.sub, cursor: 'pointer',
            }}>Отмена</button>
          </div>
        </div>
      )}

      {/* Bug report form */}
      {bugOpen && (
        <div style={{
          marginBottom: 20, padding: '16px', borderRadius: 12,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 10 }}>
            Описание ошибки
          </div>
          <textarea
            value={bugText}
            onChange={e => setBugText(e.target.value)}
            placeholder="Опишите баг: что происходит, что должно происходить, как воспроизвести..."
            rows={4}
            style={{
              width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 8,
              background: c.isDark ? 'rgba(255,255,255,0.06)' : '#fff',
              border: '1px solid rgba(239,68,68,0.2)',
              color: c.text, fontSize: 12, lineHeight: 1.6, outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              disabled={!bugText.trim()}
              onClick={() => {
                if (bugText.trim()) {
                  copyText(`Баг в проекте "${project.name || 'Untitled'}":\n\n${bugText}`, 'bug');
                  onOpenInStudio();
                }
              }}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: bugText.trim() ? '#ef4444' : 'rgba(239,68,68,0.3)',
                color: '#fff', border: 'none', cursor: bugText.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Открыть в Студии для исправления →
            </button>
            <button onClick={() => { setBugOpen(false); setBugText(''); }} style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12,
              background: 'transparent', border: `1px solid ${c.border}`,
              color: c.sub, cursor: 'pointer',
            }}>Отмена</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${c.border}`, paddingBottom: 12 }}>
        <TabBtn id="overview" label="Промт" />
        <TabBtn id="files"    label={`Файлы (${fileList.length})`} />
        <TabBtn id="history"  label={`Версии (${revisions.length})`} />
        <TabBtn id="upgrade"  label="🤖 Агент" />
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div>
          {project.intent ? (
            <pre style={{
              fontSize: 12, lineHeight: 1.7,
              color: c.isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)',
              background: c.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${c.border}`, borderRadius: 10,
              padding: 16, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 400, overflowY: 'auto',
            }}>
              {project.intent}
            </pre>
          ) : (
            <p style={{ fontSize: 13, color: c.sub }}>Промт не сохранён для этого проекта.</p>
          )}
          {project.plan && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 12, color: c.sub, cursor: 'pointer', marginBottom: 8 }}>
                Архитектурный план (JSON)
              </summary>
              <pre style={{
                fontSize: 11, lineHeight: 1.5, color: c.sub,
                background: c.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${c.border}`, borderRadius: 8,
                padding: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 300, overflowY: 'auto',
              }}>
                {JSON.stringify(project.plan, null, 2).slice(0, 3000)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Files tab */}
      {activeTab === 'files' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {fileList.length === 0 ? (
            <p style={{ fontSize: 13, color: c.sub }}>Файлы не найдены.</p>
          ) : (
            fileList.sort().map(f => (
              <div key={f} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 8,
                background: c.isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.02)',
                border: `1px solid ${c.border}`,
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: c.text, flex: 1 }}>{f}</span>
                <span style={{ fontSize: 10, color: c.sub }}>
                  {((project.files?.[f] ?? '').split('\n').length)} lines
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {revisions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: c.sub }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🕐</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Нет сохранённых версий</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Версии сохраняются автоматически после каждой генерации (макс. 5).</div>
            </div>
          ) : (
            revisions.map((rev: any, idx: number) => (
              <div key={rev.id} style={{
                padding: '12px 14px', borderRadius: 10,
                background: c.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                border: `1px solid ${c.border}`,
                borderLeft: idx === 0 ? `3px solid ${c.accent}` : `3px solid transparent`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, padding: '1px 7px', borderRadius: 10,
                    background: idx === 0 ? c.accentBg : 'rgba(148,163,184,0.1)',
                    color: idx === 0 ? c.accent : c.sub,
                  }}>
                    {idx === 0 ? 'текущая' : `v${revisions.length - idx}`}
                  </span>
                  {rev.source === 'agent-upgrade' && (
                    <span style={{
                      fontSize: 10, padding: '1px 7px', borderRadius: 10,
                      background: 'rgba(167,139,250,0.1)', color: c.accent,
                    }}>🤖 агент</span>
                  )}
                  <span style={{ fontSize: 12, color: c.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rev.prompt?.slice(0, 80)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 11, color: c.sub, display: 'flex', gap: 10 }}>
                    <span>{formatDate(rev.createdAt)}</span>
                    {rev.durationMs && <span>{Math.round(rev.durationMs / 1000)}с</span>}
                    {rev.pagesCount > 0 && <span>{rev.pagesCount} страниц</span>}
                    {rev.modelId && <span style={{ fontFamily: 'monospace' }}>{rev.modelId.split('/').pop()}</span>}
                  </div>
                  {idx > 0 && (
                    <button
                      onClick={() => rollbackToRevision(rev)}
                      title="Откатить проект к этой версии"
                      style={{
                        padding: '3px 10px', borderRadius: 7, fontSize: 10, fontWeight: 600,
                        background: 'rgba(167,139,250,0.08)', border: `1px solid ${c.accentBorder}`,
                        color: c.accent, cursor: 'pointer',
                      }}
                    >
                      ↩ Откатить
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Upgrade tab */}
      {activeTab === 'upgrade' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Task input */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.text, marginBottom: 8 }}>
              Задача для агента
            </div>
            <textarea
              value={upgradeTask}
              onChange={e => setUpgradeTask(e.target.value)}
              disabled={upgradeStatus === 'running'}
              placeholder="Например: Добавь авторизацию через Supabase, Переделай дизайн главной страницы в glassmorphism, Добавь тёмную тему, Оптимизируй производительность..."
              rows={5}
              style={{
                width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 10,
                background: c.isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                border: `1px solid ${c.accentBorder}`,
                color: c.text, fontSize: 13, lineHeight: 1.6, outline: 'none',
                boxSizing: 'border-box' as const,
                opacity: upgradeStatus === 'running' ? 0.6 : 1,
              }}
            />
          </div>

          {/* Model selector */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: c.sub, marginBottom: 6 }}>
              Модель
            </div>
            <input
              list="upgrade-models"
              value={upgradeModel}
              onChange={e => setUpgradeModel(e.target.value)}
              disabled={upgradeStatus === 'running'}
              placeholder="anthropic/claude-sonnet-4-5"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                background: c.isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                border: `1px solid ${c.border}`, color: c.text, fontSize: 12,
                outline: 'none', boxSizing: 'border-box' as const,
              }}
            />
            <datalist id="upgrade-models">
              {[
                'anthropic/claude-sonnet-4-5',
                'anthropic/claude-opus-4',
                'anthropic/claude-3-5-sonnet',
                'openai/gpt-4o',
                'openai/gpt-4.1',
                'google/gemini-2.0-flash',
                'google/gemini-2.5-pro',
                'deepseek/deepseek-r1',
                'deepseek/deepseek-v3',
                'mistralai/mistral-large',
                'x-ai/grok-3',
              ].map(m => <option key={m} value={m} />)}
            </datalist>
            <div style={{ fontSize: 10, color: c.sub, marginTop: 4 }}>
              Введите любой ID модели OpenRouter или выберите из списка
            </div>
          </div>

          {/* Run / Cancel buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {upgradeStatus !== 'running' ? (
              <button
                disabled={!upgradeTask.trim() || !upgradeModel.trim()}
                onClick={() => { void runUpgrade(); }}
                style={{
                  padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: (upgradeTask.trim() && upgradeModel.trim()) ? `linear-gradient(135deg, ${c.accent}, #8b5cf6)` : 'rgba(167,139,250,0.2)',
                  color: '#fff', border: 'none',
                  cursor: (upgradeTask.trim() && upgradeModel.trim()) ? 'pointer' : 'not-allowed',
                  boxShadow: (upgradeTask.trim() && upgradeModel.trim()) ? `0 4px 20px ${c.accentBg}` : 'none',
                  transition: 'all 0.2s',
                }}
              >
                🚀 Запустить агента
              </button>
            ) : (
              <button
                onClick={() => { upgradeAbortRef.current?.abort(); }}
                style={{
                  padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: 'rgba(239,68,68,0.15)', color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
                }}
              >
                ⏹ Остановить
              </button>
            )}
          </div>

          {/* Error */}
          {upgradeStatus === 'error' && upgradeError && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              fontSize: 12, color: '#f87171',
            }}>
              ❌ {upgradeError}
            </div>
          )}

          {/* Live stream output */}
          {(upgradeStatus === 'running' || (upgradeStatus === 'done' && upgradeDiff)) && upgradeStream && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: c.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                {upgradeStatus === 'running' ? (
                  <>
                    <span style={{
                      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                      background: c.accent, animation: 'pulse 1s infinite',
                    }} />
                    Агент работает...
                  </>
                ) : '✅ Готово — вывод агента'}
              </div>
              <pre style={{
                fontSize: 11, lineHeight: 1.5, maxHeight: 260, overflowY: 'auto',
                background: c.isDark ? '#0a0a0f' : '#f8f8f8',
                border: `1px solid ${c.border}`, borderRadius: 10,
                padding: '12px 14px', margin: 0,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: c.isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)',
              }}>
                {upgradeStream.slice(-2000)}
              </pre>
            </div>
          )}

          {/* Diff summary + Accept/Reject */}
          {upgradeStatus === 'done' && upgradeDiff && (
            <div style={{
              padding: '16px', borderRadius: 12,
              background: c.isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.04)',
              border: '1px solid rgba(34,197,94,0.2)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: 12 }}>
                ✅ Агент завершил работу
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                {upgradeDiff.modified.length > 0 && (
                  <div style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
                    color: '#fbbf24',
                  }}>
                    ✏️ Изменено: {upgradeDiff.modified.length} файл{upgradeDiff.modified.length > 1 ? 'а' : ''}
                  </div>
                )}
                {upgradeDiff.added.length > 0 && (
                  <div style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                    color: '#4ade80',
                  }}>
                    ➕ Добавлено: {upgradeDiff.added.length} файл{upgradeDiff.added.length > 1 ? 'а' : ''}
                  </div>
                )}
              </div>

              {/* File list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
                {[...upgradeDiff.added.map(f => ({ f, type: 'added' as const })),
                  ...upgradeDiff.modified.map(f => ({ f, type: 'modified' as const }))
                ].map(({ f, type }) => (
                  <div key={f} style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                    color: type === 'added' ? '#4ade80' : '#fbbf24',
                    fontFamily: 'monospace',
                  }}>
                    <span>{type === 'added' ? '➕' : '✏️'}</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              {/* Accept / Reject */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={acceptUpgrade}
                  style={{
                    padding: '9px 20px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                    background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  ✅ Принять изменения
                </button>
                <button
                  onClick={() => { setUpgradeStatus('idle'); setUpgradeDiff(null); setUpgradeStream(''); }}
                  style={{
                    padding: '9px 16px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                    background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171', cursor: 'pointer',
                  }}
                >
                  ✕ Отклонить
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ArchitectDashboard: React.FC<ArchitectDashboardProps> = ({
  theme,
  projects,
  currentProjectId,
  onLoadProject,
  onNavigateEngine,
  appLanguage,
}) => {
  const colors = useTheme(theme);
  const copy = getArchitectCopy(appLanguage);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailProject, setDetailProject] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!currentProjectId) {
      setActiveProject(null);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    ProjectRepository.getProject(currentProjectId)
      .then(project => {
        if (cancelled) return;
        setActiveProject(project);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setActiveProject(null);
        setLoading(false);
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [currentProjectId]);

  const activeBranchName = activeProject?.branches?.[activeProject.activeBranchId ?? 'main']?.name
    ?? activeProject?.activeBranchId
    ?? null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: colors.bg,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 24px',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.panel,
          flexShrink: 0,
        }}
      >
        <Layers size={15} color={colors.accent} />
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.text, letterSpacing: '-0.02em' }}>
          {copy.architectTitle}
        </span>
        <span style={{ fontSize: 11, color: colors.sub }}>— {copy.architectSubtitle}</span>
        <div style={{ flex: 1 }} />

        {activeProject ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 20,
                background: colors.accentBg,
                border: `1px solid ${colors.accentBorder}`,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.accent }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.accent }}>{activeProject.name}</span>
            </div>
            {activeBranchName ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: colors.panelAlt,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.text }}>{activeBranchName}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, background: colors.panelAlt, overflow: 'hidden' }}>
          {detailProject ? (
            <ProjectDetailPanel
              project={detailProject}
              theme={colors}
              onOpenInStudio={() => { onLoadProject(detailProject); onNavigateEngine(); }}
              onBack={() => setDetailProject(null)}
              onProjectSaved={(updated) => setDetailProject(updated)}
            />
          ) : loading ? (
            <StatePanel title={copy.loading} body={copy.loadingBody} theme={colors} />
          ) : error ? (
            <StatePanel title={copy.loadErrorTitle} body={`${copy.loadErrorBody} ${error}`} theme={colors} tone="error" />
          ) : !activeProject ? (
            <StatePanel title={copy.noProjectTitle} body={copy.noProjectBody} theme={colors} />
          ) : (
            <BranchArchitectureScreen
              theme={theme}
              project={activeProject}
              appLanguage={appLanguage}
            />
          )}
        </div>

        <aside
          style={{
            width: 360,
            minWidth: 320,
            borderLeft: `1px solid ${colors.border}`,
            background: colors.panel,
            overflow: 'hidden',
          }}
        >
          <ProjectsHub
            theme={theme}
            projects={projects}
            currentProjectId={currentProjectId}
            onLoadProject={onLoadProject}
            onNavigateEngine={onNavigateEngine}
            onViewDetails={(p) => {
              const full = ProjectStorage.getProject(p.id);
              setDetailProject(full ?? p);
            }}
          />
        </aside>
      </div>
    </div>
  );
};

export default ArchitectDashboard;
