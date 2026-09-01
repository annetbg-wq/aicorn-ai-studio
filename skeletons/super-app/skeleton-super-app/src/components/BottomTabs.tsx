import { NavLink } from 'react-router-dom';
import { BOTTOM_TABS } from '@/config/navigation';
import { cn } from '@/lib/cn';

/**
 * Bottom tab navigation. All tabs come from BOTTOM_TABS in config —
 * adding/removing tabs is a config change, not a component change.
 * The validate script checks every tab points at a registered route.
 */
export function BottomTabs(): JSX.Element {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-card/95 backdrop-blur safe-bottom"
    >
      <ul className={cn('grid px-2 pt-1.5', `grid-cols-${BOTTOM_TABS.length}`)}>
        {BOTTOM_TABS.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium tap-target',
                  'transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon
                    className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  <span>{tab.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
