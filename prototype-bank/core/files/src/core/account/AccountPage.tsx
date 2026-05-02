import React, { useState } from 'react';
import { useSubscription } from '../paywall/useSubscription';
import { setLocale } from '../i18n/i18n';

export function AccountPage() {
  const { isPremium } = useSubscription();
  const [lang, setLang] = useState(() => localStorage.getItem('app_language') ?? 'ru');

  const changeLanguage = (l: 'ru' | 'en') => {
    setLang(l);
    setLocale(l);
  };

  return (
    <div style={{ padding: '24px', maxWidth: 430, margin: '0 auto', background: '#07070b', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#e5e5ea', margin: '0 0 24px' }}>Аккаунт</h1>

      {/* Profile */}
      <section style={{ marginBottom: 24, padding: '16px', borderRadius: 14, background: '#0d0d12', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 11, color: '#6b6b7a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Профиль</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👤</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e5ea' }}>Гость</div>
            <div style={{ fontSize: 12, color: '#6b6b7a' }}>Войдите для синхронизации</div>
          </div>
        </div>
      </section>

      {/* Subscription */}
      <section style={{ marginBottom: 24, padding: '16px', borderRadius: 14, background: '#0d0d12', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 11, color: '#6b6b7a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Подписка</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e5ea' }}>{isPremium ? '⭐ Premium' : 'Бесплатный план'}</div>
            <div style={{ fontSize: 12, color: '#6b6b7a' }}>{isPremium ? 'Все функции активны' : 'Ограниченный доступ'}</div>
          </div>
          {!isPremium && <button style={{ padding: '8px 16px', borderRadius: 8, background: '#a78bfa', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Upgrade</button>}
        </div>
      </section>

      {/* Language */}
      <section style={{ marginBottom: 24, padding: '16px', borderRadius: 14, background: '#0d0d12', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 11, color: '#6b6b7a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Язык</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['ru', 'en'] as const).map(l => (
            <button key={l} onClick={() => changeLanguage(l)} style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14, background: lang === l ? 'rgba(167,139,250,0.15)' : 'transparent', border: `1.5px solid ${lang === l ? '#a78bfa' : 'rgba(255,255,255,0.08)'}`, color: lang === l ? '#a78bfa' : '#6b6b7a' }}>
              {l === 'ru' ? '🇷🇺 Русский' : '🇺🇸 English'}
            </button>
          ))}
        </div>
      </section>

      {/* Danger zone */}
      <section style={{ padding: '16px', borderRadius: 14, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
        <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Опасная зона</div>
        <button onClick={() => { if (confirm('Удалить все данные?')) { localStorage.clear(); window.location.reload(); } }} style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, cursor: 'pointer' }}>
          Очистить данные приложения
        </button>
      </section>
    </div>
  );
}
