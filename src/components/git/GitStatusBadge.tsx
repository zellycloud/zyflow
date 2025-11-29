/**
 * Git 상태 뱃지 컴포넌트
 * 헤더나 사이드바에서 현재 Git 상태를 간략하게 표시
 */

import { GitBranch, ArrowUp, ArrowDown, AlertCircle, Cloud, CloudOff } from 'lucide-react'
import { useGitStatus } from '@/hooks/useGit'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface GitStatusBadgeProps {
  className?: string
  showBranch?: boolean
  showDetails?: boolean
}

export function GitStatusBadge({
  className,
  showBranch = true,
  showDetails = true,
}: GitStatusBadgeProps) {
  const { data: status, isLoading, error } = useGitStatus()

  if (isLoading) {
    return (
      <Badge variant="outline" className={cn('gap-1.5', className)}>
        <GitBranch className="size-3 animate-pulse" />
        <span className="text-muted-foreground">...</span>
      </Badge>
    )
  }

  if (error || !status) {
    return (
      <Badge variant="outline" className={cn('gap-1.5', className)}>
        <CloudOff className="size-3 text-muted-foreground" />
        <span className="text-muted-foreground">Not available</span>
      </Badge>
    )
  }

  if (!status.isGitRepo) {
    return (
      <Badge variant="outline" className={cn('gap-1.5 text-muted-foreground', className)}>
        <CloudOff className="size-3" />
        <span>Not a Git repo</span>
      </Badge>
    )
  }

  // 상태에 따른 색상 결정
  const hasConflicts = status.hasConflicts
  const hasUncommitted = status.isDirty
  const needsPull = status.behind > 0
  const needsPush = status.ahead > 0

  const getVariant = () => {
    if (hasConflicts) return 'destructive'
    if (hasUncommitted || needsPush) return 'secondary'
    return 'outline'
  }

  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-medium">{status.branch}</div>
      {status.upstream && (
        <div className="text-muted-foreground">Tracking: {status.upstream}</div>
      )}
      <div className="flex gap-2 pt-1">
        {status.ahead > 0 && (
          <span className="flex items-center gap-1 text-green-500">
            <ArrowUp className="size-3" />
            {status.ahead} ahead
          </span>
        )}
        {status.behind > 0 && (
          <span className="flex items-center gap-1 text-orange-500">
            <ArrowDown className="size-3" />
            {status.behind} behind
          </span>
        )}
      </div>
      {status.isDirty && (
        <div className="pt-1 text-muted-foreground">
          {status.staged.length > 0 && <div>{status.staged.length} staged</div>}
          {status.modified.length > 0 && <div>{status.modified.length} modified</div>}
          {status.untracked.length > 0 && <div>{status.untracked.length} untracked</div>}
        </div>
      )}
      {status.hasConflicts && (
        <div className="text-destructive pt-1">
          {status.conflictFiles.length} conflict(s)
        </div>
      )}
    </div>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={getVariant()} className={cn('gap-1.5 cursor-default', className)}>
            {hasConflicts ? (
              <AlertCircle className="size-3" />
            ) : status.upstream ? (
              <Cloud className="size-3" />
            ) : (
              <GitBranch className="size-3" />
            )}

            {showBranch && (
              <span className="max-w-[100px] truncate">{status.branch}</span>
            )}

            {showDetails && (
              <div className="flex items-center gap-0.5">
                {needsPush && (
                  <span className="flex items-center text-green-500">
                    <ArrowUp className="size-3" />
                    {status.ahead}
                  </span>
                )}
                {needsPull && (
                  <span className="flex items-center text-orange-500">
                    <ArrowDown className="size-3" />
                    {status.behind}
                  </span>
                )}
                {hasUncommitted && !needsPush && !needsPull && (
                  <span className="text-muted-foreground">*</span>
                )}
              </div>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
