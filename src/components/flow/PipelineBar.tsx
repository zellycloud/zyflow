import { cn } from '@/lib/utils'
import type { Stage, StageInfo } from '@/types'
import { STAGES, STAGE_CONFIG } from '@/constants/stages'
import { Check, Circle, CircleDot, ArrowRight } from 'lucide-react'

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

export function PipelineBar({ stages, currentStage, activeTab, onTabChange }: PipelineBarProps) {
  return (
    <div className="flex items-center justify-between gap-1">
      {STAGES.map((stage, index) => {
        const stageInfo = stages?.[stage]
        const status = getStageStatus(stageInfo)
        const isActive = activeTab === stage
        const isCurrent = currentStage === stage

        return (
          <div key={stage} className="flex items-center flex-1">
            {/* Stage Box */}
            <button
              onClick={() => onTabChange(stage)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-all',
                'hover:bg-background/80',
                isActive && 'bg-background shadow-sm ring-1 ring-border',
                isCurrent && !isActive && 'ring-1 ring-primary/30'
              )}
            >
              {/* Status Icon */}
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs',
                  status === 'completed' && 'bg-green-500 text-white',
                  status === 'in-progress' && 'bg-blue-500 text-white',
                  status === 'pending' && 'bg-muted text-muted-foreground'
                )}
              >
                {status === 'completed' ? (
                  <Check className="h-3 w-3" />
                ) : status === 'in-progress' ? (
                  <CircleDot className="h-3 w-3" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {STAGE_CONFIG[stage].label}
              </span>

              {/* Count */}
              {stageInfo && stageInfo.total > 0 && (
                <span className="text-xs text-muted-foreground">
                  {stageInfo.completed}/{stageInfo.total}
                </span>
              )}
            </button>

            {/* Arrow (except last) */}
            {index < STAGES.length - 1 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mx-1" />
            )}
          </div>
        )
      })}
    </div>
  )
}
