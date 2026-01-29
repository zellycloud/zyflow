import { cn } from '@/lib/utils'
import type { MoaiSpecProgress } from '@/types/flow'

interface SpecProgressBarProps {
  progress: MoaiSpecProgress
  label?: string
}

export function SpecProgressBar({ progress, label }: SpecProgressBarProps) {
  const { completed, total, percentage } = progress
  const isComplete = completed === total && total > 0

  return (
    <div className="w-full space-y-2">
      {/* Label and Progress Text */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {label || 'Progress'}
        </span>
        <span className={cn(
          'text-sm font-semibold',
          isComplete ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
        )}>
          {completed}/{total}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 rounded-full overflow-hidden bg-muted/50 border border-muted">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out',
            isComplete
              ? 'bg-gradient-to-r from-green-500 to-green-600'
              : 'bg-gradient-to-r from-blue-500 to-blue-600'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Percentage Text */}
      <div className="text-xs text-muted-foreground text-right">
        {percentage.toFixed(1)}%
      </div>
    </div>
  )
}
