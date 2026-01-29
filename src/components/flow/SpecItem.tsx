import { ChevronRight, ChevronDown, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SpecProgressBar } from './SpecProgressBar'
import { SpecDetailTabs } from './SpecDetailTabs'
import { formatRelativeDate } from '@/lib/utils'
import type { MoaiSpec } from '@/types/flow'

interface SpecItemProps {
  spec: MoaiSpec
  isExpanded: boolean
  onToggle: () => void
}

export function SpecItem({ spec, isExpanded, onToggle }: SpecItemProps) {
  const statusColors = {
    active: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
    archived: 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200',
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Collapsed / Header */}
      <div className="flex items-center">
        <button
          className="flex-1 flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
          onClick={onToggle}
        >
          {/* Toggle Icon */}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          {/* SPEC ID Badge */}
          <span className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 px-2 py-1 rounded text-xs font-semibold shrink-0">
            SPEC
          </span>

          {/* Title */}
          <span className="font-medium truncate flex-1">{spec.title}</span>

          {/* Created Date */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Calendar className="h-3 w-3" />
                {formatRelativeDate(spec.createdAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              생성일: {spec.createdAt ? new Date(spec.createdAt).toLocaleString('ko-KR') : '-'}
            </TooltipContent>
          </Tooltip>

          {/* Status Badge */}
          <Badge className={`shrink-0 ${statusColors[spec.status]}`}>
            {spec.status === 'active' ? '진행 중' : spec.status === 'completed' ? '완료' : '보관'}
          </Badge>

          {/* Progress Indicator */}
          <div className="w-24 shrink-0 flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              {spec.progress.completed}/{spec.progress.total}
            </span>
          </div>
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t space-y-4 p-4 bg-muted/10">
          {/* Progress Bar */}
          <SpecProgressBar progress={spec.progress} label="TAGs 진행률" />

          {/* Detail Tabs */}
          <SpecDetailTabs spec={spec} />

          {/* Metadata Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
            <span>생성: {new Date(spec.createdAt).toLocaleDateString('ko-KR')}</span>
            <span>수정: {new Date(spec.updatedAt).toLocaleDateString('ko-KR')}</span>
            {spec.archivedAt && (
              <span>보관: {new Date(spec.archivedAt).toLocaleDateString('ko-KR')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
