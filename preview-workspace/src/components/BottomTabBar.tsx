import React from 'react';
import { NavLink } from 'react-router-dom';
import { ListTodo, CheckCircle2, User } from 'lucide-react';

const tabs = [
  { path: '/', label: 'Задачи', icon: ListTodo },
  { path: '/completed', label: 'Выполнено', icon: CheckCircle2 },
  { path: '/account', label: 'Аккаунт', icon: User },
];

export default function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border h-16 flex justify-around items-center px-2">
      {tabs.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 transition-all duration-200 ${
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <tab.icon size={20} className={isActive ? 'fill-primary/20' : ''} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}