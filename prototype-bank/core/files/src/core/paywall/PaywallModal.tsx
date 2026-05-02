import React from 'react';
import { PricingCard } from './PricingCard';
import { useSubscription } from './useSubscription';

interface PaywallModalProps {
  onClose: () => void;
  trigger?: string;
}

export function PaywallModal({ onClose, trigger }: PaywallModalProps) {
  const { upgrade } = useSubscription();

  const plans = [
    { name: 'Basic', price: '$4.99/mo', features: ['Core features', 'Up to 50 uses/mo'] },
    { name: 'Pro', price: '$9.99/mo', features: ['All features', 'Unlimited uses', 'Priority support'], isPopular: true },
    { name: 'Premium', price: '$19.99/mo', features: ['Everything in Pro', 'API access', 'Custom integrations'] },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', padding: '0' }}>
      <div style={{ width: '100%', maxWidth: 430, margin: '0 auto', background: '#0d0d12', borderRadius: '24px 24px 0 0', padding: '24px 20px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5ea', margin: 0 }}>Перейти на Premium</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#6b6b7a', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>
        {trigger && <p style={{ fontSize: 13, color: '#6b6b7a', marginBottom: 20 }}>{trigger}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {plans.map(p => <PricingCard key={p.name} {...p} onSelect={() => { upgrade(); onClose(); }} />)}
        </div>
      </div>
    </div>
  );
}
