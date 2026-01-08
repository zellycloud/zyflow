import { useState } from 'react'
import {
  FolderOpen,
  Plus,
  Loader2,
  Settings,
  ChevronRight,
  ChevronDown,
  GitBranch,
  ArrowDown,
  RefreshCw,
  Server,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useProjectsAllData, useAddProject, useActivateProject, useBrowseFolder } from '@/hooks/useProjects'
import { useFlowChangeCounts, useSelectedItem } from '@/hooks/useFlowChanges'
import { useProjectsSyncStatus, useProjectPull } from '@/hooks/useGit'
import { toast } from 'sonner'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn, formatRelativeDate } from '@/lib/utils'
import type { SelectedItem } from '@/types'

interface FlowSidebarProps {
  selectedItem: SelectedItem
  onSelect: (item: SelectedItem) => void
}

export function FlowSidebar({ selectedItem, onSelect }: FlowSidebarProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const { data: projectsData, isLoading } = useProjectsAllData()
  const { data: changeCounts } = useFlowChangeCounts({
    status: 'active',
    enabled: !!projectsData?.projects.length
  })
  const { data: syncStatus } = useProjectsSyncStatus()
  const { selectItem } = useSelectedItem()

  const addProject = useAddProject()
  const activateProject = useActivateProject()
  const browseFolder = useBrowseFolder()
  const projectPull = useProjectPull()

  const handleBrowseAndAdd = async () => {
    try {
      const result = await browseFolder.mutateAsync()
      if (result.cancelled || !result.path) return
      await addProject.mutateAsync(result.path)
      toast.success('프로젝트가 등록되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '프로젝트 등록 실패')
    }
  }

  const handleSelectProject = (projectId: string) => {
    const selectedItem: SelectedItem = { type: 'project', projectId }
    
    // 먼저 UI 업데이트 (즉시 반응)
    onSelect(selectedItem)
    selectItem(selectedItem)
    
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      next.add(projectId)
      return next
    })

    // 프로젝트 활성화는 비동기로 (UI 블로킹 없이)
    if (projectId !== projectsData?.activeProjectId) {
      activateProject.mutate(projectId)
    }
  }

  const handleSelectChange = (projectId: string, changeId: string) => {
    const selectedItem: SelectedItem = { type: 'change', projectId, changeId }
    
    // 먼저 UI 업데이트 (즉시 반응)
    onSelect(selectedItem)
    selectItem(selectedItem)

    // 프로젝트 활성화는 비동기로
    if (projectId !== projectsData?.activeProjectId) {
      activateProject.mutate(projectId)
    }
  }

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  const handlePullProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    try {
      await projectPull.mutateAsync(projectId)
      toast.success('최신 변경사항을 가져왔습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pull 실패')
    }
  }

  return (
    <Sidebar collapsible="none">
      <SidebarContent>
        {/* Projects */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>프로젝트</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={handleBrowseAndAdd}
              disabled={browseFolder.isPending || addProject.isPending}
            >
              {browseFolder.isPending || addProject.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </Button>
          </SidebarGroupLabel>
          <SidebarMenu>
            {isLoading ? (
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Loader2 className="size-4 animate-spin" />
                  <span>로딩 중...</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : projectsData?.projects.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleBrowseAndAdd}
                  className="text-muted-foreground"
                >
                  <Plus className="size-4" />
                  <span>프로젝트 추가</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              projectsData?.projects.map((project) => {
                const isExpanded = expandedProjects.has(project.id)
                const isProjectSelected =
                  selectedItem?.type === 'project' &&
                  selectedItem.projectId === project.id
                const projectChangeCount = changeCounts?.[project.id] ?? 0
                const projectSync = syncStatus?.[project.id]
                const behindCount = projectSync?.behind ?? 0
                const isPulling = projectPull.isPending && projectPull.variables === project.id

                return (
                  <Collapsible
                    key={project.id}
                    open={isExpanded}
                    onOpenChange={() => toggleProject(project.id)}
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => handleSelectProject(project.id)}
                        isActive={isProjectSelected}
                        className={cn(
                          isProjectSelected && 'bg-primary/10',
                          behindCount > 0 && 'flex-col items-start gap-0.5 h-auto py-1.5'
                        )}
                      >
                        <div className="flex items-center gap-1 w-full">
                          <CollapsibleTrigger asChild>
                            <span
                              className="flex items-center justify-center size-4 hover:bg-accent rounded shrink-0"
                              onClick={(e) => {
                                e.stopPropagation()
                              }}
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </span>
                          </CollapsibleTrigger>
                          {project.remote ? (
                            <Server className="size-4 shrink-0 text-blue-500" />
                          ) : (
                            <FolderOpen className="size-4 shrink-0" />
                          )}
                          <span className="truncate font-medium flex-1">{project.name}</span>
                          {projectChangeCount > 0 && (
                            <SidebarMenuBadge>{projectChangeCount}</SidebarMenuBadge>
                          )}
                        </div>
                        {/* Git behind 표시 + Pull 버튼 (두 번째 줄) */}
                        {behindCount > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  role="button"
                                  tabIndex={isPulling ? -1 : 0}
                                  onClick={(e) => handlePullProject(e, project.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      handlePullProject(e as unknown as React.MouseEvent, project.id)
                                    }
                                  }}
                                  className={cn(
                                    "ml-5 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs cursor-pointer",
                                    "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                                    "hover:bg-blue-500/30 transition-colors",
                                    isPulling && "opacity-50 cursor-not-allowed pointer-events-none"
                                  )}
                                >
                                  {isPulling ? (
                                    <RefreshCw className="size-3 animate-spin" />
                                  ) : (
                                    <ArrowDown className="size-3" />
                                  )}
                                  <span>↓ {behindCount}개 새 커밋</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                <p>클릭하여 Pull</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </SidebarMenuButton>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {/* Changes */}
                          {project.changes?.map((change) => {
                            const isChangeSelected =
                              selectedItem?.type === 'change' &&
                              selectedItem.changeId === change.id

                            return (
                              <SidebarMenuSubItem key={change.id}>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <SidebarMenuSubButton
                                        onClick={() =>
                                          handleSelectChange(project.id, change.id)
                                        }
                                        isActive={isChangeSelected}
                                      >
                                        <GitBranch className="size-3" />
                                        <span className="truncate flex-1">{change.title}</span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                          {formatRelativeDate((change as { updatedAt?: string }).updatedAt)}
                                        </span>
                                      </SidebarMenuSubButton>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      <p>최근 수정: {(change as { updatedAt?: string }).updatedAt ? new Date((change as { updatedAt?: string }).updatedAt!).toLocaleString('ko-KR') : '-'}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </SidebarMenuSubItem>
                            )
                          })}
                          {/* Changes가 없을 때 안내 메시지 */}
                          {(!project.changes || project.changes.length === 0) && (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton className="text-muted-foreground cursor-default">
                                <span className="text-xs">변경 사항 없음</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )
              })
            )}
          </SidebarMenu>
        </SidebarGroup>

        {/* Settings */}
        <SidebarGroup className="border-t pt-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  onSelect({ type: 'settings' })
                  selectItem({ type: 'settings' })
                }}
                isActive={selectedItem?.type === 'settings'}
              >
                <Settings className="size-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
