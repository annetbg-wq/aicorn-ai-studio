import React from 'react';
import { useAuthProvider } from './AuthProvider';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn } = useAuthProvider();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0d0d12', borderRadius: 20, padding: 28, width: '100%', maxWidth: 360, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5ea', margin: '0 0 8px' }}>Войти</h2>
        <p style={{ fontSize: 13, color: '#6b6b7a', margin: '0 0 24px', lineHeight: 1.5 }}>Войдите, чтобы синхронизировать данные между устройствами</p>
        <button onClick={() => { signIn(); onClose(); }} style={{ width: '100%', padding: '13px', borderRadius: 12, background: '#a78bfa', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
          Войти через Google
        </button>
        <button onClick={onClose} style={{ width: '100%', padding: '13px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6b6b7a', fontSize: 14, cursor: 'pointer' }}>
          Продолжить без входа
        </button>
      </div>
    </div>
  );
}
