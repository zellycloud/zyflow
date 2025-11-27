import { useState } from 'react'
import {
  FolderOpen,
  Plus,
  Trash2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  Book,
  ListTodo,
  Loader2,
  Settings,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { useProjects, useAddProject, useActivateProject, useRemoveProject, useBrowseFolder } from '@/hooks/useProjects'
import { useChanges } from '@/hooks/useChanges'
import { useSpecs } from '@/hooks/useSpecs'
import { toast } from 'sonner'

export type SelectedItem =
  | { type: 'change'; id: string }
  | { type: 'spec'; id: string }
  | null

interface AppSidebarProps {
  selectedItem: SelectedItem
  onSelectItem: (item: SelectedItem) => void
}

export function AppSidebar({ selectedItem, onSelectItem }: AppSidebarProps) {
  const [openSections, setOpenSections] = useState({
    changes: true,
    specs: true,
  })

  const { data: projectsData, isLoading: projectsLoading } = useProjects()
  const { data: changes, isLoading: changesLoading } = useChanges()
  const { data: specs, isLoading: specsLoading } = useSpecs()

  const addProject = useAddProject()
  const activateProject = useActivateProject()
  const removeProject = useRemoveProject()
  const browseFolder = useBrowseFolder()

  const activeProject = projectsData?.projects.find(
    (p) => p.id === projectsData.activeProjectId
  )

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

  const handleActivateProject = async (projectId: string) => {
    if (projectId === projectsData?.activeProjectId) return
    try {
      await activateProject.mutateAsync(projectId)
      onSelectItem(null) // Clear selection when switching projects
      toast.success('프로젝트가 전환되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '프로젝트 전환 실패')
    }
  }

  const handleRemoveProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await removeProject.mutateAsync(projectId)
      toast.success('프로젝트가 삭제되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '프로젝트 삭제 실패')
    }
  }

  return (
    <Sidebar collapsible="none">
      {/* Project Switcher Header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <FolderOpen className="size-4" />
                  </div>
                  <div className="grid flex-1 text-start text-sm leading-tight">
                    {projectsLoading ? (
                      <span className="text-muted-foreground">로딩...</span>
                    ) : activeProject ? (
                      <>
                        <span className="truncate font-semibold">
                          {activeProject.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          OpenSpec Project
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        프로젝트 선택
                      </span>
                    )}
                  </div>
                  <ChevronsUpDown className="ms-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                align="start"
                sideOffset={4}
              >
                {projectsData?.projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => handleActivateProject(project.id)}
                    className="gap-2 p-2 group"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border">
                      {project.id === projectsData.activeProjectId ? (
                        <Check className="size-4 text-primary" />
                      ) : (
                        <FolderOpen className="size-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{project.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {project.path}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => handleRemoveProject(project.id, e)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </DropdownMenuItem>
                ))}
                {projectsData?.projects.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    등록된 프로젝트가 없습니다
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleBrowseAndAdd}
                  disabled={browseFolder.isPending || addProject.isPending}
                  className="gap-2 p-2"
                >
                  <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                    <Plus className="size-4" />
                  </div>
                  <div className="text-muted-foreground font-medium">
                    {browseFolder.isPending || addProject.isPending
                      ? '추가 중...'
                      : '프로젝트 추가'}
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Main Content - Tree Structure */}
      <SidebarContent>
        {activeProject ? (
          <SidebarGroup>
            <SidebarGroupLabel>OpenSpec</SidebarGroupLabel>
            <SidebarMenu>
              {/* Changes Section */}
              <Collapsible
                open={openSections.changes}
                onOpenChange={(open) =>
                  setOpenSections((prev) => ({ ...prev, changes: open }))
                }
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <ListTodo className="size-4" />
                      <span>Changes</span>
                      {changes && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {changes.length}
                        </span>
                      )}
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {changesLoading ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton>
                            <Loader2 className="size-4 animate-spin" />
                            <span>로딩 중...</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : changes?.length === 0 ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton className="text-muted-foreground">
                            <FileText className="size-4" />
                            <span>변경 제안 없음</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : (
                        changes?.map((change) => (
                          <SidebarMenuSubItem key={change.id}>
                            <SidebarMenuSubButton
                              onClick={() =>
                                onSelectItem({ type: 'change', id: change.id })
                              }
                              isActive={
                                selectedItem?.type === 'change' &&
                                selectedItem.id === change.id
                              }
                            >
                              <FileText className="size-4" />
                              <span className="truncate">{change.title}</span>
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

              {/* Specs Section */}
              <Collapsible
                open={openSections.specs}
                onOpenChange={(open) =>
                  setOpenSections((prev) => ({ ...prev, specs: open }))
                }
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <Book className="size-4" />
                      <span>Specs</span>
                      {specs && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {specs.length}
                        </span>
                      )}
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {specsLoading ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton>
                            <Loader2 className="size-4 animate-spin" />
                            <span>로딩 중...</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : specs?.length === 0 ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton className="text-muted-foreground">
                            <Book className="size-4" />
                            <span>스펙 없음</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : (
                        specs?.map((spec) => (
                          <SidebarMenuSubItem key={spec.id}>
                            <SidebarMenuSubButton
                              onClick={() =>
                                onSelectItem({ type: 'spec', id: spec.id })
                              }
                              isActive={
                                selectedItem?.type === 'spec' &&
                                selectedItem.id === spec.id
                              }
                            >
                              <Book className="size-4" />
                              <span className="truncate">{spec.title}</span>
                              {spec.requirementsCount > 0 && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {spec.requirementsCount} req
                                </span>
                              )}
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FolderOpen className="h-8 w-8 mb-2" />
              <p className="text-sm">프로젝트를 선택하세요</p>
            </div>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" className="text-muted-foreground">
              <Settings className="size-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
