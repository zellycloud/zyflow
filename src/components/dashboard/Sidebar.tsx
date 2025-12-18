import { useState } from 'react'
import { Settings, FolderOpen, Plus, Trash2, Check, ChevronRight, ChevronDown, Archive, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChangeList } from './ChangeList'
import { ArchivedChangeList } from './ArchivedChangeList'
import { useProjects, useAddProject, useActivateProject, useRemoveProject, useBrowseFolder } from '@/hooks/useProjects'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type ViewMode = 'active' | 'archived'

interface SidebarProps {
  selectedChangeId: string | null
  onSelectChange: (id: string) => void
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  selectedArchivedId?: string | null
  onSelectArchived?: (id: string) => void
}

export function Sidebar({
  selectedChangeId,
  onSelectChange,
  viewMode = 'active',
  onViewModeChange,
  selectedArchivedId,
  onSelectArchived,
}: SidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('active')

  const currentViewMode = onViewModeChange ? viewMode : internalViewMode
  const handleViewModeChange = (mode: ViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(mode)
    } else {
      setInternalViewMode(mode)
    }
  }

  const { data, isLoading } = useProjects()
  const addProject = useAddProject()
  const activateProject = useActivateProject()
  const removeProject = useRemoveProject()
  const browseFolder = useBrowseFolder()

  const activeProject = data?.projects.find(p => p.id === data.activeProjectId)

  const handleBrowseAndAdd = async () => {
    try {
      const result = await browseFolder.mutateAsync()
      if (result.cancelled || !result.path) {
        return
      }

      await addProject.mutateAsync(result.path)
      toast.success('프로젝트가 등록되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '프로젝트 등록 실패')
    }
  }

  const handleActivateProject = async (projectId: string) => {
    if (projectId === data?.activeProjectId) return
    try {
      await activateProject.mutateAsync(projectId)
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
    <div className="flex h-full flex-col">
      {/* Project Selector at Top */}
      <div className="border-b p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-auto py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                {isLoading ? (
                  <span className="text-muted-foreground text-sm">로딩...</span>
                ) : activeProject ? (
                  <div className="text-left min-w-0">
                    <div className="font-medium text-sm truncate">{activeProject.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{activeProject.path}</div>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">프로젝트 선택</span>
                )}
              </div>
              <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[260px]">
            {data?.projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => handleActivateProject(project.id)}
                className="flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {project.id === data.activeProjectId ? (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <div className="w-4" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm">{project.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{project.path}</div>
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
            {data?.projects.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                등록된 프로젝트가 없습니다
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleBrowseAndAdd} disabled={browseFolder.isPending || addProject.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              {browseFolder.isPending || addProject.isPending ? '추가 중...' : '프로젝트 추가'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Change List with Tabs */}
      <Tabs
        value={currentViewMode}
        onValueChange={(v) => handleViewModeChange(v as ViewMode)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="border-b px-2 pt-2">
          <TabsList className="w-full h-8 bg-muted/50">
            <TabsTrigger value="active" className="flex-1 gap-1 text-xs">
              <FileText className="h-3 w-3" />
              활성
            </TabsTrigger>
            <TabsTrigger value="archived" className="flex-1 gap-1 text-xs">
              <Archive className="h-3 w-3" />
              아카이브
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="active" className="flex-1 m-0 overflow-hidden">
          <ChangeList selectedId={selectedChangeId} onSelect={onSelectChange} />
        </TabsContent>
        <TabsContent value="archived" className="flex-1 m-0 overflow-hidden">
          <ArchivedChangeList
            selectedId={selectedArchivedId ?? null}
            onSelect={onSelectArchived ?? (() => {})}
          />
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Settings Section */}
      <Collapsible open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between rounded-none h-12 px-4"
          >
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </div>
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform',
                isSettingsOpen && 'rotate-90'
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t bg-muted/30">
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase">
                  프로젝트
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleBrowseAndAdd}
                  disabled={browseFolder.isPending || addProject.isPending}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-1">
                  {isLoading ? (
                    <p className="text-xs text-muted-foreground py-2">로딩...</p>
                  ) : data?.projects.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      등록된 프로젝트가 없습니다
                    </p>
                  ) : (
                    data?.projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => handleActivateProject(project.id)}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left group',
                          'hover:bg-accent transition-colors',
                          project.id === data.activeProjectId && 'bg-accent'
                        )}
                      >
                        {project.id === data.activeProjectId ? (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <div className="w-3.5" />
                        )}
                        <span className="truncate flex-1">{project.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={(e) => handleRemoveProject(project.id, e)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

    </div>
  )
}
