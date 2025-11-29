import { FolderOpen } from 'lucide-react'
import type { SelectedItem } from '@/App'
import { ProjectDashboard } from './ProjectDashboard'
import { ChangeDetail } from './ChangeDetail'
import { StandaloneTasks } from './StandaloneTasks'

interface FlowContentProps {
  selectedItem: SelectedItem
}

export function FlowContent({ selectedItem }: FlowContentProps) {
  if (!selectedItem) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <FolderOpen className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg">프로젝트를 선택하세요</p>
        <p className="text-sm mt-1">
          왼쪽 사이드바에서 프로젝트 또는 Change를 선택하세요
        </p>
      </div>
    )
  }

  switch (selectedItem.type) {
    case 'project':
      return <ProjectDashboard projectId={selectedItem.projectId} />
    case 'change':
      return (
        <ChangeDetail
          projectId={selectedItem.projectId}
          changeId={selectedItem.changeId}
        />
      )
    case 'standalone-tasks':
      return <StandaloneTasks projectId={selectedItem.projectId} />
    default:
      return null
  }
}
