import { useState } from 'react'
import {
  FolderOpen,
  Plus,
  Loader2,
  Settings,
  ChevronRight,
  ChevronDown,
  GitBranch,
  ListTodo,
  Bot,
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
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { SelectedItem } from '@/App'

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
  const { selectItem } = useSelectedItem()

  const addProject = useAddProject()
  const activateProject = useActivateProject()
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

  const handleSelectStandaloneTasks = (projectId: string) => {
    const selectedItem: SelectedItem = { type: 'standalone-tasks', projectId }

    // 먼저 UI 업데이트 (즉시 반응)
    onSelect(selectedItem)
    selectItem(selectedItem)

    // 프로젝트 활성화는 비동기로
    if (projectId !== projectsData?.activeProjectId) {
      activateProject.mutate(projectId)
    }
  }

  const handleSelectProjectSettings = (projectId: string) => {
    const selectedItem: SelectedItem = { type: 'project-settings', projectId }

    // 먼저 UI 업데이트 (즉시 반응)
    onSelect(selectedItem)
    selectItem(selectedItem)

    // 프로젝트 활성화는 비동기로
    if (projectId !== projectsData?.activeProjectId) {
      activateProject.mutate(projectId)
    }
  }

  const handleSelectAgent = (projectId: string) => {
    const selectedItem: SelectedItem = { type: 'agent', projectId }

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
                          {/* Agent */}
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              onClick={() =>
                                handleSelectAgent(project.id)
                              }
                              isActive={
                                selectedItem?.type === 'agent' &&
                                selectedItem.projectId === project.id
                              }
                            >
                              <Bot className="size-3" />
                              <span>Agent</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
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
                          {/* Project Settings */}
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              onClick={() =>
                                handleSelectProjectSettings(project.id)
                              }
                              isActive={
                                selectedItem?.type === 'project-settings' &&
                                selectedItem.projectId === project.id
                              }
                            >
                              <Settings className="size-3" />
                              <span>Settings</span>
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
