import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreVertical, Pencil, Trash2, Archive } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Task, PRIORITY_COLORS } from './types';

interface TaskCardProps {
  task: Task;
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: number) => void;
  onArchive?: (taskId: number) => void;
}

export function TaskCard({ task, onEdit, onDelete, onArchive }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    transition: {
      duration: 200,
      easing: 'ease',
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    touchAction: 'none' as const,
    opacity: isDragging ? 0 : 1,
  };

  const tags = task.tags ? JSON.parse(task.tags) as string[] : [];

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`mb-1.5 py-0 gap-0 ${isDragging ? 'shadow-lg ring-2 ring-primary' : ''}`}
    >
      <CardContent className="!px-2.5 !py-3.5">
        <div className="flex items-start gap-2">
          <button
            className="mt-1 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority]}`}
                  title={task.priority}
                />
                <span className="text-xs text-muted-foreground font-mono">
                  #{task.id}
                </span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit?.(task)}>
                    <Pencil className="mr-2 h-3 w-3" />
                    Edit
                  </DropdownMenuItem>
                  {task.status === 'done' && onArchive && (
                    <DropdownMenuItem onClick={() => onArchive(task.id)}>
                      <Archive className="mr-2 h-3 w-3" />
                      Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDelete?.(task.id)}
                  >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="text-sm font-medium mt-1 truncate">{task.title}</p>

            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {task.assignee && (
              <p className="text-xs text-muted-foreground mt-2">
                @{task.assignee}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
