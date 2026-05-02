import React from 'react';

export function DangerZone() {
  return (
    <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#f87171', marginBottom: 12 }}>⚠️ Опасная зона</div>
      <button onClick={() => { if (confirm('Удалить все данные?')) localStorage.clear(); }} style={{ padding: '9px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>
        Очистить данные
      </button>
    </div>
  );
}
