import { useState, useCallback } from 'react'
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
  Link2,
  GripVertical,
  Pencil,
  Check,
  X,
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
import { useProjectsAllData, useAddProject, useActivateProject, useRemoveProject, useBrowseFolder, useUpdateProjectPath, useReorderProjects } from '@/hooks/useProjects'
import { Input } from '@/components/ui/input'
import { useFlowChangeCounts, useSelectedItem } from '@/hooks/useFlowChanges'
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
  const [editingPathId, setEditingPathId] = useState<string | null>(null)
  const [editingPath, setEditingPath] = useState('')
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null)
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)

  const { data: projectsData, isLoading } = useProjectsAllData()
  const { data: changeCounts } = useFlowChangeCounts({
    status: 'active',
    enabled: !!projectsData?.projects.length
  })
  const { selectItem } = useSelectedItem()

  const addProject = useAddProject()
  const activateProject = useActivateProject()
  const removeProject = useRemoveProject()
  const browseFolder = useBrowseFolder()
  const updateProjectPath = useUpdateProjectPath()
  const reorderProjects = useReorderProjects()

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

  // 경로 편집 시작
  const handleStartEditPath = (projectId: string, currentPath: string) => {
    setEditingPathId(projectId)
    setEditingPath(currentPath)
  }

  // 경로 편집 취소
  const handleCancelEditPath = () => {
    setEditingPathId(null)
    setEditingPath('')
  }

  // 경로 편집 저장
  const handleSavePath = async (projectId: string) => {
    try {
      await updateProjectPath.mutateAsync({ projectId, path: editingPath })
      toast.success('프로젝트 경로가 변경되었습니다')
      setEditingPathId(null)
      setEditingPath('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '경로 변경 실패')
    }
  }

  // 폴더 선택으로 경로 변경
  const handleBrowseAndUpdatePath = async (projectId: string) => {
    try {
      const result = await browseFolder.mutateAsync()
      if (result.cancelled || !result.path) return
      setEditingPath(result.path)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '폴더 선택 실패')
    }
  }

  // 드래그 앤 드롭 핸들러
  const handleDragStart = useCallback((e: React.DragEvent, projectId: string) => {
    setDraggedProjectId(projectId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, projectId: string) => {
    e.preventDefault()
    if (draggedProjectId && draggedProjectId !== projectId) {
      setDragOverProjectId(projectId)
    }
  }, [draggedProjectId])

  const handleDragLeave = useCallback(() => {
    setDragOverProjectId(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, targetProjectId: string) => {
    e.preventDefault()
    if (!draggedProjectId || draggedProjectId === targetProjectId || !projectsData?.projects) {
      setDraggedProjectId(null)
      setDragOverProjectId(null)
      return
    }

    const currentOrder = projectsData.projects.map(p => p.id)
    const draggedIndex = currentOrder.indexOf(draggedProjectId)
    const targetIndex = currentOrder.indexOf(targetProjectId)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedProjectId(null)
      setDragOverProjectId(null)
      return
    }

    // 새 순서 계산
    const newOrder = [...currentOrder]
    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, draggedProjectId)

    try {
      await reorderProjects.mutateAsync(newOrder)
      toast.success('프로젝트 순서가 변경되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '순서 변경 실패')
    }

    setDraggedProjectId(null)
    setDragOverProjectId(null)
  }, [draggedProjectId, projectsData?.projects, reorderProjects])

  const handleDragEnd = useCallback(() => {
    setDraggedProjectId(null)
    setDragOverProjectId(null)
  }, [])

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
                    <p className="text-xs text-muted-foreground mb-3">
                      드래그하여 순서를 변경할 수 있습니다.
                    </p>
                    {projectsData?.projects.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        등록된 프로젝트가 없습니다.
                      </p>
                    ) : (
                      projectsData?.projects.map((project) => {
                        const isEditing = editingPathId === project.id
                        const isDragging = draggedProjectId === project.id
                        const isDragOver = dragOverProjectId === project.id

                        return (
                          <div
                            key={project.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, project.id)}
                            onDragOver={(e) => handleDragOver(e, project.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, project.id)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                              'p-3 rounded-lg border transition-all',
                              isDragging && 'opacity-50 border-dashed',
                              isDragOver && 'border-primary bg-primary/5',
                              !isDragging && !isDragOver && 'hover:border-muted-foreground/50'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="cursor-grab active:cursor-grabbing">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{project.name}</p>
                                {isEditing ? (
                                  <div className="flex items-center gap-2 mt-1">
                                    <Input
                                      value={editingPath}
                                      onChange={(e) => setEditingPath(e.target.value)}
                                      className="h-7 text-xs"
                                      placeholder="프로젝트 경로"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 flex-shrink-0"
                                      onClick={() => handleBrowseAndUpdatePath(project.id)}
                                      disabled={browseFolder.isPending}
                                    >
                                      <FolderOpen className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {project.path}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {isEditing ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-green-600 hover:text-green-600 hover:bg-green-600/10"
                                      onClick={() => handleSavePath(project.id)}
                                      disabled={updateProjectPath.isPending || !editingPath}
                                    >
                                      {updateProjectPath.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Check className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={handleCancelEditPath}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleStartEditPath(project.id, project.path)}
                                      title="경로 변경"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => handleRemoveProject(project.id)}
                                      disabled={removeProject.isPending}
                                      title="프로젝트 삭제"
                                    >
                                      {removeProject.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
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

        {/* Settings */}
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  onSelect({ type: 'settings' })
                  selectItem({ type: 'settings' })
                }}
                isActive={selectedItem?.type === 'settings'}
              >
                <Link2 className="size-4" />
                <span>Integrations</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
