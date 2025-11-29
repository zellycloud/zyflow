import { FileText, Plus, Loader2 } from 'lucide-react'
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
import { useUpdateFlowTask, useProposalContent, useDesignContent, useChangeSpec } from '@/hooks/useFlowChanges'
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

  for (const task of tasks) {
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

  // 넘버링 형식 결정 함수
  const getTaskNumber = (major: MajorSection, sub: SubSection, taskIdx: number) => {
    if (showMajorHeaders && showSubHeaders) {
      // 3단계: 1.1.1, 1.1.2, ...
      return `${major.majorOrder}.${sub.subOrder}.${taskIdx + 1}`
    } else if (showMajorHeaders || showSubHeaders) {
      // 2단계: 1.1, 1.2, ...
      return `${major.majorOrder}.${taskIdx + 1}`
    } else {
      // 1단계: 1, 2, 3, ...
      return `${taskIdx + 1}`
    }
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
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          추가
        </Button>
      </div>

      {/* Task Content */}
      {tasks.length === 0 ? (
        <div className="p-4 rounded-lg border text-muted-foreground text-center text-sm">
          {stage} 단계에 태스크가 없습니다
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
                    {/* Sub Section Header (### 1.1 소제목) */}
                    {showSubHeaders && (
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {major.majorOrder}.{sub.subOrder}
                        </span>
                        {sub.groupTitle}
                      </h3>
                    )}

                    {/* Tasks Table */}
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-10"></TableHead>
                            <TableHead className="w-16">#</TableHead>
                            <TableHead>태스크</TableHead>
                            <TableHead className="w-20 text-center">우선순위</TableHead>
                            <TableHead className="w-20 text-center">상태</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sub.tasks.map((task, taskIdx) => (
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
                                {getTaskNumber(major, sub, taskIdx)}
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
    </div>
  )
}

