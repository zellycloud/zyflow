import { lazy, Suspense } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import type { SelectedItem } from '@/types'
import { ProjectDashboard } from './ProjectDashboard'
import { ChangeDetail } from './ChangeDetail'
import { SpecDetail } from './SpecDetail'
import { StandaloneTasks } from './StandaloneTasks'
import { SettingsPage } from '@/components/settings'
import { ProjectSettings } from '@/components/settings/ProjectSettings'
import { useProjectsAllData } from '@/hooks/useProjects'
import { useSelectedData } from '@/hooks/useFlowChanges'

// Lazy load heavy components to reduce initial bundle size
const AgentPage = lazy(() => import('@/components/agent').then(m => ({ default: m.AgentPage })))
const ArchivedChangesPage = lazy(() => import('@/components/dashboard/ArchivedChangesPage').then(m => ({ default: m.ArchivedChangesPage })))
const DocsViewer = lazy(() => import('@/components/docs').then(m => ({ default: m.DocsViewer })))
const AlertCenter = lazy(() => import('@/components/alerts').then(m => ({ default: m.AlertCenter })))
const BacklogView = lazy(() => import('./BacklogView').then(m => ({ default: m.BacklogView })))

// Loading fallback for lazy components
function LazyLoader() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
      <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
      <p>로딩 중...</p>
    </div>
  )
}

interface FlowContentProps {
  selectedItem: SelectedItem
  onSelectItem?: (item: SelectedItem) => void
}

export function FlowContent({ selectedItem, onSelectItem }: FlowContentProps) {
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

  // 프로젝트 찾기 (project-settings에서 사용)
  const selectedProject = projectsData?.projects.find(
    (p) => 'projectId' in selectedItem && p.id === selectedItem.projectId
  )

  switch (selectedItem.type) {
    case 'project':
      return <ProjectDashboard projectId={selectedItem.projectId} />
    case 'change':
      return (
        <ChangeDetail
          projectId={selectedItem.projectId}
          changeId={selectedItem.changeId}
          onArchived={() => {
            // 아카이브 후 프로젝트 대시보드로 이동
            onSelectItem?.({ type: 'project', projectId: selectedItem.projectId })
          }}
        />
      )
    case 'spec':
      return (
        <SpecDetail
          projectId={selectedItem.projectId}
          specId={selectedItem.specId}
        />
      )
    case 'standalone-tasks':
      return <StandaloneTasks projectId={selectedItem.projectId} />
    case 'project-settings':
      if (!selectedProject) {
        return (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <p>프로젝트를 찾을 수 없습니다</p>
          </div>
        )
      }
      return <ProjectSettings project={selectedProject} />
    case 'agent':
      return (
        <Suspense fallback={<LazyLoader />}>
          <AgentPage
            projectId={selectedItem.projectId}
            changeId={selectedItem.changeId}
            projectPath={selectedProject?.path}
          />
        </Suspense>
      )
    case 'archived':
      return (
        <Suspense fallback={<LazyLoader />}>
          <ArchivedChangesPage
            projectId={selectedItem.projectId}
            initialArchivedChangeId={selectedItem.archivedChangeId}
          />
        </Suspense>
      )
    case 'docs':
      if (!selectedProject?.path) {
        return (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <p>프로젝트 경로를 찾을 수 없습니다</p>
          </div>
        )
      }
      return (
        <Suspense fallback={<LazyLoader />}>
          <DocsViewer
            projectPath={selectedProject.path}
            remote={selectedProject.remote}
            initialDocPath={selectedItem.docPath}
            onClose={() => {
              // 문서 뷰어를 닫고 프로젝트 대시보드로 이동
              onSelectItem?.({ type: 'project', projectId: selectedItem.projectId })
            }}
          />
        </Suspense>
      )
    case 'alerts':
      return (
        <Suspense fallback={<LazyLoader />}>
          <AlertCenter projectId={selectedItem.projectId} />
        </Suspense>
      )
    case 'backlog':
      return (
        <Suspense fallback={<LazyLoader />}>
          <BacklogView projectId={selectedItem.projectId} />
        </Suspense>
      )
    default:
      return null
  }
}
