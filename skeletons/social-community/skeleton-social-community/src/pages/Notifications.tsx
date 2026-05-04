import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { NotificationItem } from '@/components/NotificationItem';
import { EmptyState } from '@/components/EmptyState';
import { SEED_NOTIFICATIONS, SEED_USERS } from '@/data/seed';

export default function Notifications(): JSX.Element {
  const { markNotificationsRead } = useApp();
  const userById = new Map(SEED_USERS.map((u) => [u.id, u]));

  // Mark as read once the user opens the screen.
  useEffect(() => {
    markNotificationsRead();
  }, [markNotificationsRead]);

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="border-b border-border px-5 pb-3 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      </header>

      <main className="flex-1 px-3 pb-32 pt-2">
        {SEED_NOTIFICATIONS.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="All caught up"
            description="No new activity right now."
          />
        ) : (
          <ul className="space-y-1">
            {SEED_NOTIFICATIONS.map((n) => {
              const actor = userById.get(n.actorId);
              if (!actor) return null;
              return (
                <li key={n.id}>
                  <NotificationItem notification={n} actor={actor} />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
