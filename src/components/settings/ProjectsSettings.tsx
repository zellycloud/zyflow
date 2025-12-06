import { useState, useCallback } from 'react'
import {
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  Pencil,
  Check,
  X,
  Download,
  Globe,
  HardDrive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useProjectsAllData,
  useAddProject,
  useRemoveProject,
  useBrowseFolder,
  useUpdateProjectName,
  useUpdateProjectPath,
  useReorderProjects,
  useLocalSettingsStatus,
  useExportToLocal,
} from '@/hooks/useProjects'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// 프로젝트별 로컬 설정 배지 컴포넌트
function LocalSettingsBadge({ projectPath }: { projectPath: string }) {
  const { data: status, isLoading } = useLocalSettingsStatus(projectPath)

  if (isLoading) {
    return null
  }

  if (!status) {
    return null
  }

  if (status.hasLocal) {
    return (
      <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
        <HardDrive className="h-3 w-3" />
        로컬
      </span>
    )
  }

  if (status.hasGlobal) {
    return (
      <span className="text-xs bg-gray-500/10 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
        <Globe className="h-3 w-3" />
        전역
      </span>
    )
  }

  return null
}

export function ProjectsSettings() {
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingPathId, setEditingPathId] = useState<string | null>(null)
  const [editingPath, setEditingPath] = useState('')
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null)
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportTarget, setExportTarget] = useState<{ id: string; name: string; path: string } | null>(null)

  const { data: projectsData, isLoading } = useProjectsAllData()
  const addProject = useAddProject()
  const removeProject = useRemoveProject()
  const browseFolder = useBrowseFolder()
  const updateProjectName = useUpdateProjectName()
  const updateProjectPath = useUpdateProjectPath()
  const reorderProjects = useReorderProjects()
  const exportToLocal = useExportToLocal()

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

  const handleStartEditName = (projectId: string, currentName: string) => {
    setEditingNameId(projectId)
    setEditingName(currentName)
  }

  const handleCancelEditName = () => {
    setEditingNameId(null)
    setEditingName('')
  }

  const handleSaveName = async (projectId: string) => {
    try {
      await updateProjectName.mutateAsync({ projectId, name: editingName })
      toast.success('프로젝트 이름이 변경되었습니다')
      setEditingNameId(null)
      setEditingName('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '이름 변경 실패')
    }
  }

  const handleStartEditPath = (projectId: string, currentPath: string) => {
    setEditingPathId(projectId)
    setEditingPath(currentPath)
  }

  const handleCancelEditPath = () => {
    setEditingPathId(null)
    setEditingPath('')
  }

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

  const handleBrowseAndUpdatePath = async () => {
    try {
      const result = await browseFolder.mutateAsync()
      if (result.cancelled || !result.path) return
      setEditingPath(result.path)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '폴더 선택 실패')
    }
  }

  const handleOpenExportDialog = (project: { id: string; name: string; path: string }) => {
    setExportTarget(project)
    setExportDialogOpen(true)
  }

  const handleExportToLocal = async () => {
    if (!exportTarget) return
    try {
      const result = await exportToLocal.mutateAsync({
        projectId: exportTarget.id,
        projectPath: exportTarget.path,
      })
      toast.success(`로컬 설정으로 내보냈습니다 (${result.exported.length}개 파일)`)
      setExportDialogOpen(false)
      setExportTarget(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내보내기 실패')
    }
  }

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">프로젝트 관리</h3>
        <p className="text-sm text-muted-foreground">
          등록된 프로젝트를 관리합니다. 드래그하여 순서를 변경할 수 있습니다.
        </p>
      </div>

      <div className="space-y-2">
        {projectsData?.projects.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/30">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              등록된 프로젝트가 없습니다.
            </p>
          </div>
        ) : (
          projectsData?.projects.map((project) => {
            const isEditingName = editingNameId === project.id
            const isEditingPath = editingPathId === project.id
            const isDragging = draggedProjectId === project.id
            const isDragOver = dragOverProjectId === project.id
            const isActive = project.id === projectsData.activeProjectId

            return (
              <div
                key={project.id}
                draggable={!isEditingName && !isEditingPath}
                onDragStart={(e) => handleDragStart(e, project.id)}
                onDragOver={(e) => handleDragOver(e, project.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, project.id)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'p-4 rounded-lg border transition-all',
                  isDragging && 'opacity-50 border-dashed',
                  isDragOver && 'border-primary bg-primary/5',
                  isActive && 'border-primary/50 bg-primary/5',
                  !isDragging && !isDragOver && 'hover:border-muted-foreground/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <FolderOpen className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isEditingName ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="h-7 text-sm font-medium w-48"
                            placeholder="프로젝트 이름"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName(project.id)
                              if (e.key === 'Escape') handleCancelEditName()
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600 hover:text-green-600 hover:bg-green-600/10"
                            onClick={() => handleSaveName(project.id)}
                            disabled={updateProjectName.isPending || !editingName.trim()}
                          >
                            {updateProjectName.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleCancelEditName}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <p
                          className="font-medium cursor-pointer hover:text-primary transition-colors"
                          onDoubleClick={() => handleStartEditName(project.id, project.name)}
                          title="더블클릭하여 이름 변경"
                        >
                          {project.name}
                        </p>
                      )}
                      {isActive && !isEditingName && (
                        <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          활성
                        </span>
                      )}
                      {!isEditingName && (
                        <LocalSettingsBadge projectPath={project.path} />
                      )}
                    </div>
                    {isEditingPath ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          value={editingPath}
                          onChange={(e) => setEditingPath(e.target.value)}
                          className="h-8 text-sm"
                          placeholder="프로젝트 경로"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={handleBrowseAndUpdatePath}
                          disabled={browseFolder.isPending}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {project.path}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isEditingPath ? (
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
                    ) : !isEditingName ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenExportDialog(project)}
                          title="로컬 설정으로 내보내기"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
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
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <Button
        variant="outline"
        className="w-full"
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

      {/* 내보내기 확인 다이얼로그 */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>로컬 설정으로 내보내기</DialogTitle>
            <DialogDescription>
              전역 DB의 설정을 프로젝트 로컬 폴더로 내보냅니다.
            </DialogDescription>
          </DialogHeader>
          {exportTarget && (
            <div className="py-4 space-y-2">
              <p className="text-sm">
                <span className="font-medium">{exportTarget.name}</span> 프로젝트의 설정을
                로컬로 내보냅니다.
              </p>
              <p className="text-xs text-muted-foreground">
                대상 경로: <code className="bg-muted px-1 rounded">{exportTarget.path}/.zyflow/</code>
              </p>
              <p className="text-xs text-muted-foreground">
                내보내기 항목: 계정 매핑, 환경 변수, 테스트 계정
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExportDialogOpen(false)}
              disabled={exportToLocal.isPending}
            >
              취소
            </Button>
            <Button onClick={handleExportToLocal} disabled={exportToLocal.isPending}>
              {exportToLocal.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  내보내는 중...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  내보내기
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
