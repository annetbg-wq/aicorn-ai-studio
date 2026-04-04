/**
 * AppSidebar — narrow (56 px) vertical navigation bar.
 *
 * Bottom section: API Wallet + Context Health mini-bars + cloud-sync dot.
 * Above resource bars: ⚡ Weekly Feed toggle button → WeeklyFeedPanel slide-out.
 */

import React, { useState } from 'react';
import { LayoutGrid, PenTool, Figma, Cloud, Rocket, TrendingUp, Zap, FlaskConical, BarChart2, FolderOpen } from 'lucide-react';
import type { ModuleId, ViewId } from '../shared/types';
import { WeeklyFeedPanel } from './WeeklyFeedPanel';
import type { IdeaPlan } from './WeeklyFeedPanel';

interface NavItem {
  id:        ModuleId;
  icon:      React.ElementType;
  label:     string;
  available: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'engine',    icon: LayoutGrid,    label: 'System Engine',      available: true  },
  { id: 'projects',  icon: FolderOpen,    label: 'Projects',           available: true  },
  { id: 'architect', icon: PenTool,       label: 'Product Architect',  available: true  },
  { id: 'figma',     icon: Figma,         label: 'Figma Platinum',     available: true  },
  { id: 'agentlab',  icon: FlaskConical,  label: 'Agent Lab',          available: true  },
  { id: 'analytics', icon: BarChart2,     label: 'Analytics',          available: true  },
  { id: 'cloud',     icon: Cloud,         label: 'Cloud & Backend',    available: false },
  { id: 'package',   icon: Rocket,        label: 'Packaging & Ship',   available: false },
  { id: 'growth',    icon: TrendingUp,    label: 'Growth & Marketing', available: false },
];

interface AppSidebarProps {
  activeModule:      ViewId;
  onNavigate:        (id: ModuleId) => void;
  onHome:            () => void;
  apiWalletPct:      number;
  contextHealthPct:  number;
  cloudAvailable:    boolean;
  onStartBlueprint:  (text: string) => void;
  onLaunchWithPlan?: (plan: IdeaPlan, intent: string) => void;
  appLanguage?:      string;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeModule, onNavigate, onHome,
  apiWalletPct, contextHealthPct, cloudAvailable, onStartBlueprint, onLaunchWithPlan,
  appLanguage = 'en',
}) => {
  const [tooltip,  setTooltip]  = useState<string | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);

  return (
    <>
      <div style={{
        width: 56, height: '100vh', flexShrink: 0,
        background: '#06060a',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '14px 0 10px', zIndex: 210, position: 'relative',
      }}>

        {/* ── Logo — click → Home Dashboard ── */}
        <button
          onClick={onHome}
          title="Home Dashboard"
          style={{
            width: 36, height: 36, borderRadius: 10, marginBottom: 10,
            background: activeModule === 'dashboard' ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${activeModule === 'dashboard' ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.08)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: activeModule === 'dashboard' ? '#60a5fa' : 'rgba(255,255,255,0.45)',
            transition: 'all 0.2s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1"   y="1"   width="5.5" height="5.5" rx="1.5" opacity="0.9"/>
            <rect x="9.5" y="1"   width="5.5" height="5.5" rx="1.5" opacity="0.45"/>
            <rect x="1"   y="9.5" width="5.5" height="5.5" rx="1.5" opacity="0.45"/>
            <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.5" opacity="0.9"/>
          </svg>
        </button>

        {/* Thin divider */}
        <div style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 6 }} />

        {/* ── Module icons ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const Icon       = item.icon;
            const isSelected = activeModule === item.id;
            return (
              <div
                key={item.id}
                style={{ width: '100%', display: 'flex', justifyContent: 'center', position: 'relative' }}
              >
                <button
                  onClick={() => item.available && onNavigate(item.id)}
                  onMouseEnter={() => setTooltip(item.label)}
                  onMouseLeave={() => setTooltip(null)}
                  title={item.available ? item.label : `${item.label} — Coming Soon`}
                  style={{
                    width: 36, height: 36, borderRadius: 10, marginBottom: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor:     item.available ? 'pointer' : 'not-allowed',
                    background: isSelected ? 'rgba(59,130,246,0.15)' : 'transparent',
                    border:     `1px solid ${isSelected ? 'rgba(59,130,246,0.3)' : 'transparent'}`,
                    color: isSelected ? '#60a5fa' : item.available ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.14)',
                    opacity:    item.available ? 1 : 0.7,
                    transition: 'all 0.18s',
                  }}
                >
                  <Icon size={16} strokeWidth={1.75} />
                </button>

                {isSelected && (
                  <div style={{
                    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 3, height: 22, borderRadius: '2px 0 0 2px',
                    background: 'linear-gradient(180deg, #3b82f6, #60a5fa)',
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Weekly Feed toggle ── */}
        <button
          onClick={() => setFeedOpen(prev => !prev)}
          title="Weekly Hot Ideas"
          onMouseEnter={() => setTooltip('Weekly Hot Ideas')}
          onMouseLeave={() => setTooltip(null)}
          style={{
            width: 36, height: 36, borderRadius: 10, marginBottom: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            background: feedOpen ? 'rgba(74,222,128,0.15)' : 'rgba(74,222,128,0.06)',
            border: `1px solid ${feedOpen ? 'rgba(74,222,128,0.4)' : 'rgba(74,222,128,0.2)'}`,
            color: feedOpen ? '#4ade80' : 'rgba(74,222,128,0.5)',
            transition: 'all 0.2s',
            position: 'relative',
          }}
        >
          <Zap size={15} strokeWidth={2} />
          {/* Pulse dot — indicates new content */}
          {!feedOpen && (
            <div style={{
              position: 'absolute', top: 6, right: 6,
              width: 5, height: 5, borderRadius: '50%',
              background: '#4ade80', boxShadow: '0 0 5px #4ade8099',
              animation: 'zapPulse 2s ease-in-out infinite',
            }} />
          )}
        </button>

        {/* ── Resource mini-bars + cloud dot ── */}
        <div style={{
          width: '100%', padding: '8px 0 6px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>API</span>
              <span style={{ fontSize: 7, color: 'rgba(74,222,128,0.55)', fontFamily: 'monospace' }}>{Math.round(apiWalletPct)}%</span>
            </div>
            <div style={{ height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${apiWalletPct}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)', transition: 'width 0.6s ease' }} />
            </div>
          </div>

          <div style={{ width: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>CTX</span>
              <span style={{ fontSize: 7, color: 'rgba(96,165,250,0.55)', fontFamily: 'monospace' }}>{Math.round(contextHealthPct)}%</span>
            </div>
            <div style={{ height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${contextHealthPct}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', transition: 'width 0.6s ease' }} />
            </div>
          </div>

          <div
            title={cloudAvailable ? 'Cloud sync active' : 'Cloud sync offline'}
            style={{
              width: 5, height: 5, borderRadius: '50%', marginTop: 2,
              background: cloudAvailable ? '#4ade80' : '#374151',
              boxShadow:  cloudAvailable ? '0 0 5px #4ade8066' : 'none',
              transition: 'all 0.4s',
            }}
          />
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute', left: 62, top: '40%',
            background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '5px 10px',
            fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
            whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 999,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            {tooltip}
          </div>
        )}
      </div>

      {/* ── Weekly Feed Panel ── */}
      {feedOpen && (
        <WeeklyFeedPanel
          onClose={() => setFeedOpen(false)}
          onStartBlueprint={(text) => {
            setFeedOpen(false);
            onStartBlueprint(text);
          }}
          onLaunchWithPlan={onLaunchWithPlan}
          appLanguage={appLanguage}
        />
      )}

      <style>{`
        @keyframes zapPulse {
          0%, 100% { opacity: 1; transform: scale(1);   }
          50%       { opacity: 0.5; transform: scale(0.7); }
        }
      `}</style>
    </>
  );
};
