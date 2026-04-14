import { useLocation, useNavigate } from 'react-router-dom';
import { Home as HomeIcon, Settings, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-card/80 backdrop-blur-lg border-b border-border">
      <div className="max-w-5xl mx-auto h-full flex items-center justify-between px-4">
        <Button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-foreground" />
          </div>
          <span className="font-extrabold text-lg text-foreground hidden sm:block">
            Android Verify
          </span>
        </Button>

        <div className="flex items-center gap-1">
          <Button
            variant={location.pathname === '/' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => navigate('/')}
            className="rounded-xl gap-2"
          >
            <HomeIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Главная</span>
          </Button>
          <Button
            variant={location.pathname === '/settings' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => navigate('/settings')}
            className="rounded-xl gap-2"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Настройки</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
