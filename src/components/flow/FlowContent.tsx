import { FolderOpen, Loader2 } from 'lucide-react'
import type { SelectedItem } from '@/App'
import { ProjectDashboard } from './ProjectDashboard'
import { ChangeDetail } from './ChangeDetail'
import { StandaloneTasks } from './StandaloneTasks'
import { SettingsPage } from '@/components/settings'
import { useProjectsAllData } from '@/hooks/useProjects'
import { useSelectedData } from '@/hooks/useFlowChanges'

interface FlowContentProps {
  selectedItem: SelectedItem
}

export function FlowContent({ selectedItem }: FlowContentProps) {
  const { data: projectsData, isLoading } = useProjectsAllData()
  // 선택된 항목에 따라 관련 데이터 미리 가져오기 (성능 최적화)
  useSelectedData(selectedItem)

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

  // 프로젝트 데이터 로딩 중이면 로딩 표시
  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>로딩 중...</p>
      </div>
    )
  }

  // Settings 페이지는 프로젝트 선택 없이 표시
  if (selectedItem.type === 'settings') {
    return <SettingsPage />
  }

  // 선택된 프로젝트가 활성 프로젝트와 다르면 렌더링하지 않음 (404 방지)
  // 프로젝트 전환 중일 때 이전 프로젝트의 Change를 요청하지 않도록 함
  if ('projectId' in selectedItem && selectedItem.projectId !== projectsData?.activeProjectId) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>프로젝트 전환 중...</p>
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
