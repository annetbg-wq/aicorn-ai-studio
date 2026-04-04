import { Task } from '@/data/projectData';
import KanbanColumn from './KanbanColumn';

interface KanbanBoardProps {
  tasks: Task[];
}

const columns = [
  { id: 'backlog', title: 'Backlog', color: 'bg-muted' },
  { id: 'todo', title: 'To Do', color: 'bg-blue-500' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-yellow-500' },
  { id: 'review', title: 'Review', color: 'bg-purple-500' },
  { id: 'done', title: 'Done', color: 'bg-green-500' },
];

export default function KanbanBoard({ tasks }: KanbanBoardProps) {
  const getTasksByStatus = (status: string) => {
    return tasks.filter((task) => task.status === status);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((column) => (
        <KanbanColumn
          key={column.id}
          title={column.title}
          color={column.color}
          tasks={getTasksByStatus(column.id)}
        />
      ))}
    </div>
  );
}