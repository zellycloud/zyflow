import { useState, useMemo } from 'react'
import { Loader2, ListTodo, Plus, GripVertical, MoreVertical, Pencil, Trash2, Archive, ArrowRight, RotateCcw, Search, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useFlowTasks, useUpdateFlowTask, useCreateFlowTask } from '@/hooks/useFlowChanges'
import { cn } from '@/lib/utils'
import { TaskDialog } from '@/components/tasks/TaskDialog'
import type { FlowTask, FlowTaskStatus } from '@/types'

interface StandaloneTasksProps {
  projectId: string
}

// 칸반 보드에 표시할 컬럼 (review, archived 제외)
const STATUS_ORDER: FlowTaskStatus[] = ['todo', 'in-progress', 'done']

const STATUS_LABELS: Record<FlowTaskStatus, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  review: 'Review',
  done: 'Done',
  archived: 'Archived',
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
}

export function StandaloneTasks({ projectId: _projectId }: StandaloneTasksProps) {
  const { data: tasks, isLoading } = useFlowTasks({ standalone: true, includeArchived: true })
  const updateTask = useUpdateFlowTask()
  const createTask = useCreateFlowTask()

  // Tab state
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  // Drag state
  const [activeTask, setActiveTask] = useState<FlowTask | null>(null)

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<FlowTask | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<FlowTask | null>(null)
  const [createDefaultStatus, setCreateDefaultStatus] = useState<FlowTaskStatus>('todo')

  // projectId는 향후 확장용으로 유지
  void _projectId

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleMoveTask = async (task: FlowTask, newStatus: FlowTaskStatus) => {
    await updateTask.mutateAsync({ id: task.id, status: newStatus })
  }

  const handleArchiveTask = async (task: FlowTask) => {
    await updateTask.mutateAsync({ id: task.id, status: 'archived' })
  }

  const handleRestoreTask = async (task: FlowTask) => {
    await updateTask.mutateAsync({ id: task.id, status: 'done' })
  }

  const handleEditTask = (task: FlowTask) => {
    setSelectedTask(task)
    setEditDialogOpen(true)
  }

  const handleDeleteTask = (task: FlowTask) => {
    setTaskToDelete(task)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!taskToDelete) return
    await updateTask.mutateAsync({ id: taskToDelete.id, status: 'archived' })
    setDeleteDialogOpen(false)
    setTaskToDelete(null)
  }

  const handleSaveTask = async (data: {
    id?: number
    title: string
    description?: string
    status: FlowTaskStatus
    priority: 'low' | 'medium' | 'high'
    tags?: string[]
    assignee?: string
  }) => {
    if (data.id) {
      await updateTask.mutateAsync({
        id: data.id,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
      })
    } else {
      await createTask.mutateAsync({
        title: data.title,
        description: data.description,
        priority: data.priority,
      })
    }
  }

  const handleAddTask = (status: FlowTaskStatus = 'todo') => {
    setCreateDefaultStatus(status)
    setSelectedTask(null)
    setCreateDialogOpen(true)
  }

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const task = (tasks ?? []).find((t) => t.id === active.id)
    if (task) {
      setActiveTask(task)
    }
  }

  const handleDragOver = (_event: DragOverEvent) => {
    // Could be used for visual feedback when hovering over columns
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const activeId = active.id
    const overId = over.id

    // Find the task being dragged
    const task = (tasks ?? []).find((t) => t.id === activeId)
    if (!task) return

    // Check if dropped on a column (empty area or column itself)
    const overData = over.data.current
    if (overData?.type === 'column') {
      const newStatus = overData.status as FlowTaskStatus
      if (task.status !== newStatus) {
        await updateTask.mutateAsync({ id: task.id, status: newStatus })
      }
      return
    }

    // Check if dropped on another task
    const overTask = (tasks ?? []).find((t) => t.id === overId)
    if (overTask) {
      // Different column - move to that column
      if (task.status !== overTask.status) {
        await updateTask.mutateAsync({ id: task.id, status: overTask.status })
      } else if (task.id !== overTask.id) {
        // Same column - reorder (update order field)
        // For now, just swap order values
        const taskOrder = task.order
        const overTaskOrder = overTask.order
        await Promise.all([
          updateTask.mutateAsync({ id: task.id, order: overTaskOrder }),
          updateTask.mutateAsync({ id: overTask.id, order: taskOrder }),
        ])
      }
    }
  }

  // 활성 작업과 아카이브 분리 (검색 필터 적용)
  // Note: hooks must be called before any conditional returns
  const activeTasks = useMemo(() => {
    const filterBySearch = (task: FlowTask) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      const tags = task.tags ? (typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags) as string[] : []
      return (
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        tags.some(tag => tag.toLowerCase().includes(query)) ||
        task.assignee?.toLowerCase().includes(query) ||
        String(task.id).includes(query)
      )
    }
    return (tasks ?? []).filter((t) => t.status !== 'archived').filter(filterBySearch)
  }, [tasks, searchQuery])

  const archivedTasks = useMemo(() => {
    const filterBySearch = (task: FlowTask) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      const tags = task.tags ? (typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags) as string[] : []
      return (
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        tags.some(tag => tag.toLowerCase().includes(query)) ||
        task.assignee?.toLowerCase().includes(query) ||
        String(task.id).includes(query)
      )
    }
    return (tasks ?? []).filter((t) => t.status === 'archived').filter(filterBySearch)
  }, [tasks, searchQuery])

  // 칸반 뷰용 상태별 분류 (3컬럼: To Do, In Progress, Done)
  const tasksByStatus = useMemo(() => STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = activeTasks
        .filter((t) => t.status === status)
        .sort((a, b) => a.order - b.order)
      return acc
    },
    {} as Record<FlowTaskStatus, FlowTask[]>
  ), [activeTasks])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListTodo className="h-6 w-6" />
            Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Change에 속하지 않는 독립적인 작업들
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 검색 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 w-48"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {activeTab === 'active' && (
            <Button onClick={() => handleAddTask('todo')}>
              <Plus className="h-4 w-4 mr-2" />
              작업 추가
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'archived')}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            작업
            <Badge variant="secondary" className="text-xs">
              {activeTasks.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            <Archive className="h-4 w-4" />
            아카이브
            <Badge variant="secondary" className="text-xs">
              {archivedTasks.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {/* Kanban Board with DnD */}
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-3 gap-4 min-h-[500px]">
              {STATUS_ORDER.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status]}
                  onMove={handleMoveTask}
                  onArchive={handleArchiveTask}
                  onEdit={handleEditTask}
                  onDelete={handleDeleteTask}
                  onAddTask={() => handleAddTask(status)}
                />
              ))}
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
              {activeTask ? (
                <div className="opacity-80">
                  <KanbanCardContent
                    task={activeTask}
                    currentStatus={activeTask.status}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          {/* Archived Tasks List */}
          <div className="rounded-lg bg-muted/50 p-4 min-h-[500px]">
            {archivedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Archive className="h-12 w-12 mb-4 opacity-30" />
                <p>아카이브된 작업이 없습니다</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {archivedTasks.map((task) => (
                  <ArchivedTaskCard
                    key={task.id}
                    task={task}
                    onRestore={() => handleRestoreTask(task)}
                    onEdit={() => handleEditTask(task)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Task Dialog */}
      <TaskDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        task={selectedTask}
        onSave={handleSaveTask}
      />

      {/* Create Task Dialog */}
      <TaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        task={null}
        defaultStatus={createDefaultStatus}
        onSave={handleSaveTask}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>작업 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{taskToDelete?.title}" 작업을 삭제하시겠습니까?
              삭제된 작업은 아카이브로 이동됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* Archived Task Card Component */
interface ArchivedTaskCardProps {
  task: FlowTask
  onRestore: () => void
  onEdit: () => void
}

function ArchivedTaskCard({ task, onRestore, onEdit }: ArchivedTaskCardProps) {
  const tags = task.tags ? (typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags) as string[] : []

  return (
    <Card className="py-0 gap-0 opacity-75 hover:opacity-100 transition-opacity">
      <CardContent className="!px-4 !py-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn('w-2 h-2 rounded-full', PRIORITY_COLORS[task.priority])}
                title={task.priority}
              />
              <span className="text-xs text-muted-foreground font-mono">
                #{task.id}
              </span>
              <p className="text-sm font-medium truncate">{task.title}</p>
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
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
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onRestore}>
              <RotateCcw className="h-3 w-3 mr-1" />
              복원
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* Kanban Column Component */
interface KanbanColumnProps {
  status: FlowTaskStatus
  tasks: FlowTask[]
  onMove: (task: FlowTask, newStatus: FlowTaskStatus) => void
  onArchive: (task: FlowTask) => void
  onEdit: (task: FlowTask) => void
  onDelete: (task: FlowTask) => void
  onAddTask: () => void
}

function KanbanColumn({ status, tasks, onMove, onArchive, onEdit, onDelete, onAddTask }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: 'column', status },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-full rounded-lg bg-muted/50 transition-colors",
        isOver && "ring-2 ring-primary ring-offset-2"
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{STATUS_LABELS[status]}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {tasks.length}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onAddTask}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Column Content */}
      <div className="flex-1 overflow-hidden min-h-[100px]">
        <ScrollArea className="h-full p-2">
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {tasks.map((task) => (
              <SortableKanbanCard
                key={task.id}
                task={task}
                currentStatus={status}
                onMove={(newStatus) => onMove(task, newStatus)}
                onArchive={() => onArchive(task)}
                onEdit={() => onEdit(task)}
                onDelete={() => onDelete(task)}
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
  )
}

/* Sortable Kanban Card Wrapper */
interface SortableKanbanCardProps {
  task: FlowTask
  currentStatus: FlowTaskStatus
  onMove: (newStatus: FlowTaskStatus) => void
  onArchive: () => void
  onEdit: () => void
  onDelete: () => void
}

function SortableKanbanCard({ task, currentStatus, onMove, onArchive, onEdit, onDelete }: SortableKanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <KanbanCardContent
        task={task}
        currentStatus={currentStatus}
        onMove={onMove}
        onArchive={onArchive}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

/* Kanban Card Content Component */
interface KanbanCardContentProps {
  task: FlowTask
  currentStatus: FlowTaskStatus
  onMove?: (newStatus: FlowTaskStatus) => void
  onArchive?: () => void
  onEdit?: () => void
  onDelete?: () => void
  dragHandleProps?: Record<string, unknown>
}

function KanbanCardContent({ task, currentStatus, onMove, onArchive, onEdit, onDelete, dragHandleProps }: KanbanCardContentProps) {
  const tags = task.tags ? (typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags) as string[] : []
  const moveOptions = STATUS_ORDER.filter(s => s !== currentStatus)

  return (
    <Card className="mb-1.5 py-0 gap-0">
      <CardContent className="!px-2.5 !py-3.5">
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          <button
            className="mt-1 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            {/* Header: Priority & ID & Menu */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn('w-2 h-2 rounded-full', PRIORITY_COLORS[task.priority])}
                  title={task.priority}
                />
                <span className="text-xs text-muted-foreground font-mono">
                  #{task.id}
                </span>
              </div>

              {onEdit && onDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="mr-2 h-3 w-3" />
                      Edit
                    </DropdownMenuItem>

                    {onMove && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <ArrowRight className="mr-2 h-3 w-3" />
                          Move to
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {moveOptions.map((targetStatus) => (
                            <DropdownMenuItem
                              key={targetStatus}
                              onClick={() => onMove(targetStatus)}
                            >
                              {STATUS_LABELS[targetStatus]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {task.status === 'done' && onArchive && (
                      <DropdownMenuItem onClick={onArchive}>
                        <Archive className="mr-2 h-3 w-3" />
                        Archive
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                      <Trash2 className="mr-2 h-3 w-3" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Title */}
            <p className="text-sm font-medium mt-1 break-words">{task.title}</p>

            {/* Description */}
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Assignee */}
            {task.assignee && (
              <p className="text-xs text-muted-foreground mt-2">
                @{task.assignee}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
