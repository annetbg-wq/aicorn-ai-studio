import React, { useState } from 'react';

interface Plan {
  id: string;
  name: string;
  price: string;
  features: string[];
  isPopular?: boolean;
}

const PLANS: Plan[] = [
  { id: 'basic', name: 'Basic', price: '$4.99/mo', features: ['Core features', 'Up to 50 uses/mo'] },
  { id: 'pro', name: 'Pro', price: '$9.99/mo', features: ['All features', 'Unlimited uses', 'Priority support'], isPopular: true },
  { id: 'premium', name: 'Premium', price: '$19.99/mo', features: ['Everything in Pro', 'API access', 'Custom integrations'] },
];

interface PaywallModalProps {
  onClose: () => void;
  onUpgrade?: (planId: string) => void;
  trigger?: string;
}

export function PaywallModal({ onClose, onUpgrade, trigger }: PaywallModalProps) {
  const [selected, setSelected] = useState('pro');

  const handleUpgrade = () => {
    localStorage.setItem('is_premium', 'true');
    onUpgrade?.(selected);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 430, margin: '0 auto', background: '#0d0d12', borderRadius: '24px 24px 0 0', padding: '24px 20px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5ea', margin: 0 }}>Перейти на Premium</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#6b6b7a', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>
        {trigger && <p style={{ fontSize: 13, color: '#6b6b7a', marginBottom: 20 }}>{trigger}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {PLANS.map(plan => (
            <div key={plan.id} onClick={() => setSelected(plan.id)} style={{ padding: '16px', borderRadius: 14, cursor: 'pointer', position: 'relative', background: selected === plan.id ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)', border: `1.5px solid ${selected === plan.id ? '#a78bfa' : 'rgba(255,255,255,0.07)'}` }}>
              {plan.isPopular && <div style={{ position: 'absolute', top: -8, right: 12, padding: '2px 10px', borderRadius: 20, background: '#a78bfa', color: '#fff', fontSize: 10, fontWeight: 700 }}>ЛУЧШИЙ</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#e5e5ea' }}>{plan.name}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#a78bfa' }}>{plan.price}</span>
              </div>
            </div>
          ))}
        </div>
        <button onClick={handleUpgrade} style={{ width: '100%', padding: '14px', borderRadius: 14, background: '#a78bfa', border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Начать подписку
        </button>
      </div>
    </div>
  );
}
