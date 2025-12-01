import { cn } from '@/lib/utils'
import type { Stage, StageInfo } from '@/types'
import { STAGES, STAGE_CONFIG } from '@/constants/stages'
import { Check, Circle, CircleDot, ChevronRight } from 'lucide-react'

interface PipelineBarProps {
  stages?: Record<Stage, StageInfo>
  currentStage: Stage
  activeTab: Stage
  onTabChange: (stage: Stage) => void
}

function getStageStatus(stageInfo?: StageInfo): 'completed' | 'in-progress' | 'pending' {
  if (!stageInfo || stageInfo.total === 0) return 'pending'
  if (stageInfo.completed === stageInfo.total) return 'completed'
  if (stageInfo.completed > 0) return 'in-progress'
  return 'pending'
}

// 단계별 색상 매핑
const getStageColor = (stage: Stage, status: 'completed' | 'in-progress' | 'pending') => {
  const colorMap = {
    spec: {
      completed: 'bg-purple-500 text-white',
      inProgress: 'bg-purple-400 text-white',
      pending: 'bg-purple-100 text-purple-600'
    },
    changes: {
      completed: 'bg-indigo-500 text-white',
      inProgress: 'bg-indigo-400 text-white',
      pending: 'bg-indigo-100 text-indigo-600'
    },
    task: {
      completed: 'bg-blue-500 text-white',
      inProgress: 'bg-blue-400 text-white',
      pending: 'bg-blue-100 text-blue-600'
    },
    code: {
      completed: 'bg-green-500 text-white',
      inProgress: 'bg-green-400 text-white',
      pending: 'bg-green-100 text-green-600'
    },
    test: {
      completed: 'bg-orange-500 text-white',
      inProgress: 'bg-orange-400 text-white',
      pending: 'bg-orange-100 text-orange-600'
    },
    commit: {
      completed: 'bg-teal-500 text-white',
      inProgress: 'bg-teal-400 text-white',
      pending: 'bg-teal-100 text-teal-600'
    },
    docs: {
      completed: 'bg-gray-500 text-white',
      inProgress: 'bg-gray-400 text-white',
      pending: 'bg-gray-100 text-gray-600'
    }
  }
  
  return colorMap[stage][status === 'completed' ? 'completed' : status === 'in-progress' ? 'inProgress' : 'pending']
}

export function PipelineBar({ stages, currentStage, activeTab, onTabChange }: PipelineBarProps) {
  return (
    <div className="w-full overflow-x-auto">
      <div
        className="flex items-center justify-between gap-1 min-w-max px-1"
        role="tablist"
        aria-label="개발 파이프라인 단계"
      >
        {STAGES.map((stage, index) => {
          const stageInfo = stages?.[stage]
          const status = getStageStatus(stageInfo)
          const isActive = activeTab === stage
          const isCurrent = currentStage === stage
          const stageColor = getStageColor(stage, status)

          return (
            <div key={stage} className="flex items-center flex-1 min-w-0">
              {/* Stage Box */}
              <button
                onClick={() => onTabChange(stage)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg transition-all duration-200 relative group',
                  'hover:shadow-md hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1',
                  isActive && 'bg-background shadow-lg ring-2 ring-primary/30 scale-105 z-10',
                  isCurrent && !isActive && 'ring-2 ring-primary/20 bg-primary/5',
                  !isActive && !isCurrent && 'hover:bg-muted/50'
                )}
                role="tab"
                aria-selected={isActive}
                aria-label={`${STAGE_CONFIG[stage].label} 단계 ${status === 'completed' ? '완료' : status === 'in-progress' ? '진행 중' : '대기 중'}`}
                tabIndex={isActive ? 0 : -1}
              >
                {/* 현재 단계 표시기 */}
                {isCurrent && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-pulse" />
                )}

                {/* Status Icon */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200',
                    stageColor,
                    'group-hover:scale-110 shadow-sm'
                  )}
                >
                  {status === 'completed' ? (
                    <Check className="h-4 w-4" />
                  ) : status === 'in-progress' ? (
                    <CircleDot className="h-4 w-4 animate-pulse" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </div>

                {/* Icon & Label */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg" role="img" aria-hidden="true">
                    {STAGE_CONFIG[stage].icon}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-semibold whitespace-nowrap',
                      isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    {STAGE_CONFIG[stage].label}
                  </span>
                </div>

                {/* Progress Badge */}
                {stageInfo && stageInfo.total > 0 && (
                  <div className={cn(
                    'text-xs font-medium px-1.5 py-0.5 rounded-full',
                    status === 'completed' ? 'bg-green-100 text-green-700' :
                    status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  )}>
                    {stageInfo.completed}/{stageInfo.total}
                  </div>
                )}

                {/* 활성 탭 하단 표시기 */}
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-primary rounded-full" />
                )}
              </button>

              {/* Arrow Connector (except last) */}
              {index < STAGES.length - 1 && (
                <div className="flex items-center justify-center px-1">
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
