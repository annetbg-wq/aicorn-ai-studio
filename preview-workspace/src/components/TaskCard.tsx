import { Button } from "@/components/ui/button";
import React from 'react';
import { Check, Circle, Trash2 } from 'lucide-react';
import { Task } from '@/data/types';

interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  index?: number;
}

export default function TaskCard({ task, onToggle, onDelete, index = 0 }: TaskCardProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 bg-card border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-border/60 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Button
        onClick={() => onToggle(task.id)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
          task.completed
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/40 hover:border-primary/50'
        }`}
        aria-label={task.completed ? 'Отметить как невыполненное' : 'Отметить как выполненное'}
      >
        {task.completed ? (
          <Check size={14} className="text-primary-foreground animate-in zoom-in-50 duration-200" />
        ) : (
          <Circle size={14} className="text-muted-foreground/30" />
        )}
      </Button>

      <span
        className={`flex-1 text-sm transition-all duration-200 ${
          task.completed
            ? 'line-through text-muted-foreground/60'
            : 'text-foreground font-medium'
        }`}
      >
        {task.title}
      </span>

      <Button
        onClick={() => onDelete(task.id)}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 active:scale-95"
        aria-label="Удалить задачу"
      >
        <Trash2 size={16} />
      </Button>
    </div>
  );
}