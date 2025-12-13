/**
 * Task Runner Tab
 *
 * Post-Task 작업 실행 탭
 */

import { useState, useMemo } from 'react'
import { Play, Loader2, Check, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  usePostTaskCategories,
  useRunPostTask,
  type TaskCategory,
  type PostTaskRunResult,
} from '@/hooks/usePostTask'

interface TaskRunnerTabProps {
  projectPath: string
}

export function TaskRunnerTab({ projectPath }: TaskRunnerTabProps) {
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [cli, setCli] = useState<'claude' | 'gemini' | 'qwen' | 'openai'>('claude')
  const [model, setModel] = useState<'fast' | 'balanced' | 'powerful'>('balanced')
  const [dryRun, setDryRun] = useState(false)
  const [noCommit, setNoCommit] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['code-quality']))
  const [result, setResult] = useState<PostTaskRunResult | null>(null)

  const { data: categories, isLoading: isCategoriesLoading } = usePostTaskCategories()
  const runTask = useRunPostTask()

  // 선택된 작업 개수
  const selectedCount = selectedTasks.size

  // 카테고리별 선택 상태
  const categorySelectionState = useMemo(() => {
    const state: Record<string, 'none' | 'some' | 'all'> = {}
    categories?.forEach((cat) => {
      const taskIds = cat.tasks.map((t) => t.id)
      const selectedInCategory = taskIds.filter((id) => selectedTasks.has(id)).length
      if (selectedInCategory === 0) {
        state[cat.id] = 'none'
      } else if (selectedInCategory === taskIds.length) {
        state[cat.id] = 'all'
      } else {
        state[cat.id] = 'some'
      }
    })
    return state
  }, [categories, selectedTasks])

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const toggleTask = (taskId: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const toggleAllInCategory = (category: TaskCategory) => {
    const taskIds = category.tasks.map((t) => t.id)
    const allSelected = taskIds.every((id) => selectedTasks.has(id))

    setSelectedTasks((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        taskIds.forEach((id) => next.delete(id))
      } else {
        taskIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const selectAll = () => {
    const allTaskIds = categories?.flatMap((cat) => cat.tasks.map((t) => t.id)) ?? []
    setSelectedTasks(new Set(allTaskIds))
  }

  const clearSelection = () => {
    setSelectedTasks(new Set())
  }

  const handleRun = async () => {
    if (selectedCount === 0) {
      toast.error('실행할 작업을 선택하세요')
      return
    }

    try {
      const taskResult = await runTask.mutateAsync({
        projectPath,
        tasks: Array.from(selectedTasks),
        cli,
        model,
        dryRun,
        noCommit,
      })

      setResult(taskResult)

      if (taskResult.success) {
        toast.success(`${taskResult.tasksSucceeded}/${taskResult.tasksRun}개 작업 성공`)
      } else {
        toast.warning(`${taskResult.tasksFailed}개 작업 실패`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '실행 실패')
    }
  }

  if (isCategoriesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* 작업 선택 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>작업 선택</CardTitle>
              <CardDescription>실행할 Post-Task 작업을 선택하세요</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                전체 선택
              </Button>
              <Button variant="outline" size="sm" onClick={clearSelection}>
                선택 해제
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories?.map((category) => (
            <Collapsible
              key={category.id}
              open={expandedCategories.has(category.id)}
              onOpenChange={() => toggleCategory(category.id)}
            >
              <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                <Checkbox
                  id={`cat-${category.id}`}
                  checked={categorySelectionState[category.id] === 'all'}
                  // @ts-expect-error indeterminate is valid but not typed
                  indeterminate={categorySelectionState[category.id] === 'some'}
                  onCheckedChange={() => toggleAllInCategory(category)}
                />
                <Label
                  htmlFor={`cat-${category.id}`}
                  className="flex-1 cursor-pointer font-medium"
                >
                  {category.label}
                </Label>
                <Badge variant="secondary" className="text-xs">
                  {category.tasks.filter((t) => selectedTasks.has(t.id)).length}/{category.tasks.length}
                </Badge>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform',
                        expandedCategories.has(category.id) && 'rotate-180'
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="ml-6 pl-4 border-l space-y-2 py-2">
                  {category.tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2">
                      <Checkbox
                        id={task.id}
                        checked={selectedTasks.has(task.id)}
                        onCheckedChange={() => toggleTask(task.id)}
                      />
                      <Label htmlFor={task.id} className="cursor-pointer text-sm">
                        {task.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      {/* 실행 설정 & 결과 */}
      <div className="space-y-6">
        {/* 설정 */}
        <Card>
          <CardHeader>
            <CardTitle>실행 설정</CardTitle>
            <CardDescription>CLI 및 모델 설정</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>CLI</Label>
                <Select value={cli} onValueChange={(v) => setCli(v as typeof cli)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude">Claude Code</SelectItem>
                    <SelectItem value="gemini">Gemini CLI</SelectItem>
                    <SelectItem value="qwen">Qwen CLI</SelectItem>
                    <SelectItem value="openai">OpenAI CLI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>모델 티어</Label>
                <Select value={model} onValueChange={(v) => setModel(v as typeof model)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">Fast (빠른 응답)</SelectItem>
                    <SelectItem value="balanced">Balanced (균형)</SelectItem>
                    <SelectItem value="powerful">Powerful (고성능)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>드라이런 모드</Label>
                <p className="text-xs text-muted-foreground">실제 변경 없이 분석만 수행</p>
              </div>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>자동 커밋 비활성화</Label>
                <p className="text-xs text-muted-foreground">변경사항 자동 커밋 안 함</p>
              </div>
              <Switch checked={noCommit} onCheckedChange={setNoCommit} />
            </div>

            <Button
              onClick={handleRun}
              disabled={selectedCount === 0 || runTask.isPending}
              className="w-full"
            >
              {runTask.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  실행 중...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  {selectedCount}개 작업 실행
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 결과 */}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.success ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <X className="h-5 w-5 text-red-500" />
                )}
                실행 결과
              </CardTitle>
              <CardDescription>
                {result.tasksRun}개 작업 중 {result.tasksSucceeded}개 성공, {result.tasksFailed}개 실패
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {result.summary.map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-lg',
                      item.success ? 'bg-green-500/10' : 'bg-red-500/10'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.success ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm font-medium">{item.task}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.issuesFound > 0 && (
                        <span>발견: {item.issuesFound}</span>
                      )}
                      {item.issuesFixed > 0 && (
                        <span className="ml-2">수정: {item.issuesFixed}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {result.reportPath && (
                <p className="mt-4 text-xs text-muted-foreground">
                  리포트: {result.reportPath}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
