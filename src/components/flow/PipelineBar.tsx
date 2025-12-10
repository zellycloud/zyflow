import { cn } from '@/lib/utils'
import type { Stage, StageInfo } from '@/types'
import { STAGES, STAGE_CONFIG } from '@/constants/stages'
import { Check, Loader2 } from 'lucide-react'

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

// Stage gradient colors for visual distinction
const STAGE_GRADIENTS: Record<Stage, { bg: string; active: string; border: string }> = {
  spec: {
    bg: 'from-violet-500/10 to-purple-500/10',
    active: 'from-violet-500 to-purple-600',
    border: 'border-violet-400/50'
  },
  changes: {
    bg: 'from-indigo-500/10 to-blue-500/10',
    active: 'from-indigo-500 to-blue-600',
    border: 'border-indigo-400/50'
  },
  task: {
    bg: 'from-sky-500/10 to-cyan-500/10',
    active: 'from-sky-500 to-cyan-600',
    border: 'border-sky-400/50'
  },
  code: {
    bg: 'from-emerald-500/10 to-green-500/10',
    active: 'from-emerald-500 to-green-600',
    border: 'border-emerald-400/50'
  },
  test: {
    bg: 'from-amber-500/10 to-orange-500/10',
    active: 'from-amber-500 to-orange-600',
    border: 'border-amber-400/50'
  },
  commit: {
    bg: 'from-teal-500/10 to-cyan-500/10',
    active: 'from-teal-500 to-cyan-600',
    border: 'border-teal-400/50'
  },
  docs: {
    bg: 'from-slate-500/10 to-gray-500/10',
    active: 'from-slate-500 to-gray-600',
    border: 'border-slate-400/50'
  }
}

export function PipelineBar({ stages, currentStage, activeTab, onTabChange }: PipelineBarProps) {
  return (
    <div className="w-full">
      {/* Pipeline Container */}
      <div className="relative bg-gradient-to-r from-muted/30 via-muted/50 to-muted/30 rounded-2xl p-1.5 shadow-inner">
        {/* Progress Line (background) */}
        <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-border/50 -translate-y-1/2 rounded-full" />

        {/* Stages Grid */}
        <div
          className="relative grid grid-cols-7 gap-1"
          role="tablist"
          aria-label="Development pipeline stages"
        >
          {STAGES.map((stage, index) => {
            const stageInfo = stages?.[stage]
            const status = getStageStatus(stageInfo)
            const isActive = activeTab === stage
            const isCurrent = currentStage === stage
            const gradient = STAGE_GRADIENTS[stage]
            const progress = stageInfo ? (stageInfo.total > 0 ? (stageInfo.completed / stageInfo.total) * 100 : 0) : 0
            const IconComponent = STAGE_CONFIG[stage].icon

            return (
              <button
                key={stage}
                onClick={() => onTabChange(stage)}
                className={cn(
                  'relative flex flex-col items-center gap-2 py-3 px-1 rounded-xl transition-all duration-300',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'group',
                  isActive && 'bg-background shadow-lg scale-[1.02] z-10',
                  !isActive && 'hover:bg-background/60 hover:shadow-md'
                )}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
              >
                {/* Current Stage Indicator */}
                {isCurrent && (
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 flex items-center gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                  </div>
                )}

                {/* Icon Circle with Progress Ring */}
                <div className="relative">
                  {/* Progress Ring */}
                  <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
                    {/* Background circle */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      className="stroke-muted"
                      strokeWidth="2.5"
                    />
                    {/* Progress circle */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      className={cn(
                        'transition-all duration-500',
                        status === 'completed' ? 'stroke-green-500' :
                        status === 'in-progress' ? 'stroke-blue-500' :
                        'stroke-transparent'
                      )}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${progress * 0.94} 100`}
                    />
                  </svg>

                  {/* Icon Container */}
                  <div
                    className={cn(
                      'absolute inset-1.5 rounded-full flex items-center justify-center transition-all duration-300',
                      status === 'completed' && `bg-gradient-to-br ${gradient.active} text-white shadow-md`,
                      status === 'in-progress' && `bg-gradient-to-br ${gradient.bg} ${gradient.border} border-2`,
                      status === 'pending' && 'bg-muted/80 text-muted-foreground',
                      isActive && status === 'pending' && `bg-gradient-to-br ${gradient.bg}`,
                      'group-hover:scale-110 group-hover:shadow-md'
                    )}
                  >
                    {status === 'completed' ? (
                      <Check className="h-4 w-4" strokeWidth={3} />
                    ) : status === 'in-progress' ? (
                      <span className="relative">
                        <IconComponent className="h-4 w-4" />
                        <Loader2 className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-spin text-blue-500" />
                      </span>
                    ) : (
                      <IconComponent className="h-4 w-4" />
                    )}
                  </div>
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'text-[11px] font-semibold tracking-tight transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                >
                  {STAGE_CONFIG[stage].label}
                </span>

                {/* Progress Count Badge */}
                {stageInfo && stageInfo.total > 0 && (
                  <div
                    className={cn(
                      'absolute -bottom-1 left-1/2 -translate-x-1/2',
                      'px-1.5 py-0.5 rounded-full text-[9px] font-bold',
                      'transition-all duration-300',
                      status === 'completed' && 'bg-green-500 text-white',
                      status === 'in-progress' && 'bg-blue-500 text-white',
                      status === 'pending' && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {stageInfo.completed}/{stageInfo.total}
                  </div>
                )}

                {/* Active Indicator */}
                {isActive && (
                  <div
                    className={cn(
                      'absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full',
                      `bg-gradient-to-r ${gradient.active}`
                    )}
                  />
                )}

                {/* Connector Line */}
                {index < STAGES.length - 1 && (
                  <div
                    className={cn(
                      'absolute top-1/2 -right-1 w-2 h-0.5 -translate-y-1/2 rounded-full transition-colors',
                      status === 'completed' ? 'bg-green-400' : 'bg-border'
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
