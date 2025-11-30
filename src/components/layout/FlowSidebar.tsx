import { useState } from 'react'
import {
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  Settings,
  ChevronRight,
  ChevronDown,
  GitBranch,
  ListTodo,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useProjectsAllData, useAddProject, useActivateProject, useRemoveProject, useBrowseFolder } from '@/hooks/useProjects'
import { useFlowChangeCounts } from '@/hooks/useFlowChanges'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { SelectedItem } from '@/App'

interface FlowSidebarProps {
  selectedItem: SelectedItem
  onSelect: (item: SelectedItem) => void
}

export function FlowSidebar({ selectedItem, onSelect }: FlowSidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const { data: projectsData, isLoading } = useProjectsAllData()
  const { data: changeCounts } = useFlowChangeCounts()

  const addProject = useAddProject()
  const activateProject = useActivateProject()
  const removeProject = useRemoveProject()
  const browseFolder = useBrowseFolder()

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

  const handleRemoveProject = async (projectId: string) => {
    try {
      await removeProject.mutateAsync(projectId)
      toast.success('프로젝트가 삭제되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '프로젝트 삭제 실패')
    }
  }

  const handleSelectProject = (projectId: string) => {
    // 먼저 UI 업데이트 (즉시 반응)
    onSelect({ type: 'project', projectId })
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
    // 먼저 UI 업데이트 (즉시 반응)
    onSelect({ type: 'change', projectId, changeId })

    // 프로젝트 활성화는 비동기로
    if (projectId !== projectsData?.activeProjectId) {
      activateProject.mutate(projectId)
    }
  }

  const handleSelectStandaloneTasks = (projectId: string) => {
    // 먼저 UI 업데이트 (즉시 반응)
    onSelect({ type: 'standalone-tasks', projectId })

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

  return (
    <Sidebar collapsible="none">
      <SidebarContent>
        {/* Projects */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>프로젝트</span>
            <div className="flex items-center gap-1">
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
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5">
                    <Settings className="h-3 w-3" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>프로젝트 관리</DialogTitle>
                    <DialogDescription>
                      등록된 프로젝트를 관리합니다.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 mt-4">
                    {projectsData?.projects.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        등록된 프로젝트가 없습니다.
                      </p>
                    ) : (
                      projectsData?.projects.map((project) => (
                        <div
                          key={project.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex items-center gap-3">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-sm">{project.name}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                                {project.path}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveProject(project.id)}
                            disabled={removeProject.isPending}
                          >
                            {removeProject.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))
                    )}
                    <Button
                      variant="outline"
                      className="w-full mt-4"
                      onClick={handleBrowseAndAdd}
                      disabled={browseFolder.isPending || addProject.isPending}
                    >
                      {browseFolder.isPending || addProject.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      프로젝트 추가
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
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
                        className={cn(isProjectSelected && 'bg-primary/10')}
                      >
                        <CollapsibleTrigger asChild>
                          <span
                            className="flex items-center justify-center size-4 hover:bg-accent rounded"
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
                        <FolderOpen className="size-4" />
                        <span className="truncate font-medium">{project.name}</span>
                        {projectChangeCount > 0 && (
                          <SidebarMenuBadge>{projectChangeCount}</SidebarMenuBadge>
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
                                <SidebarMenuSubButton
                                  onClick={() =>
                                    handleSelectChange(project.id, change.id)
                                  }
                                  isActive={isChangeSelected}
                                >
                                  <GitBranch className="size-3" />
                                  <span className="truncate">{change.title}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            )
                          })}
                          {/* Inbox */}
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              onClick={() =>
                                handleSelectStandaloneTasks(project.id)
                              }
                              isActive={
                                selectedItem?.type === 'standalone-tasks' &&
                                selectedItem.projectId === project.id
                              }
                            >
                              <ListTodo className="size-3" />
                              <span>Inbox</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )
              })
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
