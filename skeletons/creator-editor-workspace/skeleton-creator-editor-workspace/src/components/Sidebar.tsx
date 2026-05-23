import { navigationItems } from '@/config/navigation';
export function Sidebar({ activeRoute, onChange }: { activeRoute: string; onChange: (route: string) => void }) {
  return <aside className="sidebar">
    <div className="sidebar-brand"><div className="logo-mark">Ed</div><div><strong>Creator Editor Workspace</strong><p className="subtitle" style={{ margin: 0 }}>Skeleton shell</p></div></div>
    <div className="nav-stack">{navigationItems.map((item) => <button key={item.id} className={`nav-item ${activeRoute === item.id ? 'active' : ''}`} onClick={() => onChange(item.id)}><span>{item.label}</span><span>›</span></button>)}</div>
  </aside>;
}
