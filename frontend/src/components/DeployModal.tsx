/**
 * DeployModal.tsx
 *
 * Красивый оверлей для one-click деплоя.
 * Провайдер → токен → прогресс → ссылка.
 */

import React, { useState, useEffect } from 'react';
import {
  X, Rocket, ExternalLink, Copy, Check,
  Eye, EyeOff, AlertCircle, CheckCircle2, Loader2,
  Cloud, Zap, Smartphone, Download,
} from 'lucide-react';
import { DeployService, type DeployProvider, type DeployProgress, type DeployResult } from '../services/DeployService';
import { ConfigService } from '../services/ConfigService';
import { ProjectManager } from '../services/ProjectManager';
import { AppStoreService, type AppStoreTexts } from '../services/AppStoreService';
import type { FileMap } from '../hooks/useStudio';

// ── Provider config ───────────────────────────────────────────────────────────

interface ProviderConfig {
  id:       DeployProvider;
  name:     string;
  color:    string;
  bg:       string;
  tokenUrl: string;
  tokenHint:string;
  icon:     React.ReactNode;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'vercel',
    name: 'Vercel',
    color: '#fff',
    bg: 'rgba(255,255,255,0.07)',
    tokenUrl: 'https://vercel.com/account/tokens',
    tokenHint: 'vercel token из Account → Tokens',
    icon: (
      <svg width="18" height="18" viewBox="0 0 116 100" fill="currentColor">
        <path d="M57.5 0L115 100H0L57.5 0z" />
      </svg>
    ),
  },
  {
    id: 'netlify',
    name: 'Netlify',
    color: '#00c7b7',
    bg: 'rgba(0,199,183,0.08)',
    tokenUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
    tokenHint: 'Personal access token из Netlify → User settings',
    icon: <Cloud size={18} />,
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface DeployModalProps {
  isOpen:           boolean;
  onClose:          () => void;
  files:            FileMap;
  currentTheme:     'dark' | 'medium' | 'light';
  currentProjectId?: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const DeployModal: React.FC<DeployModalProps> = ({
  isOpen, onClose, files, currentTheme, currentProjectId,
}) => {
  const [activeTab,  setActiveTab]  = useState<'deploy' | 'appstore'>('deploy');
  const [provider,   setProvider]   = useState<DeployProvider>('vercel');
  const [token,      setToken]      = useState(() =>
    ConfigService.getVercelToken() || ConfigService.getNetlifyToken()
      ? ConfigService.getVercelToken()
      : ''
  );
  const [showToken,  setShowToken]  = useState(false);

  // App Icons state
  const [iconAppName,   setIconAppName]   = useState(() => {
    if (currentProjectId) {
      const p = ProjectManager.getById(currentProjectId);
      if (p) return p.name;
    }
    return 'MyApp';
  });
  const [iconTheme,     setIconTheme]     = useState('trust');
  const [iconGenerating, setIconGenerating] = useState(false);
  const [iconDone,      setIconDone]      = useState(false);

  // App Store texts state
  const [kitDesc,       setKitDesc]       = useState(() => {
    if (currentProjectId) {
      const p = ProjectManager.getById(currentProjectId);
      if (p?.description) return p.description;
    }
    return '';
  });
  const [kitTargetUser, setKitTargetUser] = useState('');
  const [kitTexts,      setKitTexts]      = useState<AppStoreTexts | null>(null);
  const [kitGenerating, setKitGenerating] = useState(false);
  const [copiedDesc,    setCopiedDesc]    = useState(false);
  const [copiedPrivacy, setCopiedPrivacy] = useState(false);
  const [copiedKw,      setCopiedKw]      = useState(false);
  const [editedTexts,   setEditedTexts]   = useState<AppStoreTexts | null>(null);

  // Sync token when provider changes
  useEffect(() => {
    const saved = provider === 'netlify'
      ? ConfigService.getNetlifyToken()
      : ConfigService.getVercelToken();
    if (saved) setToken(saved);
  }, [provider]);
  const [progress,   setProgress]   = useState<DeployProgress | null>(null);
  const [result,     setResult]     = useState<DeployResult | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);

  if (!isOpen) return null;

  const isDark    = currentTheme !== 'light';
  const bg        = isDark ? '#0a0a0a' : '#ffffff';
  const border    = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const inputBg   = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : '#111';
  const subText   = isDark ? 'rgba(255,255,255,0.3)'  : 'rgba(0,0,0,0.35)';

  const isDeploying = progress !== null && progress.status !== 'ready' && progress.status !== 'error';
  const currentProvider = PROVIDERS.find(p => p.id === provider)!;
  const fileCount = Object.keys(files).length;

  const handleDeploy = async () => {
    if (!token.trim() || isDeploying) return;
    setError(null);
    setResult(null);
    setProgress({ status: 'preparing', message: 'Инициализация…', percent: 5 });

    try {
      const res = await DeployService.deploy(files, provider, token, setProgress);
      setResult(res);
      if (currentProjectId) {
        try { ProjectManager.update(currentProjectId, { deployUrl: res.url }); } catch { /* non-critical */ }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Неизвестная ошибка');
      setProgress(null);
    }
  };

  const handleCopy = () => {
    if (!result?.url) return;
    navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setProgress(null);
    setResult(null);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[100]"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget && !isDeploying) onClose(); }}
    >
      <div
        className="relative flex flex-col w-full max-w-md rounded-2xl overflow-hidden max-h-[90vh]"
        style={{
          background: bg,
          border: `1px solid ${border}`,
          boxShadow: '0 40px 120px rgba(0,0,0,0.65)',
          animation: 'deployFadeIn .2s ease both',
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-5 shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: activeTab === 'deploy' ? 'rgba(59,130,246,0.12)' : 'rgba(168,85,247,0.12)', color: activeTab === 'deploy' ? '#60a5fa' : '#a855f7' }}>
              {activeTab === 'deploy' ? <Rocket size={15} /> : <Smartphone size={15} />}
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: textColor }}>
                {activeTab === 'deploy' ? 'Deploy Project' : 'App Store Kit'}
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: subText }}>
                {activeTab === 'deploy'
                  ? `${fileCount} ${fileCount === 1 ? 'file' : 'files'} ready to deploy`
                  : `Texts · Icons · Privacy Policy`}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={isDeploying}
            className="p-2 rounded-xl transition-all hover:bg-white/5 disabled:opacity-30"
            style={{ color: subText }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex px-6 pt-3 pb-0 gap-1 shrink-0">
          {(['deploy', 'appstore'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: activeTab === tab
                  ? (tab === 'deploy' ? 'rgba(59,130,246,0.12)' : 'rgba(168,85,247,0.12)')
                  : 'transparent',
                color: activeTab === tab
                  ? (tab === 'deploy' ? '#60a5fa' : '#a855f7')
                  : subText,
                borderBottom: activeTab === tab
                  ? `2px solid ${tab === 'deploy' ? '#3b82f6' : '#a855f7'}`
                  : '2px solid transparent',
              }}>
              {tab === 'deploy' ? <Rocket size={11} /> : <Smartphone size={11} />}
              {tab === 'deploy' ? 'Deploy' : 'App Store'}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">

          {/* ── App Store Kit tab ── */}
          {activeTab === 'appstore' && (
            <div className="space-y-4">

              {/* ─ App name + description inputs ─ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5"
                    style={{ color: subText }}>App Name</label>
                  <input
                    type="text"
                    value={iconAppName}
                    onChange={e => { setIconAppName(e.target.value); setIconDone(false); setKitTexts(null); setEditedTexts(null); }}
                    placeholder="MyApp"
                    maxLength={30}
                    className="w-full rounded-xl px-3 py-2 text-xs font-medium outline-none"
                    style={{ background: inputBg, border: `1px solid ${border}`, color: textColor }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5"
                    style={{ color: subText }}>Target User</label>
                  <input
                    type="text"
                    value={kitTargetUser}
                    onChange={e => setKitTargetUser(e.target.value)}
                    placeholder="fitness enthusiasts"
                    className="w-full rounded-xl px-3 py-2 text-xs font-medium outline-none"
                    style={{ background: inputBg, border: `1px solid ${border}`, color: textColor }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: subText }}>App Description</label>
                <textarea
                  value={kitDesc}
                  onChange={e => setKitDesc(e.target.value)}
                  placeholder="What does this app do? What problem does it solve?"
                  rows={3}
                  className="w-full rounded-xl px-3 py-2 text-xs font-medium outline-none resize-none"
                  style={{ background: inputBg, border: `1px solid ${border}`, color: textColor }}
                />
              </div>

              {/* ─ Generated texts ─ */}
              {(editedTexts || kitTexts) && (() => {
                const t = editedTexts ?? kitTexts!;
                const setField = (field: keyof AppStoreTexts, val: string) =>
                  setEditedTexts({ ...(editedTexts ?? kitTexts!), [field]: val });
                const copy = (text: string, setter: (v: boolean) => void) => {
                  navigator.clipboard.writeText(text);
                  setter(true);
                  setTimeout(() => setter(false), 2000);
                };
                return (
                  <div className="rounded-xl overflow-hidden"
                    style={{ border: `1px solid rgba(168,85,247,0.2)` }}>
                    {/* Name + Subtitle row */}
                    <div className="grid grid-cols-2 gap-0"
                      style={{ borderBottom: `1px solid rgba(168,85,247,0.1)` }}>
                      {([
                        { field: 'name' as const,     label: 'Name',     max: 30  },
                        { field: 'subtitle' as const,  label: 'Subtitle', max: 30  },
                      ]).map(({ field, label, max }) => (
                        <div key={field} className="px-3 py-2"
                          style={{ borderRight: field === 'name' ? `1px solid rgba(168,85,247,0.1)` : undefined }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: subText }}>{label}</span>
                            <span className="text-[9px] tabular-nums"
                              style={{ color: t[field].length > max * 0.9 ? '#f59e0b' : subText }}>
                              {t[field].length}/{max}
                            </span>
                          </div>
                          <input
                            value={t[field]}
                            onChange={e => setField(field, e.target.value)}
                            maxLength={max}
                            className="w-full text-xs font-medium outline-none bg-transparent"
                            style={{ color: textColor }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Keywords */}
                    <div className="px-3 py-2" style={{ borderBottom: `1px solid rgba(168,85,247,0.1)` }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: subText }}>Keywords</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] tabular-nums"
                            style={{ color: t.keywords.length > 90 ? '#f59e0b' : subText }}>
                            {t.keywords.length}/100
                          </span>
                          <button onClick={() => copy(t.keywords, setCopiedKw)}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all"
                            style={{ background: copiedKw ? 'rgba(48,209,88,0.1)' : inputBg, color: copiedKw ? '#30d158' : subText }}>
                            {copiedKw ? <Check size={8} /> : <Copy size={8} />}
                            {copiedKw ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      <input
                        value={t.keywords}
                        onChange={e => setField('keywords', e.target.value)}
                        maxLength={100}
                        className="w-full text-xs font-mono outline-none bg-transparent"
                        style={{ color: textColor }}
                      />
                    </div>

                    {/* Short description */}
                    <div className="px-3 py-2" style={{ borderBottom: `1px solid rgba(168,85,247,0.1)` }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: subText }}>Short (Google Play)</span>
                        <span className="text-[9px] tabular-nums"
                          style={{ color: t.shortDescription.length > 72 ? '#f59e0b' : subText }}>
                          {t.shortDescription.length}/80
                        </span>
                      </div>
                      <input
                        value={t.shortDescription}
                        onChange={e => setField('shortDescription', e.target.value)}
                        maxLength={80}
                        className="w-full text-xs font-medium outline-none bg-transparent"
                        style={{ color: textColor }}
                      />
                    </div>

                    {/* Full description */}
                    <div className="px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: subText }}>Description</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] tabular-nums"
                            style={{ color: t.description.length > 3800 ? '#f59e0b' : subText }}>
                            {t.description.length}/4000
                          </span>
                          <button onClick={() => copy(t.description, setCopiedDesc)}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all"
                            style={{ background: copiedDesc ? 'rgba(48,209,88,0.1)' : inputBg, color: copiedDesc ? '#30d158' : subText }}>
                            {copiedDesc ? <Check size={8} /> : <Copy size={8} />}
                            {copiedDesc ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={t.description}
                        onChange={e => setField('description', e.target.value)}
                        rows={6}
                        maxLength={4000}
                        className="w-full text-xs outline-none bg-transparent resize-none"
                        style={{ color: textColor }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* ─ Privacy Policy + regenerate row ─ */}
              {(editedTexts || kitTexts) && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const t = editedTexts ?? kitTexts!;
                      navigator.clipboard.writeText(t.privacyPolicyText);
                      setCopiedPrivacy(true);
                      setTimeout(() => setCopiedPrivacy(false), 2000);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all"
                    style={{ background: copiedPrivacy ? 'rgba(48,209,88,0.1)' : inputBg, color: copiedPrivacy ? '#30d158' : subText, border: `1px solid ${copiedPrivacy ? 'rgba(48,209,88,0.2)' : border}` }}>
                    {copiedPrivacy ? <Check size={11} /> : <Copy size={11} />}
                    {copiedPrivacy ? 'Privacy Copied!' : 'Copy Privacy Policy'}
                  </button>
                  <button
                    onClick={() => { setKitTexts(null); setEditedTexts(null); }}
                    className="px-4 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-80"
                    style={{ background: inputBg, color: subText, border: `1px solid ${border}` }}>
                    Regenerate
                  </button>
                </div>
              )}

              {/* ─ Divider ─ */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px" style={{ background: border }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: subText }}>App Icons</span>
                <div className="flex-1 h-px" style={{ background: border }} />
              </div>

              {/* ─ Icon colour theme ─ */}
              <div className="flex flex-wrap gap-2">
                {AppStoreService.themeNames.map(t => {
                  const PREVIEWS: Record<string, { bg: string; label: string }> = {
                    'dark-slate': { bg: '#0f172a', label: 'Slate' },
                    'trust':      { bg: '#1d4ed8', label: 'Trust' },
                    'warm':       { bg: '#f97316', label: 'Warm'  },
                    'neon':       { bg: '#10b981', label: 'Neon'  },
                    'bloom':      { bg: '#f43f5e', label: 'Bloom' },
                  };
                  const p = PREVIEWS[t] ?? { bg: '#6366f1', label: t };
                  return (
                    <button key={t} onClick={() => { setIconTheme(t); setIconDone(false); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
                      style={{
                        background: iconTheme === t ? `${p.bg}22` : inputBg,
                        border: `1px solid ${iconTheme === t ? p.bg : border}`,
                        color: textColor,
                      }}>
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.bg }} />
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* ─ Icon preview + download ─ */}
              <div className="flex items-center gap-4 px-4 py-3 rounded-xl"
                style={{ background: inputBg, border: `1px solid ${border}` }}>
                <div className="flex gap-2 shrink-0">
                  {(['rounded-[14px]', 'rounded-sm'] as const).map((rnd, i) => (
                    <div key={i}
                      className={`w-12 h-12 ${rnd} flex items-center justify-center text-lg font-bold shadow-md`}
                      style={{
                        background: ({ 'dark-slate': '#0f172a', 'trust': '#1d4ed8', 'warm': '#f97316', 'neon': '#10b981', 'bloom': '#f43f5e' } as Record<string, string>)[iconTheme] ?? '#6366f1',
                        color:      ({ 'dark-slate': '#e2e8f0', 'trust': '#fff',    'warm': '#fff',    'neon': '#030712', 'bloom': '#fff'    } as Record<string, string>)[iconTheme] ?? '#fff',
                      }}>
                      {(iconAppName.charAt(0) || 'A').toUpperCase()}
                    </div>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: textColor }}>{iconAppName || 'MyApp'}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: subText }}>
                    {AppStoreService.iosSizeCount + AppStoreService.androidSizeCount} icons · iOS rounded + Android square
                  </p>
                </div>
                <button
                  disabled={iconGenerating}
                  onClick={async () => {
                    setIconGenerating(true);
                    setIconDone(false);
                    try {
                      const icons = await AppStoreService.generateAllIcons(iconAppName || 'App', iconTheme);
                      await AppStoreService.downloadIconsAsZip(icons, iconAppName || 'App');
                      setIconDone(true);
                    } finally {
                      setIconGenerating(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-40 shrink-0"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff' }}>
                  {iconGenerating ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                  {iconGenerating ? '…' : iconDone ? 'Done ✓' : 'ZIP'}
                </button>
              </div>

            </div>
          )}

          {/* Provider selector */}
          {activeTab === 'deploy' && !result && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest mb-3"
                style={{ color: subText }}>
                Platform
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => !isDeploying && setProvider(p.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                    style={{
                      background: provider === p.id ? p.bg : inputBg,
                      border: `1px solid ${provider === p.id ? p.color + '40' : border}`,
                      color: provider === p.id ? p.color : subText,
                    }}>
                    {p.icon}
                    <span className="text-sm font-semibold">{p.name}</span>
                    {provider === p.id && (
                      <CheckCircle2 size={13} className="ml-auto" style={{ color: p.color }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Token input */}
          {activeTab === 'deploy' && !result && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: subText }}>
                  {currentProvider.name} Token
                </label>
                <a href={currentProvider.tokenUrl} target="_blank" rel="noreferrer"
                  className="text-[10px] flex items-center gap-1 hover:text-blue-400 transition-colors"
                  style={{ color: subText }}>
                  Получить токен <ExternalLink size={9} />
                </a>
              </div>
              <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{ background: inputBg, border: `1px solid ${error ? 'rgba(255,69,58,0.4)' : border}` }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={e => { setToken(e.target.value); setError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleDeploy()}
                  placeholder={currentProvider.tokenHint}
                  disabled={isDeploying}
                  className="flex-1 bg-transparent border-none outline-none text-xs font-mono"
                  style={{ color: textColor }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button onClick={() => setShowToken(v => !v)}
                  className="p-1 rounded-lg hover:bg-white/5 transition-colors shrink-0"
                  style={{ color: subText }}>
                  {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {error && (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)' }}>
                  <AlertCircle size={13} style={{ color: '#ff453a', flexShrink: 0 }} />
                  <p className="text-[11px]" style={{ color: '#ff453a' }}>{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Progress bar */}
          {activeTab === 'deploy' && progress && !result && (
            <div className="rounded-xl p-4"
              style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin" style={{ color: '#60a5fa' }} />
                  <span className="text-xs font-medium" style={{ color: '#60a5fa' }}>
                    {progress.message}
                  </span>
                </div>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: '#60a5fa' }}>
                  {progress.percent}%
                </span>
              </div>
              {/* Bar */}
              <div className="h-1.5 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progress.percent}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                    boxShadow: '0 0 8px rgba(96,165,250,0.5)',
                  }} />
              </div>
            </div>
          )}

          {/* ── Success state ── */}
          {activeTab === 'deploy' && result && (
            <div className="rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(48,209,88,0.2)' }}>
              {/* Green header */}
              <div className="flex items-center gap-3 px-4 py-3"
                style={{ background: 'rgba(48,209,88,0.08)' }}>
                <CheckCircle2 size={16} style={{ color: '#30d158' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#30d158' }}>
                    Задеплоено успешно!
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(48,209,88,0.6)' }}>
                    {currentProvider.name} • {new Date().toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {/* URL row */}
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ borderTop: '1px solid rgba(48,209,88,0.1)' }}>
                <a href={result.url} target="_blank" rel="noreferrer"
                  className="flex-1 text-xs font-mono truncate hover:underline"
                  style={{ color: '#60a5fa' }}>
                  {result.url}
                </a>
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all shrink-0"
                  style={{
                    background: copied ? 'rgba(48,209,88,0.12)' : 'rgba(255,255,255,0.05)',
                    color: copied ? '#30d158' : subText,
                    border: `1px solid ${copied ? 'rgba(48,209,88,0.2)' : border}`,
                  }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
                <a href={result.url} target="_blank" rel="noreferrer"
                  className="p-1.5 rounded-lg transition-all hover:bg-white/5 shrink-0"
                  style={{ color: subText }}>
                  <ExternalLink size={13} />
                </a>
              </div>

              {/* QR code */}
              <div className="flex flex-col items-center gap-2 px-4 py-4"
                style={{ borderTop: '1px solid rgba(48,209,88,0.1)', background: 'rgba(0,0,0,0.15)' }}>
                <p className="text-[10px] font-medium" style={{ color: subText }}>
                  Scan to open on mobile
                </p>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(result.url)}&bgcolor=ffffff&color=000000&margin=4`}
                  alt="QR code"
                  width={160}
                  height={160}
                  style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', display: 'block' }}
                />
              </div>
            </div>
          )}

          {/* Info tip */}
          {activeTab === 'deploy' && !result && !isDeploying && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${border}` }}>
              <Zap size={12} style={{ color: subText, flexShrink: 0, marginTop: 1 }} />
              <p className="text-[10px] leading-relaxed" style={{ color: subText }}>
                Токен хранится только в памяти браузера и не покидает твоё устройство.
                Для сохранения между сессиями добавь его в Settings.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-5 shrink-0">
          {activeTab === 'appstore' && !kitTexts ? (
            <button
              onClick={async () => {
                setKitGenerating(true);
                try {
                  const pages = Object.keys(files)
                    .filter(p => /pages?\//i.test(p))
                    .map(p => p.replace(/.*pages?\//i, '').replace(/\.(tsx?|jsx?)$/, ''));
                  const result = await AppStoreService.generateAppStoreTexts({
                    appName:     iconAppName || 'App',
                    description: kitDesc,
                    targetUser:  kitTargetUser,
                    pages,
                    apiKey:      '',
                  });
                  setKitTexts(result);
                  setEditedTexts(null);
                } finally {
                  setKitGenerating(false);
                }
              }}
              disabled={kitGenerating || !kitDesc.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                color: '#fff',
                boxShadow: '0 4px 20px rgba(168,85,247,0.3)',
              }}>
              {kitGenerating
                ? <><Loader2 size={15} className="animate-spin" /> Generating texts…</>
                : <><Smartphone size={15} /> Generate App Store Kit</>
              }
            </button>
          ) : activeTab === 'appstore' ? (
            <button
              onClick={async () => {
                setIconGenerating(true);
                setIconDone(false);
                try {
                  const icons = await AppStoreService.generateAllIcons(iconAppName || 'App', iconTheme);
                  await AppStoreService.downloadIconsAsZip(icons, iconAppName || 'App');
                  setIconDone(true);
                } finally {
                  setIconGenerating(false);
                }
              }}
              disabled={iconGenerating}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                color: '#fff',
                boxShadow: '0 4px 20px rgba(168,85,247,0.3)',
              }}>
              {iconGenerating
                ? <><Loader2 size={15} className="animate-spin" /> Generating icons…</>
                : <><Download size={15} /> Download Icons ZIP</>
              }
            </button>
          ) : !result ? (
            <button
              onClick={handleDeploy}
              disabled={!token.trim() || isDeploying}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: `linear-gradient(135deg, #3b82f6, ${currentProvider.color === '#fff' ? '#6366f1' : currentProvider.color})`,
                color: '#fff',
                boxShadow: '0 4px 20px rgba(59,130,246,0.3)',
              }}>
              {isDeploying
                ? <><Loader2 size={15} className="animate-spin" /> Деплоим…</>
                : <><Rocket size={15} /> Deploy to {currentProvider.name}</>
              }
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleReset}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: inputBg, color: subText, border: `1px solid ${border}` }}>
                Deploy Again
              </button>
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                style={{ background: 'rgba(59,130,246,0.9)', color: '#fff' }}>
                Закрыть
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes deployFadeIn {
          from { opacity: 0; transform: scale(0.96) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
      `}</style>
    </div>
  );
};
