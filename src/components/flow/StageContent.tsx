import { useState, useMemo, useCallback } from 'react'
import { FileText, Plus, Loader2, Play, History, CheckSquare, Square, MinusSquare, Filter, FilterX } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { useUpdateFlowTask, useProposalContent, useDesignContent, useChangeSpec } from '@/hooks/useFlowChanges'
import { TaskExecutionDialog } from './TaskExecutionDialog'
import { ExecutionHistoryDialog } from './ExecutionHistoryDialog'
import type { FlowTask, Stage } from '@/types'
import { STAGE_CONFIG } from '@/constants/stages'
import { cn } from '@/lib/utils'


interface StageContentProps {
  changeId: string
  stage: Stage
  tasks: FlowTask[]
  specPath?: string
}

export function StageContent({ changeId, stage, tasks }: StageContentProps) {
  const updateTask = useUpdateFlowTask()
  const [executingTask, setExecutingTask] = useState<FlowTask | null>(null)
  const [historyTask, setHistoryTask] = useState<FlowTask | null>(null)

  // 선택된 태스크 ID 관리
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set())

  // 다중 태스크 실행 다이얼로그 상태
  const [executingMultiple, setExecutingMultiple] = useState(false)

  // 미완료 작업만 보기 필터
  const [showOnlyPending, setShowOnlyPending] = useState(false)

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

  // 태스크 선택 토글
  const handleToggleSelect = useCallback((taskId: number) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }, [])

  // 그룹 전체 선택/해제 (Sub Section 단위)
  const handleToggleGroupSelect = useCallback((taskIds: number[]) => {
    setSelectedTaskIds(prev => {
      const allSelected = taskIds.every(id => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        // 모두 선택됨 -> 모두 해제
        taskIds.forEach(id => next.delete(id))
      } else {
        // 일부 또는 없음 -> 모두 선택
        taskIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [])

  // 그룹 선택 상태 확인 (all/some/none)
  const getGroupSelectState = useCallback((taskIds: number[]): 'all' | 'some' | 'none' => {
    const selectedCount = taskIds.filter(id => selectedTaskIds.has(id)).length
    if (selectedCount === 0) return 'none'
    if (selectedCount === taskIds.length) return 'all'
    return 'some'
  }, [selectedTaskIds])

  // 선택된 태스크 목록
  const selectedTasks = useMemo(() =>
    tasks.filter(t => selectedTaskIds.has(t.id)),
    [tasks, selectedTaskIds]
  )

  // 필터링된 태스크 (미완료만 보기 옵션 적용)
  const filteredTasks = useMemo(() =>
    showOnlyPending ? tasks.filter(t => t.status !== 'done') : tasks,
    [tasks, showOnlyPending]
  )

  // 완료된 태스크 수
  const doneCount = useMemo(() => tasks.filter(t => t.status === 'done').length, [tasks])
  const pendingCount = tasks.length - doneCount

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

  // 3단계 계층 구조로 그룹화:
  // Major Section (## 1.) > Sub Section (### 1.1) > Tasks (- [ ] 1.1.1)
  interface SubSection {
    subOrder: number
    groupTitle: string
    tasks: FlowTask[]
  }
  interface MajorSection {
    majorOrder: number
    majorTitle: string
    subSections: SubSection[]
  }

  const majorSections: MajorSection[] = []
  const majorMap = new Map<number, MajorSection>()

  // filteredTasks를 사용하여 미완료 필터 적용
  for (const task of filteredTasks) {
    const majorOrder = task.groupOrder ?? 1
    const majorTitle = task.majorTitle ?? task.groupTitle ?? '기타'
    const subOrder = task.subOrder ?? 1
    const groupTitle = task.groupTitle ?? '기타'

    if (!majorMap.has(majorOrder)) {
      const section: MajorSection = {
        majorOrder,
        majorTitle,
        subSections: [],
      }
      majorMap.set(majorOrder, section)
      majorSections.push(section)
    }

    const major = majorMap.get(majorOrder)!
    let subSection = major.subSections.find((s) => s.subOrder === subOrder)
    if (!subSection) {
      subSection = { subOrder, groupTitle, tasks: [] }
      major.subSections.push(subSection)
    }
    subSection.tasks.push(task)
  }

  // 정렬
  majorSections.sort((a, b) => a.majorOrder - b.majorOrder)
  for (const major of majorSections) {
    major.subSections.sort((a, b) => a.subOrder - b.subOrder)
    for (const sub of major.subSections) {
      sub.tasks.sort((a, b) => (a.taskOrder ?? 0) - (b.taskOrder ?? 0))
    }
  }

  // 단일 major인지, 단일 sub인지 확인하여 넘버링 형식 결정
  const showMajorHeaders = majorSections.length > 1
  const showSubHeaders = majorSections.some((m) => m.subSections.length > 1)

  // 넘버링 형식 결정 함수 - displayId 우선, 없으면 기존 로직 폴백
  const getTaskNumber = (major: MajorSection, sub: SubSection, task: FlowTask) => {
    // displayId가 있으면 그것을 사용 (파서에서 자동 생성된 순서 기반 ID)
    if (task.displayId) {
      return task.displayId
    }

    // 폴백: 기존 로직 (taskOrder 기반)
    const taskNum = task.taskOrder ?? 1
    if (showMajorHeaders && showSubHeaders) {
      // 3단계: 1.1.1, 1.1.2, ... (major.sub.task)
      return `${major.majorOrder}.${sub.subOrder}.${taskNum}`
    } else if (showMajorHeaders) {
      // 2단계: 1.1, 1.2, ... (major.task)
      return `${major.majorOrder}.${taskNum}`
    } else if (showSubHeaders) {
      // 2단계: 1.1, 1.2, ... (sub.task)
      return `${sub.subOrder}.${taskNum}`
    } else {
      // 1단계: 1, 2, 3, ...
      return `${taskNum}`
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {(() => {
            const IconComponent = STAGE_CONFIG[stage].icon
            return <IconComponent className="h-4 w-4" />
          })()}
          <span>{STAGE_CONFIG[stage].label} 태스크</span>
          <Badge variant="secondary" className="text-xs">
            {doneCount}/{tasks.length}
          </Badge>
          {/* 미완료 작업만 보기 토글 */}
          {pendingCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showOnlyPending ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={() => setShowOnlyPending(!showOnlyPending)}
                  >
                    {showOnlyPending ? (
                      <>
                        <FilterX className="h-3.5 w-3.5" />
                        <span className="text-xs">미완료 {pendingCount}개</span>
                      </>
                    ) : (
                      <>
                        <Filter className="h-3.5 w-3.5" />
                        <span className="text-xs">미완료만</span>
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showOnlyPending ? '전체 보기' : '미완료 작업만 보기'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 선택된 태스크가 있을 때 실행 버튼 표시 */}
          {selectedTaskIds.size > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setExecutingMultiple(true)}
            >
              <Play className="h-4 w-4 mr-2" />
              선택 실행 ({selectedTaskIds.size}개)
            </Button>
          )}
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            추가
          </Button>
        </div>
      </div>

      {/* Task Content */}
      {filteredTasks.length === 0 ? (
        <div className="p-4 rounded-lg border text-muted-foreground text-center text-sm">
          {showOnlyPending && tasks.length > 0
            ? '모든 태스크가 완료되었습니다! 🎉'
            : `${stage} 단계에 태스크가 없습니다`}
        </div>
      ) : (
        /* 3단계 계층 구조 렌더링 */
        <div className="space-y-6">
          {majorSections.map((major) => (
            <div key={major.majorOrder} className="space-y-4">
              {/* Major Section Header (## 1. 대제목) */}
              {showMajorHeaders && (
                <h2 className="text-base font-semibold flex items-center gap-2 border-b pb-2">
                  <span className="text-sm bg-primary text-primary-foreground px-2 py-0.5 rounded">
                    {major.majorOrder}
                  </span>
                  {major.majorTitle}
                </h2>
              )}

              {/* Sub Sections */}
              <div className="space-y-4">
                {major.subSections.map((sub) => (
                  <div key={`${major.majorOrder}-${sub.subOrder}`} className="space-y-2">
                    {/* Sub Section Header (### 1.1 소제목) with Group Select */}
                    {showSubHeaders && (() => {
                      const pendingTaskIds = sub.tasks
                        .filter(t => t.status !== 'done')
                        .map(t => t.id)
                      const selectState = getGroupSelectState(pendingTaskIds)
                      const hasPendingTasks = pendingTaskIds.length > 0

                      return (
                        <div className="flex items-center gap-2">
                          {hasPendingTasks && (
                            <button
                              onClick={() => handleToggleGroupSelect(pendingTaskIds)}
                              className="hover:bg-blue-50 dark:hover:bg-blue-950 rounded p-0.5 transition-colors"
                              title={selectState === 'all' ? '전체 해제' : '전체 선택'}
                            >
                              {selectState === 'all' ? (
                                <CheckSquare className="h-4 w-4 text-blue-500" />
                              ) : selectState === 'some' ? (
                                <MinusSquare className="h-4 w-4 text-blue-400" />
                              ) : (
                                <Square className="h-4 w-4 text-blue-300" />
                              )}
                            </button>
                          )}
                          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {major.majorOrder}.{sub.subOrder}
                            </span>
                            {sub.groupTitle}
                            {hasPendingTasks && (
                              <span className="text-xs text-muted-foreground">
                                ({pendingTaskIds.length}개)
                              </span>
                            )}
                          </h3>
                        </div>
                      )
                    })()}

                    {/* Tasks Table */}
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-10">
                              <span className="sr-only">선택</span>
                            </TableHead>
                            <TableHead className="w-10">
                              <span className="sr-only">완료</span>
                            </TableHead>
                            <TableHead className="w-16">#</TableHead>
                            <TableHead>태스크</TableHead>
                            <TableHead className="w-20 text-center">우선순위</TableHead>
                            <TableHead className="w-20 text-center">상태</TableHead>
                            <TableHead className="w-24 text-center">작업</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sub.tasks.map((task) => (
                            <TableRow
                              key={task.id}
                              className={cn(
                                task.status === 'done' && 'bg-muted/30',
                                selectedTaskIds.has(task.id) && 'bg-blue-50 dark:bg-blue-950/30'
                              )}
                            >
                              {/* 선택 체크박스 (파란색 계열) */}
                              <TableCell>
                                {task.status !== 'done' ? (
                                  <Checkbox
                                    checked={selectedTaskIds.has(task.id)}
                                    onCheckedChange={() => handleToggleSelect(task.id)}
                                    className="border-blue-400 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                                  />
                                ) : (
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
                              </TableCell>
                              {/* 완료 체크박스 (기본 초록색) */}
                              <TableCell>
                                <Checkbox
                                  checked={task.status === 'done'}
                                  onCheckedChange={() => handleToggleTask(task)}
                                  className="border-green-400 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                />
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {getTaskNumber(major, sub, task)}
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
                              <TableCell className="text-center">
                                <TooltipProvider>
                                  <div className="flex items-center justify-center gap-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          disabled={task.status === 'done'}
                                          onClick={() => setExecutingTask(task)}
                                        >
                                          <Play className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {task.status === 'done' ? '이미 완료됨' : 'Claude Code로 실행'}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => setHistoryTask(task)}
                                        >
                                          <History className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        실행 기록 보기
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TooltipProvider>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View More (if many tasks) */}
      {tasks.length > 10 && (
        <div className="text-center">
          <Button variant="ghost" size="sm">
            전체 보기 ({tasks.length}개)
          </Button>
        </div>
      )}

      {/* Task Execution Dialog */}
      {executingTask && (
        <TaskExecutionDialog
          open={!!executingTask}
          onOpenChange={(open) => !open && setExecutingTask(null)}
          changeId={changeId}
          taskId={
            // Convert displayId (e.g., "1.1") to task format (e.g., "task-1-1")
            executingTask.displayId
              ? `task-${executingTask.displayId.replace(/\./g, '-')}`
              : String(executingTask.id)
          }
          taskTitle={executingTask.title}
          onComplete={() => {
            // Refresh task status after completion
            updateTask.mutateAsync({ id: executingTask.id, status: 'done' })
          }}
        />
      )}

      {/* Execution History Dialog */}
      {historyTask && (
        <ExecutionHistoryDialog
          open={!!historyTask}
          onOpenChange={(open) => !open && setHistoryTask(null)}
          changeId={changeId}
          taskId={
            historyTask.displayId
              ? `task-${historyTask.displayId.replace(/\./g, '-')}`
              : String(historyTask.id)
          }
          taskTitle={historyTask.title}
        />
      )}

      {/* Multiple Tasks Execution Dialog */}
      {executingMultiple && selectedTasks.length > 0 && (
        <TaskExecutionDialog
          open={executingMultiple}
          onOpenChange={(open) => {
            if (!open) {
              setExecutingMultiple(false)
              setSelectedTaskIds(new Set()) // 선택 초기화
            }
          }}
          changeId={changeId}
          taskId={selectedTasks.map(t =>
            t.displayId
              ? `task-${t.displayId.replace(/\./g, '-')}`
              : String(t.id)
          ).join(',')}
          taskTitle={
            selectedTasks.length === 1
              ? selectedTasks[0].title
              : `선택된 ${selectedTasks.length}개 태스크`
          }
          onComplete={() => {
            // 완료된 태스크들 상태 업데이트
            selectedTasks.forEach(task => {
              updateTask.mutateAsync({ id: task.id, status: 'done' })
            })
          }}
        />
      )}
    </div>
  )
}

