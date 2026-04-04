import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Task } from '@/data/projectData';
import { Calendar, AlertCircle, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface TaskCardProps {
  task: Task;
}

const priorityConfig = {
  high: { icon: ArrowUp, color: 'text-red-500', bg: 'bg-red-500/10' },
  medium: { icon: Minus, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  low: { icon: ArrowDown, color: 'text-green-500', bg: 'bg-green-500/10' },
};

export default function TaskCard({ task }: TaskCardProps) {
  const PriorityIcon = priorityConfig[task.priority].icon;
  const priorityColor = priorityConfig[task.priority].color;
  const priorityBg = priorityConfig[task.priority].bg;

  return (
    <Card className="mb-3 hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-4">
        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {task.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs px-2 py-0.5">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Title */}
        <h4 className="font-medium text-sm text-foreground mb-1">{task.title}</h4>
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{task.description}</p>

        {/* Progress Bar */}
        {task.progress > 0 && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="text-xs font-medium text-foreground">{task.progress}%</span>
            </div>
            <Progress value={task.progress} className="h-1.5" />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          {/* Assignees */}
          <div className="flex -space-x-2">
            {task.assignees.map((member) => (
              <Avatar key={member.id} className="h-7 w-7 border-2 border-background">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {member.avatar}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>

          {/* Due Date & Priority */}
          <div className="flex items-center gap-2">
            <div className={`p-1 rounded ${priorityBg}`}>
              <PriorityIcon className={`h-3 w-3 ${priorityColor}`} />
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span className="text-xs">{new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}