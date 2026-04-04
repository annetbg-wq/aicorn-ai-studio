/**
 * CollabModal.tsx
 *
 * UI для создания/вхождения в комнату коллаборации.
 * После подключения — плавающий оверлей с аватарами участников.
 */

import React, { useState, useEffect } from 'react';
import {
  X, Users, Copy, Check, Link2, LogOut,
  Wifi, WifiOff, Loader2, UserCircle2,
} from 'lucide-react';
import { CollabService, type CollabState } from '../services/CollabService';
import type { FileMap } from '../hooks/useStudio';

// ── Helpers ───────────────────────────────────────────────────────────────────

const generateRoomId = () =>
  Math.random().toString(36).slice(2, 6).toUpperCase() +
  '-' +
  Math.random().toString(36).slice(2, 6).toUpperCase();

// ── Props ─────────────────────────────────────────────────────────────────────

interface CollabModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  files:         FileMap;
  onFilesChange: (f: FileMap) => void;
  currentTheme:  'dark' | 'medium' | 'light';
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export const CollabModal: React.FC<CollabModalProps> = ({
  isOpen, onClose, files, onFilesChange, currentTheme,
}) => {
  const [mode,        setMode]        = useState<'menu' | 'create' | 'join'>('menu');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [userName,    setUserName]    = useState(() => localStorage.getItem('COLLAB_NAME') || '');
  const [newRoomId,   setNewRoomId]   = useState('');
  const [collabState, setCollabState] = useState<CollabState | null>(null);
  const [copied,      setCopied]      = useState(false);
  const [connecting,  setConnecting]  = useState(false);

  if (!isOpen) return null;

  const isDark    = currentTheme !== 'light';
  const bg        = isDark ? '#0a0a0a' : '#ffffff';
  const border    = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const inputBg   = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : '#111';
  const subText   = isDark ? 'rgba(255,255,255,0.3)'  : 'rgba(0,0,0,0.35)';

  const isConnected = collabState?.connected && collabState.roomId;

  const handleCreate = async () => {
    if (!userName.trim()) return;
    localStorage.setItem('COLLAB_NAME', userName.trim());
    const roomId = generateRoomId();
    setNewRoomId(roomId);
    setConnecting(true);

    CollabService.join(roomId, userName.trim(), files, onFilesChange, (state) => {
      setCollabState(state);
      setConnecting(false);
    });
  };

  const handleJoin = async () => {
    if (!userName.trim() || !roomIdInput.trim()) return;
    localStorage.setItem('COLLAB_NAME', userName.trim());
    setConnecting(true);

    CollabService.join(roomIdInput.trim().toUpperCase(), userName.trim(), files, onFilesChange, (state) => {
      setCollabState(state);
      setConnecting(false);
    });
  };

  const handleLeave = () => {
    CollabService.leave();
    setCollabState(null);
    setNewRoomId('');
    setMode('menu');
  };

  const handleCopyLink = () => {
    const roomId = collabState?.roomId || newRoomId;
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyRoomId = () => {
    const roomId = collabState?.roomId || newRoomId;
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[100]"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget && !connecting) onClose(); }}
    >
      <div className="relative flex flex-col w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: bg,
          border: `1px solid ${border}`,
          boxShadow: '0 40px 120px rgba(0,0,0,0.65)',
          animation: 'collabFadeIn .2s ease both',
        }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-5 shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
              <Users size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: textColor }}>Collaboration</h2>
              <p className="text-[11px] mt-0.5" style={{ color: subText }}>
                {isConnected
                  ? `${collabState!.participants.length} участник${collabState!.participants.length === 1 ? '' : 'а'} онлайн`
                  : 'Realtime совместное редактирование'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={connecting}
            className="p-2 rounded-xl transition-all hover:bg-white/5 disabled:opacity-30"
            style={{ color: subText }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-4">

          {/* ── Active session ── */}
          {isConnected ? (
            <>
              {/* Status bar */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                {collabState!.connected
                  ? <Wifi size={13} style={{ color: '#a78bfa' }} />
                  : <WifiOff size={13} style={{ color: '#ff453a' }} />}
                <span className="text-xs font-medium" style={{ color: '#a78bfa' }}>
                  {collabState!.connected ? 'Подключено' : 'Переподключение…'}
                </span>
                <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-lg"
                  style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
                  {collabState!.roomId}
                </span>
              </div>

              {/* Participants */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
                  style={{ color: subText }}>
                  Участники
                </div>
                <div className="space-y-1.5">
                  {collabState!.participants.map(p => (
                    <div key={p.clientId} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                      style={{ background: inputBg, border: `1px solid ${border}` }}>
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                        style={{ background: p.color + '22', color: p.color, border: `1px solid ${p.color}44` }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: textColor }}>
                          {p.name}
                          {p.name === CollabService.localUser.name && (
                            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(255,255,255,0.06)', color: subText }}>
                              вы
                            </span>
                          )}
                        </div>
                        {p.activeFile && (
                          <div className="text-[10px] truncate" style={{ color: subText }}>
                            📄 {p.activeFile}
                          </div>
                        )}
                      </div>
                      {/* Online dot */}
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: '#30d158',
                        boxShadow: '0 0 5px #30d15880',
                      }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Share row */}
              <div className="flex gap-2">
                <button onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: copied ? 'rgba(48,209,88,0.1)' : 'rgba(139,92,246,0.1)',
                    color: copied ? '#30d158' : '#a78bfa',
                    border: `1px solid ${copied ? 'rgba(48,209,88,0.2)' : 'rgba(139,92,246,0.2)'}`,
                  }}>
                  {copied ? <Check size={12} /> : <Link2 size={12} />}
                  {copied ? 'Скопировано!' : 'Копировать ссылку'}
                </button>
                <button onClick={handleCopyRoomId}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: inputBg, color: subText, border: `1px solid ${border}` }}>
                  <Copy size={11} /> ID
                </button>
              </div>
            </>
          ) : connecting ? (
            /* ── Connecting ── */
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin" style={{ color: '#a78bfa' }} />
              <p className="text-sm font-medium" style={{ color: textColor }}>Подключаемся…</p>
              <p className="text-xs" style={{ color: subText }}>Синхронизация с комнатой</p>
            </div>
          ) : (
            <>
              {/* ── Name input (always shown) ── */}
              {mode !== 'menu' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-2"
                    style={{ color: subText }}>
                    Ваше имя
                  </label>
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                    style={{ background: inputBg, border: `1px solid ${border}` }}>
                    <UserCircle2 size={14} style={{ color: subText, flexShrink: 0 }} />
                    <input
                      type="text"
                      value={userName}
                      onChange={e => setUserName(e.target.value)}
                      placeholder="Введите имя"
                      maxLength={24}
                      className="flex-1 bg-transparent border-none outline-none text-sm"
                      style={{ color: textColor }}
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* ── Menu ── */}
              {mode === 'menu' && (
                <div className="space-y-2 py-2">
                  <button onClick={() => setMode('create')}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all hover:opacity-90"
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(139,92,246,0.15)' }}>
                      <Users size={14} />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-semibold">Создать комнату</div>
                      <div className="text-[10px] opacity-60">Пригласи других по ссылке</div>
                    </div>
                  </button>

                  <button onClick={() => setMode('join')}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all"
                    style={{ background: inputBg, border: `1px solid ${border}`, color: textColor }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = border)}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: inputBg }}>
                      <Link2 size={14} style={{ color: subText }} />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-semibold">Войти в комнату</div>
                      <div className="text-[10px]" style={{ color: subText }}>Введи Room ID</div>
                    </div>
                  </button>
                </div>
              )}

              {/* ── Create ── */}
              {mode === 'create' && (
                <button
                  onClick={handleCreate}
                  disabled={!userName.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff' }}>
                  <Users size={15} /> Создать и войти
                </button>
              )}

              {/* ── Join ── */}
              {mode === 'join' && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest mb-2"
                      style={{ color: subText }}>
                      Room ID
                    </label>
                    <input
                      type="text"
                      value={roomIdInput}
                      onChange={e => setRoomIdInput(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && handleJoin()}
                      placeholder="XXXX-YYYY"
                      maxLength={9}
                      className="w-full rounded-xl px-3 py-2.5 text-sm font-mono border-none outline-none"
                      style={{ background: inputBg, border: `1px solid ${border}`, color: textColor }}
                    />
                  </div>
                  <button
                    onClick={handleJoin}
                    disabled={!userName.trim() || !roomIdInput.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff' }}>
                    <Link2 size={15} /> Войти в комнату
                  </button>
                </>
              )}

              {mode !== 'menu' && (
                <button onClick={() => setMode('menu')}
                  className="w-full text-center text-xs py-1 transition-all hover:opacity-70"
                  style={{ color: subText }}>
                  ← Назад
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {isConnected && (
          <div className="px-6 pb-5">
            <button onClick={handleLeave}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(255,69,58,0.08)', color: '#ff453a', border: '1px solid rgba(255,69,58,0.15)' }}>
              <LogOut size={13} /> Покинуть комнату
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes collabFadeIn {
          from { opacity: 0; transform: scale(0.96) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
      `}</style>
    </div>
  );
};

// ── Floating Presence Bar ─────────────────────────────────────────────────────
// Показывается поверх PreviewCanvas когда сессия активна

interface PresenceBarProps {
  collabState:   CollabState;
  onOpenModal:   () => void;
  currentTheme:  'dark' | 'medium' | 'light';
}

export const PresenceBar: React.FC<PresenceBarProps> = ({
  collabState, onOpenModal, currentTheme,
}) => {
  const isDark  = currentTheme !== 'light';
  const bg      = isDark ? 'rgba(10,10,10,0.92)' : 'rgba(255,255,255,0.92)';
  const border  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const subText = isDark ? 'rgba(255,255,255,0.3)'  : 'rgba(0,0,0,0.35)';

  const { participants, connected, roomId } = collabState;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
      onClick={onOpenModal}
    >
      {/* Status dot */}
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: connected ? '#30d158' : '#ffd60a',
        boxShadow: `0 0 5px ${connected ? '#30d158' : '#ffd60a'}80`,
        flexShrink: 0,
      }} />

      {/* Avatars stack */}
      <div className="flex items-center" style={{ marginLeft: 2 }}>
        {participants.slice(0, 4).map((p, i) => (
          <div
            key={p.clientId}
            title={p.name}
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{
              background: p.color + '33',
              color: p.color,
              border: `1.5px solid ${p.color}`,
              marginLeft: i > 0 ? -6 : 0,
              zIndex: participants.length - i,
            }}>
            {p.name.slice(0, 1).toUpperCase()}
          </div>
        ))}
        {participants.length > 4 && (
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{ background: 'rgba(255,255,255,0.08)', color: subText, marginLeft: -6, border: `1.5px solid ${border}` }}>
            +{participants.length - 4}
          </div>
        )}
      </div>

      <span className="text-[10px] font-medium" style={{ color: subText }}>
        {roomId}
      </span>
    </div>
  );
};
