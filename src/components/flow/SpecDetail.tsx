import { Loader2, Calendar, Clock } from 'lucide-react'
import { useFlowChangeDetail } from '@/hooks/useFlowChanges'
import { SpecProgressBar } from './SpecProgressBar'
import { SpecDetailTabs } from './SpecDetailTabs'
import { Badge } from '@/components/ui/badge'
import { formatRelativeDate, formatDateTime } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { MoaiSpec, MoaiSpecProgress } from '@/types/flow'

interface SpecDetailProps {
  projectId: string
  specId: string
}

export function SpecDetail({ projectId, specId }: SpecDetailProps) {
  const { data, isLoading, error } = useFlowChangeDetail(specId, projectId)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>SPEC 로딩 중...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-destructive">
        <p>SPEC을 불러올 수 없습니다</p>
        {error && <p className="text-sm mt-1">{error.message}</p>}
      </div>
    )
  }

  // The API returns the change data
  const change = data.change

  // Build progress object - use plan.progress if available, fallback to change fields
  const planProgress = (change as { plan?: { progress?: { completed?: number; total?: number; percentage?: number } } }).plan?.progress
  const progress: MoaiSpecProgress = {
    completed: planProgress?.completed ?? 0,
    total: planProgress?.total ?? 0,
    percentage: planProgress?.percentage ?? change.progress ?? 0,
  }

  // Build MoaiSpec object for SpecDetailTabs
  const moaiSpec: MoaiSpec = {
    type: 'spec',
    id: change.id,
    title: change.title,
    status: change.status as 'active' | 'completed' | 'archived',
    progress,
    spec: {
      content: (change as { spec?: { content?: string } }).spec?.content ?? '',
      requirements: [],
    },
    plan: {
      content: (change as { plan?: { content?: string } }).plan?.content ?? '',
      tags: [],
      progress,
    },
    acceptance: {
      content: (change as { acceptance?: { content?: string } }).acceptance?.content ?? '',
      criteria: [],
    },
    createdAt: change.createdAt,
    updatedAt: change.updatedAt,
  }

  const statusColors = {
    active: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
    archived: 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200',
  }

  const statusLabels = {
    active: '진행 중',
    completed: '완료',
    archived: '아카이브',
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 px-2 py-1 rounded text-xs font-semibold">
              SPEC
            </span>
            <h1 className="text-2xl font-bold">{change.title}</h1>
          </div>
          <Badge className={statusColors[change.status as keyof typeof statusColors]}>
            {statusLabels[change.status as keyof typeof statusLabels] ?? change.status}
          </Badge>
        </div>

        {/* Progress */}
        <SpecProgressBar progress={progress} label="TAG 진행률" />

        {/* Metadata */}
        <TooltipProvider>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-default">
                  <Calendar className="h-3 w-3" />
                  생성: {formatRelativeDate(change.createdAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatDateTime(change.createdAt)}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-default">
                  <Clock className="h-3 w-3" />
                  수정: {formatRelativeDate(change.updatedAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatDateTime(change.updatedAt)}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Spec Detail Tabs */}
      <div className="border rounded-lg p-4">
        <SpecDetailTabs spec={moaiSpec} />
      </div>
    </div>
  )
}
