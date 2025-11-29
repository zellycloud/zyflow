import { useState } from 'react'
import { FileText, Plus, LayoutList, Kanban, Loader2, GripVertical, MoreVertical, Pencil, Trash2, Archive } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUpdateFlowTask, useProposalContent, useDesignContent, useChangeSpec } from '@/hooks/useFlowChanges'
import type { FlowTask, Stage, FlowTaskStatus } from '@/types'
import { STAGE_CONFIG } from '@/constants/stages'
import { cn } from '@/lib/utils'

// 칸반 보드에 표시할 컬럼 (archived 제외)
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

interface StageContentProps {
  changeId: string
  stage: Stage
  tasks: FlowTask[]
  specPath?: string
}

type ViewMode = 'list' | 'kanban'

export function StageContent({ changeId, stage, tasks }: StageContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const updateTask = useUpdateFlowTask()

  // Proposal 내용 가져오기 (Changes 탭용)
  const { data: proposalContent, isLoading: proposalLoading } = useProposalContent(
    stage === 'changes' ? changeId : null
  )

  // Design 내용 가져오기 (Changes 탭용)
  const { data: designContent, isLoading: designLoading } = useDesignContent(
    stage === 'changes' ? changeId : null
  )

  // Spec 내용 가져오기 (Spec 탭용) - Change 폴더 내 첫 번째 spec.md
  const { data: specContent, isLoading: specLoading } = useChangeSpec(
    stage === 'spec' ? changeId : null
  )

  const handleToggleTask = async (task: FlowTask) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    await updateTask.mutateAsync({ id: task.id, status: newStatus })
  }

  // Spec 탭: specs/{spec-id}/spec.md (기능 명세서)
  if (stage === 'spec') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>기능 명세서 (Spec)</span>
        </div>
        {specLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : specContent ? (
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg border bg-card">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{specContent}</ReactMarkdown>
          </div>
        ) : (
          <div className="p-4 rounded-lg border text-muted-foreground text-center">
            Spec 문서가 없습니다
          </div>
        )}
      </div>
    )
  }

  // Changes 탭: proposal.md & design.md (탭 구조)
  if (stage === 'changes') {
    const isLoading = proposalLoading || designLoading
    const hasProposal = !!proposalContent
    const hasDesign = !!designContent

    return (
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="proposal" className="w-full">
            <TabsList>
              <TabsTrigger value="proposal" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Proposal
                {!hasProposal && <span className="text-xs text-muted-foreground">(없음)</span>}
              </TabsTrigger>
              <TabsTrigger value="design" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Design
                {!hasDesign && <span className="text-xs text-muted-foreground">(없음)</span>}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="proposal" className="mt-4">
              {hasProposal ? (
                <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg border bg-card">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{proposalContent}</ReactMarkdown>
                </div>
              ) : (
                <div className="p-4 rounded-lg border text-muted-foreground text-center">
                  proposal.md 파일이 없습니다
                </div>
              )}
            </TabsContent>
            <TabsContent value="design" className="mt-4">
              {hasDesign ? (
                <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg border bg-card">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{designContent}</ReactMarkdown>
                </div>
              ) : (
                <div className="p-4 rounded-lg border text-muted-foreground text-center">
                  design.md 파일이 없습니다
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    )
  }

  // Tasks 탭은 칸반/리스트 뷰 토글 지원
  const showViewToggle = stage === 'task'

  // tasks.md 구조에 맞게 그룹화
  const groupedTasks = tasks.reduce((groups, task) => {
    const groupTitle = task.groupTitle || '기타'
    if (!groups[groupTitle]) {
      groups[groupTitle] = []
    }
    groups[groupTitle].push(task)
    return groups
  }, {} as Record<string, FlowTask[]>)

  // 그룹 정렬 (groupOrder 기준)
  const sortedGroups = Object.entries(groupedTasks).sort(([, a], [, b]) => {
    const orderA = a[0]?.groupOrder ?? 999
    const orderB = b[0]?.groupOrder ?? 999
    return orderA - orderB
  })

  // 칸반 뷰용 상태별 분류 (4컬럼: To Do, In Progress, Review, Done)
  const tasksByStatus = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = tasks
        .filter((t) => t.status === status)
        .sort((a, b) => a.order - b.order)
      return acc
    },
    {} as Record<FlowTaskStatus, FlowTask[]>
  )

  const handleArchiveTask = async (task: FlowTask) => {
    await updateTask.mutateAsync({ id: task.id, status: 'archived' })
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{STAGE_CONFIG[stage].icon}</span>
          <span>{STAGE_CONFIG[stage].label} 태스크</span>
          <Badge variant="secondary" className="text-xs">
            {tasks.filter((t) => t.status === 'done').length}/{tasks.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle - Tasks 탭만 표시 */}
          {showViewToggle && (
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 rounded-r-none"
                onClick={() => setViewMode('list')}
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 rounded-l-none"
                onClick={() => setViewMode('kanban')}
              >
                <Kanban className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            추가
          </Button>
        </div>
      </div>

      {/* Task Content */}
      {tasks.length === 0 ? (
        <div className="p-4 rounded-lg border text-muted-foreground text-center text-sm">
          {stage} 단계에 태스크가 없습니다
        </div>
      ) : showViewToggle && viewMode === 'kanban' ? (
        /* Kanban View - 4컬럼 (To Do, In Progress, Review, Done) */
        <div className="grid grid-cols-4 gap-4 min-h-[400px]">
          {STATUS_ORDER.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              onToggle={handleToggleTask}
              onArchive={handleArchiveTask}
            />
          ))}
        </div>
      ) : (
        /* List View (그룹화된 테이블) */
        <div className="space-y-4">
          {sortedGroups.map(([groupTitle, groupTasks], groupIdx) => (
            <div key={groupTitle} className="space-y-2">
              {/* Group Header */}
              {sortedGroups.length > 1 && (
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {groupIdx + 1}
                  </span>
                  {groupTitle}
                </h3>
              )}
              {/* Tasks Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>태스크</TableHead>
                      <TableHead className="w-20 text-center">우선순위</TableHead>
                      <TableHead className="w-20 text-center">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupTasks
                      .sort((a, b) => (a.taskOrder ?? 0) - (b.taskOrder ?? 0))
                      .map((task, taskIdx) => (
                        <TableRow
                          key={task.id}
                          className={cn(task.status === 'done' && 'bg-muted/30')}
                        >
                          <TableCell>
                            <Checkbox
                              checked={task.status === 'done'}
                              onCheckedChange={() => handleToggleTask(task)}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {groupIdx + 1}.{taskIdx + 1}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <span
                              className={cn(
                                task.status === 'done' &&
                                  'line-through text-muted-foreground'
                              )}
                            >
                              {task.title}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                task.priority === 'high'
                                  ? 'destructive'
                                  : task.priority === 'low'
                                    ? 'secondary'
                                    : 'outline'
                              }
                              className="text-xs"
                            >
                              {task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={task.status === 'done' ? 'default' : 'outline'}
                              className="text-xs"
                            >
                              {task.status === 'done' ? '완료' : '대기'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View More (if many tasks) */}
      {tasks.length > 10 && viewMode === 'list' && (
        <div className="text-center">
          <Button variant="ghost" size="sm">
            전체 보기 ({tasks.length}개)
          </Button>
        </div>
      )}
    </div>
  )
}

/* Kanban Column Component */
interface KanbanColumnProps {
  status: FlowTaskStatus
  tasks: FlowTask[]
  onToggle: (task: FlowTask) => void
  onArchive: (task: FlowTask) => void
}

function KanbanColumn({ status, tasks, onToggle, onArchive }: KanbanColumnProps) {
  return (
    <div className="flex flex-col h-full rounded-lg bg-muted/50">
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{STATUS_LABELS[status]}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {tasks.length}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Column Content */}
      <div className="flex-1 overflow-hidden min-h-[100px]">
        <ScrollArea className="h-full p-2">
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              onToggle={() => onToggle(task)}
              onArchive={() => onArchive(task)}
            />
          ))}
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

/* Kanban Card Component - shadcn 스타일 */
interface KanbanCardProps {
  task: FlowTask
  onToggle: () => void
  onArchive: () => void
}

function KanbanCard({ task, onToggle, onArchive }: KanbanCardProps) {
  const tags = task.tags ? (typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags) as string[] : []

  return (
    <Card className="mb-1.5 py-0 gap-0">
      <CardContent className="!px-2.5 !py-3.5">
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          <button className="mt-1 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing">
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Pencil className="mr-2 h-3 w-3" />
                    Edit
                  </DropdownMenuItem>
                  {task.status === 'done' && (
                    <DropdownMenuItem onClick={onArchive}>
                      <Archive className="mr-2 h-3 w-3" />
                      Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="mr-2 h-3 w-3" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Title */}
            <p className="text-sm font-medium mt-1 truncate">{task.title}</p>

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
