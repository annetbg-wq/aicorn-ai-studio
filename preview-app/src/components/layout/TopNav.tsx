import { Link, useLocation } from 'react-router-dom';
import { Home, Settings, Scan } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function TopNav() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Scan className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-base text-foreground tracking-tight">ActMap AI</span>
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">EU AI Act Compliance</span>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
              CO
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}