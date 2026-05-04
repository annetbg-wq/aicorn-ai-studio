import { useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ListView } from '@/components/ListView';

/**
 * Single workspace view. Switches between Kanban and List based on
 * AppContext.view. Filters and active workspace are also from context.
 */
export default function Workspace(): JSX.Element {
  const { items, activeWorkspaceId, view, filters } = useApp();

  const filteredItems = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeWorkspaceId !== 'all' && item.workspaceId !== activeWorkspaceId) return false;
      if (filters.status !== 'all' && item.status !== filters.status) return false;
      if (filters.priority !== 'all' && item.priority !== filters.priority) return false;
      if (filters.tagId !== 'all' && !item.tagIds.includes(filters.tagId)) return false;
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [items, activeWorkspaceId, filters]);

  return (
    <div className="h-full overflow-hidden">
      {view === 'kanban' ? <KanbanBoard items={filteredItems} /> : <ListView items={filteredItems} />}
    </div>
  );
}
