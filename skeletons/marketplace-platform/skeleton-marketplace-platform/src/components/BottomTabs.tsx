import { navigationItems } from '@/config/navigation';
export function BottomTabs({ activeRoute, onChange }: { activeRoute: string; onChange: (route: string) => void }) {
  return <nav className="bottom-tabs" style={{ ['--tab-count' as string]: navigationItems.length }}>
    {navigationItems.slice(0, 5).map((item) => <button key={item.id} className={`bottom-tab ${activeRoute === item.id ? 'active' : ''}`} onClick={() => onChange(item.id)}><span>{item.label}</span></button>)}
  </nav>;
}
