/**
 * Recommendation Banner Component
 *
 * 자동 추천 배너 UI
 */

import { Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getTaskTypeInfo, type TaskRecommendation } from '@/utils/task-routing'

export interface RecommendationBannerProps {
  recommendation: TaskRecommendation
  taskTitle: string
  onApply: () => void
  onHide: () => void
}

export function RecommendationBanner({
  recommendation,
  taskTitle,
  onApply,
  onHide,
}: RecommendationBannerProps) {
  const taskTypeInfo = getTaskTypeInfo(taskTitle)

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-2">
      <div className="flex items-start gap-2">
        <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
              자동 추천 ({taskTypeInfo.emoji} {taskTypeInfo.label})
            </span>
            <button
              onClick={onHide}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 text-xs"
            >
              숨기기
            </button>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            {recommendation.reason}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs border-amber-300 dark:border-amber-700">
              {recommendation.mode === 'single' ? '단일 실행' : 'Swarm 실행'}
            </Badge>
            <Badge variant="outline" className="text-xs border-amber-300 dark:border-amber-700">
              {recommendation.provider} / {recommendation.model || 'default'}
            </Badge>
            {recommendation.strategy && (
              <Badge variant="outline" className="text-xs border-amber-300 dark:border-amber-700">
                {recommendation.strategy}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={onApply}
              className="ml-auto h-6 text-xs border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900"
            >
              적용
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
