import { useState } from 'react'
import { Loader2, FileText, Copy, Check } from 'lucide-react'
import { useFlowChangeDetail } from '@/hooks/useFlowChanges'
import { useProjectsAllData } from '@/hooks/useProjects'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { PipelineBar } from './PipelineBar'
import { StageContent } from './StageContent'
import { Progress } from '@/components/ui/progress'
import type { Stage } from '@/types'

interface ChangeDetailProps {
  projectId: string
  changeId: string
}

export function ChangeDetail({ projectId, changeId }: ChangeDetailProps) {
  const [activeTab, setActiveTab] = useState<Stage>('task')
  const [copied, setCopied] = useState(false)
  const { data, isLoading, error } = useFlowChangeDetail(changeId)
  const { data: projectsData } = useProjectsAllData()

  // 현재 프로젝트의 tasks.md 경로
  const currentProject = projectsData?.projects.find(
    p => p.id === projectId || p.id === projectsData?.activeProjectId
  )
  const tasksFilePath = currentProject
    ? `${currentProject.path}/openspec/changes/${changeId}/tasks.md`
    : null

  const handleCopyPath = async () => {
    if (!tasksFilePath) return
    try {
      await navigator.clipboard.writeText(tasksFilePath)
      setCopied(true)
      toast.success('경로가 복사되었습니다')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('복사에 실패했습니다')
    }
  }

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
        {/* tasks.md 파일 경로 표시 */}
        {tasksFilePath && (
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">
              {tasksFilePath}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleCopyPath}
              title="경로 복사"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          </div>
        )}
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
