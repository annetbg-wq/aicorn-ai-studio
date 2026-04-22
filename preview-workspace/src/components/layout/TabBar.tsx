import { NavLink } from 'react-router-dom';
import { MessageCircle, User } from 'lucide-react';

const tabs = [
  { path: '/', label: 'Чат', icon: MessageCircle },
  { path: '/profile', label: 'Профиль', icon: User }
];

export default function TabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {tabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 transition-colors duration-200 px-6 py-2 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <tab.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}