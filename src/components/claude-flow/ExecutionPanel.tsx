/**
 * claude-flow 실행 패널 컴포넌트
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Play,
  Square,
  Settings2,
  ChevronDown,
  Zap,
  Search,
  ListTodo,
  RotateCcw,
} from 'lucide-react'
import { useClaudeFlowExecution } from '@/hooks/useClaudeFlowExecution'
import { LogViewer } from './LogViewer'
import { ProgressIndicator } from './ProgressIndicator'
import type { ClaudeFlowExecutionMode, ClaudeFlowStrategy } from '@/types'

interface ExecutionPanelProps {
  changeId: string
  projectPath: string
  taskId?: string
}

const MODE_OPTIONS: { value: ClaudeFlowExecutionMode; label: string; icon: typeof Zap; description: string }[] = [
  {
    value: 'full',
    label: '전체 실행',
    icon: Zap,
    description: '모든 미완료 태스크 처리',
  },
  {
    value: 'single',
    label: '단일 태스크',
    icon: ListTodo,
    description: '선택한 태스크만 처리',
  },
  {
    value: 'analysis',
    label: '분석 모드',
    icon: Search,
    description: '코드 변경 없이 분석만',
  },
]

const STRATEGY_OPTIONS: { value: ClaudeFlowStrategy; label: string }[] = [
  { value: 'development', label: '개발' },
  { value: 'research', label: '연구' },
  { value: 'testing', label: '테스트' },
]

export function ExecutionPanel({
  changeId,
  projectPath,
  taskId,
}: ExecutionPanelProps) {
  const [mode, setMode] = useState<ClaudeFlowExecutionMode>('full')
  const [strategy, setStrategy] = useState<ClaudeFlowStrategy>('development')
  const [maxAgents, setMaxAgents] = useState(5)
  const [showSettings, setShowSettings] = useState(false)

  const {
    status,
    logs,
    isRunning,
    error,
    execute,
    stop,
    clearLogs,
  } = useClaudeFlowExecution()

  const handleExecute = async () => {
    await execute({
      projectPath,
      changeId,
      taskId: mode === 'single' ? taskId : undefined,
      mode,
      strategy,
      maxAgents,
    })
  }

  const handleStop = async () => {
    await stop()
  }

  const selectedMode = MODE_OPTIONS.find(m => m.value === mode)

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Claude Flow 실행
          </CardTitle>
          {status && (
            <Badge
              variant={
                status.status === 'running' ? 'default' :
                status.status === 'completed' ? 'secondary' :
                status.status === 'failed' ? 'destructive' : 'outline'
              }
            >
              {status.status}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 실행 중이 아닐 때: 설정 UI */}
        {!isRunning && !status && (
          <>
            {/* 모드 선택 */}
            <div className="grid grid-cols-3 gap-2">
              {MODE_OPTIONS.map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.value}
                    onClick={() => setMode(option.value)}
                    className={`
                      p-3 rounded-lg border text-left transition-colors
                      ${mode === option.value
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/50'
                      }
                    `}
                  >
                    <Icon className={`h-5 w-5 mb-1 ${mode === option.value ? 'text-blue-400' : 'text-zinc-400'}`} />
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-xs text-zinc-500">{option.description}</div>
                  </button>
                )
              })}
            </div>

            {/* 고급 설정 */}
            <Collapsible open={showSettings} onOpenChange={setShowSettings}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    고급 설정
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                {/* 전략 선택 */}
                <div className="flex items-center justify-between">
                  <label className="text-sm text-zinc-400">전략</label>
                  <Select value={strategy} onValueChange={(v) => setStrategy(v as ClaudeFlowStrategy)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STRATEGY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 최대 에이전트 수 */}
                <div className="flex items-center justify-between">
                  <label className="text-sm text-zinc-400">최대 에이전트</label>
                  <Select value={String(maxAgents)} onValueChange={(v) => setMaxAgents(Number(v))}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[3, 5, 7, 10].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}개
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* 실행 버튼 */}
            <Button
              onClick={handleExecute}
              className="w-full"
              size="lg"
            >
              <Play className="h-5 w-5 mr-2" />
              {selectedMode?.label} 시작
            </Button>
          </>
        )}

        {/* 실행 중: 진행 상태 */}
        {status && (
          <>
            <ProgressIndicator
              status={status.status}
              progress={status.progress}
              startedAt={status.startedAt}
              completedAt={status.completedAt}
              currentTask={status.currentTask}
            />

            {/* 중지 버튼 (실행 중일 때만) */}
            {isRunning && (
              <Button
                onClick={handleStop}
                variant="destructive"
                className="w-full"
              >
                <Square className="h-4 w-4 mr-2" />
                실행 중지
              </Button>
            )}

            {/* 완료/실패 후 버튼들 */}
            {!isRunning && (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    clearLogs()
                    handleExecute()
                  }}
                  className="flex-1"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  다시 실행
                </Button>
                <Button
                  onClick={() => {
                    clearLogs()
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  새 실행 준비
                </Button>
              </div>
            )}
          </>
        )}

        {/* 에러 표시 */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 로그 뷰어 */}
        {logs.length > 0 && (
          <LogViewer
            logs={logs}
            onClear={clearLogs}
            maxHeight="300px"
          />
        )}
      </CardContent>
    </Card>
  )
}
