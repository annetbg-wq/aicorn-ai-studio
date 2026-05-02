import React from 'react';

interface PricingCardProps {
  name: string;
  price: string;
  features: string[];
  isPopular?: boolean;
  onSelect: () => void;
}

export function PricingCard({ name, price, features, isPopular, onSelect }: PricingCardProps) {
  return (
    <div style={{
      padding: '20px', borderRadius: 16, position: 'relative',
      background: isPopular ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)',
      border: `1.5px solid ${isPopular ? '#a78bfa' : 'rgba(255,255,255,0.08)'}`,
    }}>
      {isPopular && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', padding: '3px 12px', borderRadius: 20, background: '#a78bfa', color: '#fff', fontSize: 10, fontWeight: 700 }}>ЛУЧШИЙ ВЫБОР</div>}
      <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e5ea', marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#a78bfa', marginBottom: 16 }}>{price}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {features.map(f => <li key={f} style={{ fontSize: 13, color: '#9999aa', display: 'flex', gap: 8 }}><span style={{ color: '#4ade80' }}>✓</span>{f}</li>)}
      </ul>
      <button onClick={onSelect} style={{ width: '100%', padding: '12px', borderRadius: 10, background: isPopular ? '#a78bfa' : 'rgba(167,139,250,0.15)', border: 'none', color: isPopular ? '#fff' : '#a78bfa', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        Выбрать план
      </button>
    </div>
  );
}
