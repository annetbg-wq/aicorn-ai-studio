import { NavLink } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { BOTTOM_TABS } from '@/config/navigation';
import { ROUTES } from '@/config/routes';
import { cn } from '@/lib/cn';

export function BottomTabs(): JSX.Element {
  const { unreadNotifications } = useApp();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-card/95 backdrop-blur safe-bottom"
    >
      <ul className="grid grid-cols-5 px-2 pt-1.5">
        {BOTTOM_TABS.map((tab) => {
          const showBadge = tab.to === ROUTES.notifications && unreadNotifications > 0;
          return (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.to === ROUTES.feed}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium tap-target',
                    'transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="relative">
                      <tab.icon
                        className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')}
                        strokeWidth={isActive ? 2.4 : 2}
                      />
                      {showBadge && (
                        <span
                          aria-label={`${unreadNotifications} unread`}
                          className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose px-1 text-[10px] font-semibold text-primary-foreground"
                        >
                          {unreadNotifications > 9 ? '9+' : unreadNotifications}
                        </span>
                      )}
                    </div>
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
