export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return <div className="pill-row">{tabs.map((tab) => <button key={tab} className={`pill ${active === tab ? 'active' : ''}`} onClick={() => onChange(tab)}>{tab}</button>)}</div>;
}
