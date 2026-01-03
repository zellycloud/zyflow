import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  rectIntersection,
  DragOverlay,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Search, Plus, RefreshCw } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { TaskColumn } from './TaskColumn';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';
import {
  Task,
  TaskStatus,
  TaskPriority,
  STATUS_ORDER,
} from './types';

interface KanbanBoardProps {
  tasks: Task[];
  onCreateTask: (data: {
    title: string;
    description?: string;
    status: TaskStatus;
    priority: TaskPriority;
    tags?: string[];
    assignee?: string;
  }) => void;
  onUpdateTask: (id: number, data: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    tags?: string[];
    assignee?: string;
    order?: number;
  }) => void;
  onDeleteTask: (id: number) => void;
  onArchiveTask?: (id: number) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function KanbanBoard({
  tasks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onArchiveTask,
  onRefresh,
  isLoading,
}: KanbanBoardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Memoize filtered tasks to avoid recalculating on every render
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        String(task.id).includes(query)
      );
    });
  }, [tasks, searchQuery]);

  // Memoize grouped tasks by status
  const tasksByStatus = useMemo(() => {
    return STATUS_ORDER.reduce(
      (acc, status) => {
        acc[status] = filteredTasks
          .filter((t) => t.status === status)
          .sort((a, b) => a.order - b.order);
        return acc;
      },
      {} as Record<TaskStatus, Task[]>
    );
  }, [filteredTasks]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Track over state for visual feedback if needed
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    const overTask = tasks.find((t) => t.id === over.id);
    // Determine target status: either the column itself or the column of the target card
    const overStatus = STATUS_ORDER.includes(over.id as TaskStatus)
      ? (over.id as TaskStatus)
      : overTask?.status;

    if (!overStatus) return;

    // If moving to a different column
    if (overStatus !== activeTask.status) {
      // Get new order (end of column or before target card)
      const targetColumnTasks = tasks
        .filter((t) => t.status === overStatus && t.id !== activeTask.id)
        .sort((a, b) => a.order - b.order);

      let newOrder = targetColumnTasks.length;
      if (overTask) {
        const overIndex = targetColumnTasks.findIndex((t) => t.id === overTask.id);
        if (overIndex !== -1) {
          newOrder = overIndex;
        }
      }

      onUpdateTask(activeTask.id, { status: overStatus, order: newOrder });
      return;
    }

    // Same column reordering
    if (overTask && overTask.id !== activeTask.id) {
      const columnTasks = tasks
        .filter((t) => t.status === overStatus)
        .sort((a, b) => a.order - b.order);

      const oldIndex = columnTasks.findIndex((t) => t.id === active.id);
      const newIndex = columnTasks.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(columnTasks, oldIndex, newIndex);
        reordered.forEach((task, index) => {
          if (task.order !== index) {
            onUpdateTask(task.id, { order: index });
          }
        });
      }
    }
  };

  const handleAddTask = useCallback((status: TaskStatus) => {
    setEditingTask(null);
    setDefaultStatus(status);
    setDialogOpen(true);
  }, []);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setDefaultStatus(task.status);
    setDialogOpen(true);
  }, []);

  const handleSaveTask = useCallback(
    (data: {
      id?: number;
      title: string;
      description?: string;
      status: TaskStatus;
      priority: TaskPriority;
      tags?: string[];
      assignee?: string;
    }) => {
      if (data.id) {
        onUpdateTask(data.id, data);
      } else {
        onCreateTask(data);
      }
    },
    [onCreateTask, onUpdateTask]
  );

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;


  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-4 p-4 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="pl-9"
          />
        </div>

        <Button onClick={() => handleAddTask('todo')}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>

        {onRefresh && (
          <Button variant="outline" size="icon" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-4 gap-4 h-full min-w-[800px]">
            {STATUS_ORDER.map((status) => (
              <TaskColumn
                key={status}
                status={status}
                tasks={tasksByStatus[status]}
                onAddTask={handleAddTask}
                onEditTask={handleEditTask}
                onDeleteTask={onDeleteTask}
                onArchiveTask={onArchiveTask}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTask && <TaskCard task={activeTask} />}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Task Dialog */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        defaultStatus={defaultStatus}
        onSave={handleSaveTask}
      />
    </div>
  );
}
