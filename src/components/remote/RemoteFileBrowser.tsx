/**
 * Remote File Browser
 * 원격 서버 파일 탐색 및 프로젝트 추가 컴포넌트
 */

import { useState } from 'react'
import {
  useBrowseRemote,
  useAddRemoteProject,
} from '@/hooks/useRemoteServers'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Folder,
  File,
  Link2,
  ChevronRight,
  ArrowUp,
  Loader2,
  FolderPlus,
  Home,
} from 'lucide-react'
import type { RemoteServer, RemoteFileEntry } from '@/types'
import { toast } from 'sonner'

interface RemoteFileBrowserProps {
  server: RemoteServer
  open: boolean
  onOpenChange: (open: boolean) => void
  onProjectAdded?: () => void
}

export function RemoteFileBrowser({
  server,
  open,
  onOpenChange,
  onProjectAdded,
}: RemoteFileBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/home')
  const [projectName, setProjectName] = useState('')
  const [showAddProject, setShowAddProject] = useState(false)

  const { data: listing, isLoading, error } = useBrowseRemote(server.id, currentPath)
  const addProject = useAddRemoteProject()

  const pathParts = currentPath.split('/').filter(Boolean)

  const navigateTo = (path: string) => {
    setCurrentPath(path)
    setShowAddProject(false)
  }

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean)
    if (parts.length > 0) {
      parts.pop()
      navigateTo('/' + parts.join('/') || '/')
    }
  }

  const navigateToPathPart = (index: number) => {
    const parts = pathParts.slice(0, index + 1)
    navigateTo('/' + parts.join('/'))
  }

  const handleEntryClick = (entry: RemoteFileEntry) => {
    if (entry.type === 'directory') {
      navigateTo(entry.path)
    }
  }

  const handleAddProject = async () => {
    if (!projectName.trim()) {
      toast.error('프로젝트 이름을 입력하세요')
      return
    }

    try {
      await addProject.mutateAsync({
        serverId: server.id,
        name: projectName.trim(),
        path: currentPath,
      })
      toast.success('원격 프로젝트가 추가되었습니다')
      onOpenChange(false)
      onProjectAdded?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '프로젝트 추가 실패')
    }
  }

  const getIcon = (entry: RemoteFileEntry) => {
    switch (entry.type) {
      case 'directory':
        return <Folder className="h-4 w-4 text-blue-500" />
      case 'symlink':
        return <Link2 className="h-4 w-4 text-purple-500" />
      default:
        return <File className="h-4 w-4 text-muted-foreground" />
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            {server.name} - 파일 탐색
          </DialogTitle>
        </DialogHeader>

        {/* 경로 네비게이션 */}
        <div className="flex items-center gap-1 px-2 py-1.5 bg-muted rounded-md overflow-x-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => navigateTo('/')}
          >
            <Home className="h-3.5 w-3.5" />
          </Button>
          {pathParts.map((part, index) => (
            <div key={index} className="flex items-center">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => navigateToPathPart(index)}
              >
                {part}
              </Button>
            </div>
          ))}
        </div>

        {/* 파일 목록 */}
        <ScrollArea className="flex-1 min-h-[300px] border rounded-md">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-destructive">
              <p>디렉토리를 불러올 수 없습니다</p>
              <p className="text-sm text-muted-foreground mt-1">
                {error instanceof Error ? error.message : '알 수 없는 오류'}
              </p>
            </div>
          ) : (
            <div className="p-2">
              {/* 상위 디렉토리 */}
              {currentPath !== '/' && (
                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted text-left"
                  onClick={navigateUp}
                >
                  <ArrowUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">..</span>
                </button>
              )}

              {/* 엔트리 목록 */}
              {listing?.entries.map((entry) => (
                <button
                  key={entry.path}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted text-left"
                  onClick={() => handleEntryClick(entry)}
                  disabled={entry.type === 'file'}
                >
                  {getIcon(entry)}
                  <span className="flex-1 text-sm truncate">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatSize(entry.size)}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {entry.permissions}
                  </span>
                </button>
              ))}

              {listing?.entries.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  빈 디렉토리입니다
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* 프로젝트 추가 섹션 */}
        {showAddProject ? (
          <div className="space-y-3 p-3 border rounded-md bg-muted/50">
            <div className="text-sm">
              <span className="font-medium">선택된 경로:</span>
              <span className="ml-2 font-mono text-xs">{currentPath}</span>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="프로젝트 이름"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={handleAddProject}
                disabled={!projectName.trim() || addProject.isPending}
              >
                {addProject.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                추가
              </Button>
              <Button variant="outline" onClick={() => setShowAddProject(false)}>
                취소
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
            <Button onClick={() => setShowAddProject(true)}>
              <FolderPlus className="mr-2 h-4 w-4" />
              이 경로를 프로젝트로 추가
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
