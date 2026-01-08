/**
 * 실행 진행률 표시 컴포넌트
 */

import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  StopCircle,
  Circle,
} from 'lucide-react'
import type { SwarmStatusValue } from '@/types'

interface ProgressIndicatorProps {
  status: SwarmStatusValue
  progress: number
  startedAt: string
  completedAt?: string
  currentTask?: string
}

const STATUS_CONFIG: Record<SwarmStatusValue, {
  icon: typeof Clock
  color: string
  label: string
}> = {
  pending: { icon: Circle, color: 'text-zinc-400', label: '대기 중' },
  running: { icon: Loader2, color: 'text-blue-400', label: '실행 중' },
  completed: { icon: CheckCircle2, color: 'text-green-400', label: '완료' },
  failed: { icon: XCircle, color: 'text-red-400', label: '실패' },
  stopped: { icon: StopCircle, color: 'text-yellow-400', label: '중지됨' },
}

export function ProgressIndicator({
  status,
  progress,
  startedAt,
  completedAt,
  currentTask,
}: ProgressIndicatorProps) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  // 경과 시간 계산
  const getElapsedTime = () => {
    const start = new Date(startedAt).getTime()
    const end = completedAt ? new Date(completedAt).getTime() : Date.now()
    const elapsed = Math.floor((end - start) / 1000)

    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60

    if (minutes > 0) {
      return `${minutes}분 ${seconds}초`
    }
    return `${seconds}초`
  }

  return (
    <div className="space-y-3">
      {/* 상태 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              'h-5 w-5',
              config.color,
              status === 'running' && 'animate-spin'
            )}
          />
          <span className={cn('font-medium', config.color)}>
            {config.label}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Clock className="h-4 w-4" />
          <span>{getElapsedTime()}</span>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">진행률</span>
          <span className="font-mono text-zinc-300">{progress}%</span>
        </div>
        <Progress
          value={progress}
          className={cn(
            'h-2',
            status === 'failed' && '[&>div]:bg-red-500',
            status === 'stopped' && '[&>div]:bg-yellow-500',
            status === 'completed' && '[&>div]:bg-green-500'
          )}
        />
      </div>

      {/* 현재 태스크 */}
      {currentTask && status === 'running' && (
        <div className="text-sm">
          <span className="text-zinc-500">현재 작업: </span>
          <span className="text-zinc-300">{currentTask}</span>
        </div>
      )}
    </div>
  )
}
