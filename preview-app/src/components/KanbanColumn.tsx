import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Task } from '@/data/projectData';
import TaskCard from './TaskCard';

interface KanbanColumnProps {
  title: string;
  color: string;
  tasks: Task[];
}

export default function KanbanColumn({ title, color, tasks }: KanbanColumnProps) {
  return (
    <div className="flex-shrink-0 w-72">
      <Card className="bg-muted/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <h3 className="font-semibold text-sm text-foreground">{title}</h3>
            </div>
            <Badge variant="outline" className="text-xs">
              {tasks.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-4">
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No tasks
            </div>
          ) : (
            tasks.map((task) => <TaskCard key={task.id} task={task} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}