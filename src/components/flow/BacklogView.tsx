/**
 * Backlog View 컴포넌트
 *
 * backlog/*.md 파일 기반 태스크 관리
 * - Kanban 보드 형태 (기존 Inbox와 유사)
 * - Backlog 전용 확장 필드 지원 (Plan, Acceptance Criteria, Notes 등)
 * - 마일스톤 필터링
 */

import { useState, useMemo } from 'react'
import {
  Loader2,
  ListTodo,
  Plus,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  Search,
  X,
  Calendar,
  User,
  RefreshCw,
  CheckCircle,
  Target,
  FileText,
  Link2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  useBacklogTasks,
  useBacklogStats,
  useSyncBacklog,
  useUpdateBacklogTask,
  // TODO: Enable when create dialog is implemented
  // useCreateBacklogTask,
  useDeleteBacklogTask,
  useBacklogTaskDetail,
} from '@/hooks/useFlowChanges'
import { cn } from '@/lib/utils'
import type { FlowTask, FlowTaskStatus } from '@/types'

interface BacklogViewProps {
  projectId: string
}

// 칸반 보드에 표시할 컬럼
const STATUS_ORDER: FlowTaskStatus[] = ['todo', 'in-progress', 'review', 'done']

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

export function BacklogView({ projectId: _projectId }: BacklogViewProps) {
  const { data: tasks, isLoading, refetch } = useBacklogTasks({ includeArchived: true })
  const { data: stats } = useBacklogStats()
  const syncBacklog = useSyncBacklog()
  const updateTask = useUpdateBacklogTask()
  // TODO: Enable when create dialog is implemented
  // const createTask = useCreateBacklogTask()
  const deleteTask = useDeleteBacklogTask()

  // Tab state
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [milestoneFilter, setMilestoneFilter] = useState<string>('all')

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false)

  // Drag state
  const [activeTask, setActiveTask] = useState<FlowTask | null>(null)

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<FlowTask | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<FlowTask | null>(null)
  // TODO: Enable when create dialog is implemented
  // const [createDefaultStatus, setCreateDefaultStatus] = useState<FlowTaskStatus>('todo')
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [viewTask, setViewTask] = useState<FlowTask | null>(null)

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

  // 마일스톤 목록 추출
  const milestones = useMemo(() => {
    const set = new Set<string>()
    ;(tasks ?? []).forEach((t) => {
      if (t.milestone) set.add(t.milestone)
    })
    return Array.from(set).sort()
  }, [tasks])

  const handleMoveTask = async (task: FlowTask, newStatus: FlowTaskStatus) => {
    if (!task.backlogFileId) return
    await updateTask.mutateAsync({ backlogFileId: task.backlogFileId, status: newStatus })
  }

  const handleArchiveTask = async (task: FlowTask) => {
    if (!task.backlogFileId) return
    await deleteTask.mutateAsync({ backlogFileId: task.backlogFileId, archive: true })
  }

  const handleRestoreTask = async (task: FlowTask) => {
    if (!task.backlogFileId) return
    await updateTask.mutateAsync({ backlogFileId: task.backlogFileId, status: 'done' })
  }

  const handleEditTask = (task: FlowTask) => {
    setSelectedTask(task)
    setEditDialogOpen(true)
  }

  const handleViewTask = (task: FlowTask) => {
    setViewTask(task)
    setViewDialogOpen(true)
  }

  const handleDeleteTask = (task: FlowTask) => {
    setTaskToDelete(task)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!taskToDelete?.backlogFileId) return
    await deleteTask.mutateAsync({ backlogFileId: taskToDelete.backlogFileId, archive: true })
    setDeleteDialogOpen(false)
    setTaskToDelete(null)
  }

  // TODO: Enable when create dialog is implemented
  const handleAddTask = (_status: FlowTaskStatus = 'todo') => {
    // setCreateDefaultStatus(status)
    setSelectedTask(null)
    setCreateDialogOpen(true)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setShowRefreshSuccess(false)

    try {
      // Sync from markdown files first
      await syncBacklog.mutateAsync()
      await refetch()

      setShowRefreshSuccess(true)
      toast.success('Backlog이 동기화되었습니다.')

      setTimeout(() => {
        setShowRefreshSuccess(false)
      }, 1500)
    } catch (error) {
      console.error('Failed to refresh backlog:', error)
      toast.error('Backlog 동기화에 실패했습니다.')
    } finally {
      setIsRefreshing(false)
    }
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
    // Could be used for visual feedback
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const activeId = active.id
    const task = (tasks ?? []).find((t) => t.id === activeId)
    if (!task?.backlogFileId) return

    const overData = over.data.current
    if (overData?.type === 'column') {
      const newStatus = overData.status as FlowTaskStatus
      if (task.status !== newStatus) {
        await updateTask.mutateAsync({ backlogFileId: task.backlogFileId, status: newStatus })
      }
      return
    }

    const overTask = (tasks ?? []).find((t) => t.id === over.id)
    if (overTask && task.status !== overTask.status) {
      await updateTask.mutateAsync({ backlogFileId: task.backlogFileId, status: overTask.status })
    }
  }

  // 활성 작업과 아카이브 분리 (검색 및 마일스톤 필터 적용)
  const activeTasks = useMemo(() => {
    const filterBySearch = (task: FlowTask) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      const tags = task.tags
        ? typeof task.tags === 'string'
          ? JSON.parse(task.tags)
          : task.tags
        : []
      return (
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        tags.some((tag: string) => tag.toLowerCase().includes(query)) ||
        task.assignee?.toLowerCase().includes(query) ||
        task.backlogFileId?.toLowerCase().includes(query) ||
        task.milestone?.toLowerCase().includes(query)
      )
    }

    const filterByMilestone = (task: FlowTask) => {
      if (milestoneFilter === 'all') return true
      if (milestoneFilter === 'none') return !task.milestone
      return task.milestone === milestoneFilter
    }

    return (tasks ?? [])
      .filter((t) => t.status !== 'archived')
      .filter(filterBySearch)
      .filter(filterByMilestone)
  }, [tasks, searchQuery, milestoneFilter])

  const archivedTasks = useMemo(() => {
    const filterBySearch = (task: FlowTask) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return (
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.backlogFileId?.toLowerCase().includes(query)
      )
    }
    return (tasks ?? []).filter((t) => t.status === 'archived').filter(filterBySearch)
  }, [tasks, searchQuery])

  // 상태별 그룹핑
  const tasksByStatus = useMemo(() => {
    const grouped: Record<FlowTaskStatus, FlowTask[]> = {
      todo: [],
      'in-progress': [],
      review: [],
      done: [],
      archived: [],
    }
    activeTasks.forEach((task) => {
      const status = task.status as FlowTaskStatus
      if (grouped[status]) {
        grouped[status].push(task)
      }
    })
    return grouped
  }, [activeTasks])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-4 pt-4">
        <div className="flex items-center gap-2">
          <ListTodo className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Backlog</h2>
          {stats && (
            <Badge variant="secondary" className="ml-2">
              {stats.total} tasks
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Milestone Filter */}
          <Select value={milestoneFilter} onValueChange={setMilestoneFilter}>
            <SelectTrigger className="w-[150px] h-8">
              <Target className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Milestone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="none">No Milestone</SelectItem>
              {milestones.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-8 h-8"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
                onClick={() => setSearchQuery('')}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>

          {/* Refresh */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : showRefreshSuccess ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>

          {/* Add Task */}
          <Button size="sm" className="h-8" onClick={() => handleAddTask('todo')}>
            <Plus className="w-4 h-4 mr-1" />
            Add Task
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'archived')} className="flex-1 flex flex-col">
        <TabsList className="mx-4 w-fit">
          <TabsTrigger value="active" className="gap-1">
            Active
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {activeTasks.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-1">
            Archived
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {archivedTasks.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="flex-1 mt-4 overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-full px-4 pb-4 overflow-x-auto">
              {STATUS_ORDER.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status]}
                  onAddTask={() => handleAddTask(status)}
                  onMoveTask={handleMoveTask}
                  onArchiveTask={handleArchiveTask}
                  onEditTask={handleEditTask}
                  onViewTask={handleViewTask}
                  onDeleteTask={handleDeleteTask}
                />
              ))}
            </div>

            <DragOverlay>
              {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
            </DragOverlay>
          </DndContext>
        </TabsContent>

        <TabsContent value="archived" className="flex-1 mt-4 overflow-hidden px-4 pb-4">
          <ScrollArea className="h-full">
            <div className="space-y-2">
              {archivedTasks.map((task) => (
                <ArchivedTaskCard
                  key={task.id}
                  task={task}
                  onRestore={handleRestoreTask}
                  onView={handleViewTask}
                />
              ))}
              {archivedTasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No archived tasks
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Task View Dialog with Subtasks */}
      <TaskDetailDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        task={viewTask}
        allTasks={tasks ?? []}
        onNavigateToTask={(t) => {
          setViewTask(t)
        }}
      />

      {/* Create/Edit Dialog - TODO: Implement BacklogTaskDialog */}
      <Dialog open={createDialogOpen || editDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCreateDialogOpen(false)
          setEditDialogOpen(false)
          setSelectedTask(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedTask ? 'Edit Task' : 'Create Task'}
            </DialogTitle>
            <DialogDescription>
              {selectedTask ? 'Update the task details' : 'Create a new backlog task'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-center text-muted-foreground">
            Task dialog coming soon...
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the task. You can restore it from the archived tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// =============================================
// Sub Components
// =============================================

interface KanbanColumnProps {
  status: FlowTaskStatus
  tasks: FlowTask[]
  onAddTask: () => void
  onMoveTask: (task: FlowTask, newStatus: FlowTaskStatus) => void
  onArchiveTask: (task: FlowTask) => void
  onEditTask: (task: FlowTask) => void
  onViewTask: (task: FlowTask) => void
  onDeleteTask: (task: FlowTask) => void
}

function KanbanColumn({
  status,
  tasks,
  onAddTask,
  onMoveTask,
  onArchiveTask,
  onEditTask,
  onViewTask,
  onDeleteTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: 'column', status },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-[280px] flex flex-col rounded-lg border bg-muted/50',
        isOver && 'ring-2 ring-primary/50'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <span className="font-medium">{STATUS_LABELS[status]}</span>
          <Badge variant="secondary" className="h-5 px-1.5">
            {tasks.length}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAddTask}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Tasks */}
      <ScrollArea className="flex-1 p-2">
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onMoveTask={onMoveTask}
                onArchiveTask={onArchiveTask}
                onEditTask={onEditTask}
                onViewTask={onViewTask}
                onDeleteTask={onDeleteTask}
              />
            ))}
          </div>
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
            No tasks
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

interface SortableTaskCardProps {
  task: FlowTask
  onMoveTask: (task: FlowTask, newStatus: FlowTaskStatus) => void
  onArchiveTask: (task: FlowTask) => void
  onEditTask: (task: FlowTask) => void
  onViewTask: (task: FlowTask) => void
  onDeleteTask: (task: FlowTask) => void
}

function SortableTaskCard({
  task,
  onMoveTask,
  onArchiveTask,
  onEditTask,
  onViewTask,
  onDeleteTask,
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-pointer transition-shadow hover:shadow-md',
        isDragging && 'opacity-50 shadow-lg'
      )}
      onClick={() => onViewTask(task)}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab active:cursor-grabbing touch-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex-1 min-w-0">
            {/* Title */}
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  PRIORITY_COLORS[task.priority]
                )}
              />
              <span className="font-medium text-sm truncate">{task.title}</span>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {task.backlogFileId && (
                <span className="font-mono">{task.backlogFileId}</span>
              )}
              {task.milestone && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {task.milestone}
                </Badge>
              )}
              {task.assignee && (
                <span className="flex items-center gap-0.5">
                  <User className="w-3 h-3" />
                  {task.assignee}
                </span>
              )}
              {task.dueDate && (
                <span className="flex items-center gap-0.5">
                  <Calendar className="w-3 h-3" />
                  {new Date(task.dueDate).toLocaleDateString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>

            {/* Tags */}
            {task.tags && task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {(typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags)
                  .slice(0, 3)
                  .map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="h-4 px-1 text-[10px]">
                      {tag}
                    </Badge>
                  ))}
              </div>
            )}

            {/* Indicators - Plan, AC, Dependencies */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {/* Blocked indicator - 의존성 있을 때 */}
              {task.blockedBy && task.blockedBy.length > 0 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-400">
                  <Link2 className="w-2.5 h-2.5 mr-0.5" />
                  {task.blockedBy.length} blocked
                </Badge>
              )}

              {/* Plan indicator */}
              {task.plan && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-400">
                  <FileText className="w-2.5 h-2.5 mr-0.5" />
                  Plan
                </Badge>
              )}

              {/* Acceptance Criteria indicator */}
              {task.acceptanceCriteria && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-green-50 border-green-200 text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-400">
                  <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                  AC
                </Badge>
              )}

              {/* Subtask indicator - parentTaskId가 있으면 자식 태스크 */}
              {task.parentTaskId && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950 dark:border-purple-800 dark:text-purple-400">
                  ↳ subtask
                </Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onEditTask(task)
                }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {STATUS_ORDER.filter((s) => s !== task.status).map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMoveTask(task, status)
                      }}
                    >
                      {STATUS_LABELS[status]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onArchiveTask(task)
                }}
              >
                <Archive className="w-4 h-4 mr-2" />
                Archive
              </DropdownMenuItem>

              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteTask(task)
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )
}

function TaskCardOverlay({ task }: { task: FlowTask }) {
  return (
    <Card className="shadow-xl cursor-grabbing w-[260px]">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              PRIORITY_COLORS[task.priority]
            )}
          />
          <span className="font-medium text-sm truncate">{task.title}</span>
        </div>
      </CardContent>
    </Card>
  )
}

interface ArchivedTaskCardProps {
  task: FlowTask
  onRestore: (task: FlowTask) => void
  onView: (task: FlowTask) => void
}

function ArchivedTaskCard({ task, onRestore, onView }: ArchivedTaskCardProps) {
  return (
    <Card className="opacity-75 hover:opacity-100 transition-opacity">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2" onClick={() => onView(task)}>
            <span
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                PRIORITY_COLORS[task.priority]
              )}
            />
            <span className="text-sm">{task.title}</span>
            {task.backlogFileId && (
              <span className="text-xs text-muted-foreground font-mono">
                {task.backlogFileId}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRestore(task)}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Restore
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================
// Task Detail Dialog with Subtasks & Dependencies
// =============================================

interface TaskDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: FlowTask | null
  allTasks: FlowTask[]
  onNavigateToTask: (task: FlowTask) => void
}

function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  allTasks,
  onNavigateToTask,
}: TaskDetailDialogProps) {
  // Fetch detailed task info including subtasks
  const { data: taskDetail } = useBacklogTaskDetail(task?.backlogFileId ?? null, {
    enabled: open && !!task?.backlogFileId,
  })

  // Find blocking tasks from allTasks
  const blockingTasks = useMemo(() => {
    if (!task?.blockedBy || task.blockedBy.length === 0) return []
    return allTasks.filter((t) => task.blockedBy?.includes(t.backlogFileId ?? ''))
  }, [task, allTasks])

  // Find parent task if this is a subtask
  const parentTask = useMemo(() => {
    if (!task?.parentTaskId) return null
    return allTasks.find((t) => t.id === task.parentTaskId)
  }, [task, allTasks])

  // Get subtasks from detail API or find from allTasks
  const subtasks = useMemo(() => {
    if (taskDetail?.subtasks) {
      return taskDetail.subtasks
    }
    // Fallback: find subtasks from allTasks
    return allTasks.filter((t) => t.parentTaskId === task?.id)
  }, [taskDetail, allTasks, task])

  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono">{task.backlogFileId}</Badge>
            {task.parentTaskId && (
              <Badge variant="secondary" className="text-[10px]">↳ subtask</Badge>
            )}
            <span className="flex-1">{task.title}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">Task details</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status & Priority */}
          <div className="flex gap-2 flex-wrap">
            <Badge>{STATUS_LABELS[task.status as FlowTaskStatus]}</Badge>
            <Badge variant="outline" className="capitalize">
              {task.priority}
            </Badge>
            {task.milestone && (
              <Badge variant="secondary">
                <Target className="w-3 h-3 mr-1" />
                {task.milestone}
              </Badge>
            )}
          </div>

          {/* Parent Task Link */}
          {parentTask && (
            <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-md p-3">
              <h4 className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">
                Parent Task
              </h4>
              <button
                className="flex items-center gap-2 text-sm hover:underline text-left"
                onClick={() => onNavigateToTask(parentTask)}
              >
                <span className="font-mono text-xs">{parentTask.backlogFileId}</span>
                <span>{parentTask.title}</span>
              </button>
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div>
              <h4 className="text-sm font-medium mb-1">Description</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )}

          {/* Blocked By - Dependencies */}
          {blockingTasks.length > 0 && (
            <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-md p-3">
              <h4 className="text-xs font-medium text-orange-700 dark:text-orange-400 mb-2 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                Blocked By ({blockingTasks.length})
              </h4>
              <div className="space-y-1">
                {blockingTasks.map((bt) => (
                  <button
                    key={bt.id}
                    className="flex items-center gap-2 text-sm hover:underline text-left w-full"
                    onClick={() => onNavigateToTask(bt)}
                  >
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        PRIORITY_COLORS[bt.priority]
                      )}
                    />
                    <span className="font-mono text-xs">{bt.backlogFileId}</span>
                    <span className="truncate">{bt.title}</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {STATUS_LABELS[bt.status as FlowTaskStatus]}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Raw blockedBy IDs (if some weren't found) */}
          {task.blockedBy && task.blockedBy.length > blockingTasks.length && (
            <div className="flex flex-wrap gap-1">
              {task.blockedBy
                .filter((id) => !blockingTasks.some((t) => t.backlogFileId === id))
                .map((id) => (
                  <Badge key={id} variant="outline" className="text-orange-600">
                    {id} (not found)
                  </Badge>
                ))}
            </div>
          )}

          {/* Subtasks */}
          {subtasks.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3">
              <h4 className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1">
                <ListTodo className="w-3 h-3" />
                Subtasks ({subtasks.length})
              </h4>
              <div className="space-y-1">
                {subtasks.map((st) => {
                  const fullTask = allTasks.find((t) => t.id === st.id)
                  return (
                    <button
                      key={st.id}
                      className="flex items-center gap-2 text-sm hover:underline text-left w-full"
                      onClick={() => fullTask && onNavigateToTask(fullTask)}
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          PRIORITY_COLORS[st.priority as 'low' | 'medium' | 'high']
                        )}
                      />
                      <span className="truncate flex-1">{st.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {STATUS_LABELS[st.status as FlowTaskStatus]}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Plan */}
          {task.plan && (
            <div>
              <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                <FileText className="w-4 h-4" />
                Plan
              </h4>
              <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                {task.plan}
              </div>
            </div>
          )}

          {/* Acceptance Criteria */}
          {task.acceptanceCriteria && (
            <div>
              <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                Acceptance Criteria
              </h4>
              <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                {task.acceptanceCriteria}
              </div>
            </div>
          )}

          {/* Notes */}
          {task.notes && (
            <div>
              <h4 className="text-sm font-medium mb-1">Notes</h4>
              <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                {task.notes}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t flex-wrap">
            {task.assignee && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {task.assignee}
              </span>
            )}
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}
            {task.createdAt && (
              <span>Created: {new Date(task.createdAt).toLocaleDateString()}</span>
            )}
            {task.updatedAt && (
              <span>Updated: {new Date(task.updatedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
