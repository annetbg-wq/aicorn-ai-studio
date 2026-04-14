import { NavLink } from 'react-router-dom';
import { Plus, Clock } from 'lucide-react';

const tabs = [
  { to: '/', icon: Plus, label: 'Счетчик' },
  { to: '/history', icon: Clock, label: 'История' },
];

export default function TabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-6 py-2 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-primary bg-green-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`
            }
          >
            <Icon className="w-5 h-5" strokeWidth={2.5} />
            <span className="text-[10px] font-semibold">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
