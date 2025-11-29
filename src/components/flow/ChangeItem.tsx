import { ChevronRight, ChevronDown } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { PipelineBar } from './PipelineBar'
import { StageContent } from './StageContent'
import { useState } from 'react'
import type { FlowChange, Stage } from '@/types'
import { STAGE_CONFIG } from '@/constants/stages'

interface ChangeItemProps {
  change: FlowChange
  isExpanded: boolean
  onToggle: () => void
}

export function ChangeItem({ change, isExpanded, onToggle }: ChangeItemProps) {
  const [activeTab, setActiveTab] = useState<Stage>(change.currentStage)

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Collapsed / Header */}
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
        onClick={onToggle}
      >
        {/* Toggle Icon */}
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        {/* Title */}
        <span className="font-medium truncate flex-1">{change.title}</span>

        {/* Current Stage Badge */}
        <Badge variant="outline" className="shrink-0">
          {STAGE_CONFIG[change.currentStage].icon} {STAGE_CONFIG[change.currentStage].label}
        </Badge>

        {/* Progress */}
        <div className="w-24 shrink-0 flex items-center gap-2">
          <Progress value={change.progress} className="h-2" />
          <span className="text-xs text-muted-foreground w-8">{change.progress}%</span>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t">
          {/* Pipeline Bar */}
          <div className="p-4 bg-muted/30">
            <PipelineBar
              stages={change.stages}
              currentStage={change.currentStage}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>

          {/* Stage Content */}
          <div className="p-4">
            <StageContent
              changeId={change.id}
              stage={activeTab}
              tasks={change.stages?.[activeTab]?.tasks ?? []}
              specPath={change.specPath}
            />
          </div>
        </div>
      )}
    </div>
  )
}
