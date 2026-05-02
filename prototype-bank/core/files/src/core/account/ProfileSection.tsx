import React from 'react';

export function ProfileSection() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>👤</div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#e5e5ea' }}>Пользователь</div>
        <div style={{ fontSize: 13, color: '#6b6b7a' }}>user@example.com</div>
      </div>
    </div>
  );
}
