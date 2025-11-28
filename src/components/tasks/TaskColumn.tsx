import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { TaskCard } from './TaskCard';
import { Task, TaskStatus, STATUS_LABELS } from './types';

interface TaskColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onAddTask?: (status: TaskStatus) => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (taskId: number) => void;
  onArchiveTask?: (taskId: number) => void;
}

export function TaskColumn({
  status,
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onArchiveTask,
}: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col h-full rounded-lg bg-muted/50 transition-all ${
        isOver ? 'ring-2 ring-primary bg-primary/5' : ''
      }`}
    >
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{STATUS_LABELS[status]}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {tasks.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onAddTask?.(status)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden min-h-[100px]">
        <ScrollArea className="h-full p-2">
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onArchive={onArchiveTask}
              />
            ))}
          </SortableContext>

          {tasks.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No tasks
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
