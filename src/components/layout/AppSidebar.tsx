import { useState } from 'react'
import {
  FolderOpen,
  Plus,
  Trash2,
  ChevronRight,
  FileText,
  Loader2,
  Settings,
  LayoutGrid,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useProjectsAllData, useAddProject, useActivateProject, useRemoveProject, useBrowseFolder } from '@/hooks/useProjects'
import { toast } from 'sonner'
import type { ProjectWithData } from '@/types'

export type SelectedItem =
  | { type: 'change'; id: string; projectId: string }
  | { type: 'tasks' }
  | null

interface AppSidebarProps {
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
}

export function AppSidebar({ selectedItem, onSelectItem }: AppSidebarProps) {
  // 기본값을 false로 설정하여 접힌 상태로 시작
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { data: projectsData, isLoading } = useProjectsAllData()
  const addProject = useAddProject()
  const activateProject = useActivateProject()
  const removeProject = useRemoveProject()
  const browseFolder = useBrowseFolder()

  const toggleProject = (projectId: string) => {
    setOpenProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }))
  }

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

  const handleSelectChange = async (project: ProjectWithData, changeId: string) => {
    // Activate project if not active
    if (project.id !== projectsData?.activeProjectId) {
      await activateProject.mutateAsync(project.id)
    }
    onSelectItem({ type: 'change', id: changeId, projectId: project.id })
  }

  return (
    <Sidebar collapsible="none">
      {/* Tasks Board */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tasks</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onSelectItem({ type: 'tasks' })}
                isActive={selectedItem?.type === 'tasks'}
              >
                <LayoutGrid className="size-4" />
                <span>Kanban Board</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Projects Tree */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>OpenSpec</span>
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
                // 기본값 true로 펼쳐진 상태
                const isOpen = openProjects[project.id] ?? true
                const totalChangeTasks = project.changes.reduce((sum, c) => sum + c.totalTasks, 0)
                const completedChangeTasks = project.changes.reduce((sum, c) => sum + c.completedTasks, 0)

                return (
                  <Collapsible
                    key={project.id}
                    open={isOpen}
                    onOpenChange={() => toggleProject(project.id)}
                    className="group/project"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="group">
                          <FolderOpen className="size-4" />
                          <span className="truncate font-medium">{project.name}</span>
                          {totalChangeTasks > 0 && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {completedChangeTasks}/{totalChangeTasks}
                            </span>
                          )}
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/project:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {project.changes.length === 0 ? (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton className="text-muted-foreground">
                                <span className="text-xs">변경 제안 없음</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ) : (
                            project.changes.map((change) => (
                              <SidebarMenuSubItem key={change.id}>
                                <SidebarMenuSubButton
                                  onClick={() => handleSelectChange(project, change.id)}
                                  isActive={
                                    selectedItem?.type === 'change' &&
                                    selectedItem.id === change.id &&
                                    selectedItem.projectId === project.id
                                  }
                                >
                                  <FileText className="size-3" />
                                  <span className="truncate text-xs">{change.id}</span>
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {change.completedTasks}/{change.totalTasks}
                                  </span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))
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
      </SidebarContent>
    </Sidebar>
  )
}
