import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useFlowChangeDetail } from '@/hooks/useFlowChanges'
import { PipelineBar } from './PipelineBar'
import { StageContent } from './StageContent'
import { Progress } from '@/components/ui/progress'
import type { Stage } from '@/types'

interface ChangeDetailProps {
  projectId: string
  changeId: string
}

export function ChangeDetail({ changeId }: ChangeDetailProps) {
  const [activeTab, setActiveTab] = useState<Stage>('task')
  const { data, isLoading, error } = useFlowChangeDetail(changeId)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>로딩 중...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-destructive">
        <p>Change를 불러올 수 없습니다</p>
        {error && <p className="text-sm mt-1">{error.message}</p>}
      </div>
    )
  }

  const { change, stages } = data

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{change.title}</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">진행률</span>
            <span className="font-medium">{change.progress}%</span>
          </div>
          <Progress value={change.progress} className="w-32" />
        </div>
      </div>

      {/* Pipeline Bar */}
      <PipelineBar
        stages={stages}
        currentStage={change.currentStage}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Stage Content */}
      <div className="border rounded-lg p-4">
        <StageContent
          changeId={changeId}
          stage={activeTab}
          tasks={stages[activeTab]?.tasks ?? []}
          specPath={change.specPath}
        />
      </div>
    </div>
  )
}
