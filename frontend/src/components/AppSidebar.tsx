/**
 * AppSidebar — narrow (56 px) vertical navigation bar.
 */

import React, { useState } from 'react';
import { LayoutGrid, PenTool, Figma, Cloud, Rocket, TrendingUp, BarChart2, FolderOpen, Code2, Database, FlaskConical } from 'lucide-react';
import type { ModuleId, ViewId } from '../shared/types';
import { isCreatorMode } from '../services/internalAccess';

interface NavItem {
  id:        ModuleId;
  icon:      React.ElementType;
  label:     string;
  available: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'engine',    icon: LayoutGrid,    label: 'System Engine',      available: true  },
  { id: 'trend-niches', icon: TrendingUp, label: 'Трендовые ниши',     available: true  },
  { id: 'projects',  icon: FolderOpen,    label: 'Projects',           available: true  },
  { id: 'architect', icon: PenTool,       label: 'Product Architect',  available: true  },
  { id: 'figma',     icon: Figma,         label: 'Figma Platinum',     available: true  },
  { id: 'analytics', icon: BarChart2,     label: 'Analytics',          available: true  },
  { id: 'quality',      icon: FlaskConical,  label: 'Quality',            available: true  },
  { id: 'code-studio', icon: Code2,          label: 'Code Studio',        available: true  },
  { id: 'db-console',  icon: Database,       label: 'DB Console',         available: true  },
  { id: 'cloud',        icon: Cloud,         label: 'Cloud & Backend',    available: false },
  { id: 'package',   icon: Rocket,        label: 'Packaging & Ship',   available: false },
  { id: 'growth',    icon: TrendingUp,    label: 'Growth & Marketing', available: false },
];

interface AppSidebarProps {
  activeModule:      ViewId;
  onNavigate:        (id: ModuleId) => void;
  onHome:            () => void;
  appLanguage?:      string;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeModule, onNavigate, onHome,
  appLanguage = 'en',
}) => {
  const [tooltip,  setTooltip]  = useState<string | null>(null);
  const creatorMode = isCreatorMode();
  const visibleNavItems = creatorMode
    ? NAV_ITEMS
    : NAV_ITEMS.filter(item => item.id !== 'code-studio');

  return (
    <>
      <div style={{
        width: 56, height: '100dvh', maxHeight: '100dvh', flexShrink: 0,
        background: '#06060a',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 0 6px', zIndex: 210, position: 'relative',
        overflow: 'hidden',
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
        <div style={{
          flex: 1,
          width: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          paddingBottom: 4,
        }}>
          {visibleNavItems.map(item => {
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
    </>
  );
};
