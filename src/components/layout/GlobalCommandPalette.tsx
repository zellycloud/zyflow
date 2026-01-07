/**
 * Global Command Palette
 * 
 * Cmd+K로 활성화되는 전역 검색 기능
 * - 문서 검색
 * - Change 검색
 * - Task 검색
 * - 빠른 액션
 */

import { useState, useEffect, useCallback } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  FileText,
  FolderGit2,
  CircleDot,
  CheckCircle2,
  Settings,
  MessageSquare,
  Search,
} from 'lucide-react'
import { useProjectsAllData } from '@/hooks/useProjects'
import { useQuery } from '@tanstack/react-query'
import { projectApiUrl } from '@/config/api'

interface GlobalCommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate?: (item: { type: string; id?: string; projectId?: string }) => void
  onOpenChat?: () => void
}

export function GlobalCommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onOpenChat,
}: GlobalCommandPaletteProps) {
  const [query, setQuery] = useState('')

  const { data: projectsData } = useProjectsAllData()
  const activeProject = projectsData?.projects.find(
    (p) => p.id === projectsData?.activeProjectId
  )

  // Fetch changes for active project
  const { data: changes = [] } = useQuery({
    queryKey: ['project-changes', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const res = await fetch(projectApiUrl.changes(activeProject.id))
      if (!res.ok) return []
      const data = await res.json()
      return data.changes || []
    },
    enabled: !!activeProject?.id && open,
  })

  // Fetch tasks for active project
  const { data: tasks = [] } = useQuery({
    queryKey: ['project-tasks-search', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const res = await fetch(`/api/flow/tasks?projectId=${encodeURIComponent(activeProject.id)}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.tasks || []
    },
    enabled: !!activeProject?.id && open,
  })

  // Fetch docs for active project
  const { data: docs = [] } = useQuery({
    queryKey: ['project-docs-search', activeProject?.path],
    queryFn: async () => {
      if (!activeProject?.path) return []
      const res = await fetch(`/api/docs?projectPath=${encodeURIComponent(activeProject.path)}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.data || []
    },
    enabled: !!activeProject?.path && open,
  })

  // Filter results based on query
  const filteredChanges = query
    ? changes.filter((c: { id: string; title: string }) =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.id.toLowerCase().includes(query.toLowerCase())
      )
    : changes.slice(0, 5)

  const filteredTasks = query
    ? tasks.filter((t: { displayId: string; title: string }) =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.displayId?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : []

  // Flatten docs tree for search
  const flattenDocs = (items: any[], path = ''): any[] => {
    const result: any[] = []
    for (const item of items) {
      if (item.type === 'file') {
        result.push({ ...item, fullPath: path + item.name })
      } else if (item.type === 'folder' && item.children) {
        result.push(...flattenDocs(item.children, path + item.name + '/'))
      }
    }
    return result
  }

  const allDocs = flattenDocs(docs)
  const filteredDocs = query
    ? allDocs.filter((d: { name: string; path: string }) =>
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.path.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5)
    : allDocs.slice(0, 3)

  // Reset query when closing
  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  const handleSelect = useCallback((type: string, id?: string) => {
    onOpenChange(false)
    
    if (type === 'chat') {
      onOpenChat?.()
    } else if (type === 'change' && id) {
      onNavigate?.({ type: 'change', id, projectId: activeProject?.id })
    } else if (type === 'doc' && id) {
      onNavigate?.({ type: 'docs', id, projectId: activeProject?.id })
    } else if (type === 'settings') {
      onNavigate?.({ type: 'settings' })
    }
  }, [onOpenChange, onOpenChat, onNavigate, activeProject?.id])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="검색어를 입력하세요..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center py-6 text-muted-foreground">
            <Search className="h-10 w-10 mb-2 opacity-50" />
            <p>검색 결과가 없습니다</p>
          </div>
        </CommandEmpty>

        {/* Quick Actions */}
        {!query && (
          <>
            <CommandGroup heading="빠른 액션">
              <CommandItem onSelect={() => handleSelect('chat')}>
                <MessageSquare className="mr-2 h-4 w-4" />
                <span>AI 채팅 열기</span>
                <span className="ml-auto text-xs text-muted-foreground">⌘⇧C</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>설정</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Changes */}
        {filteredChanges.length > 0 && (
          <>
            <CommandGroup heading={`Changes ${activeProject ? `(${activeProject.name})` : ''}`}>
              {filteredChanges.slice(0, 5).map((change: { id: string; title: string; status: string }) => (
                <CommandItem
                  key={change.id}
                  value={`change-${change.id}`}
                  onSelect={() => handleSelect('change', change.id)}
                >
                  <FolderGit2 className="mr-2 h-4 w-4 text-blue-500" />
                  <span className="flex-1 truncate">{change.title}</span>
                  <span className="text-xs text-muted-foreground">{change.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Tasks */}
        {filteredTasks.length > 0 && (
          <>
            <CommandGroup heading="Tasks">
              {filteredTasks.map((task: { displayId: string; title: string; status: string; changeId: string }) => (
                <CommandItem
                  key={task.displayId}
                  value={`task-${task.displayId}`}
                  onSelect={() => handleSelect('change', task.changeId)}
                >
                  {task.status === 'done' ? (
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                  ) : (
                    <CircleDot className="mr-2 h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">{task.title}</span>
                  <span className="text-xs text-muted-foreground">{task.displayId}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Documents */}
        {filteredDocs.length > 0 && (
          <CommandGroup heading="문서">
            {filteredDocs.map((doc: { id: string; name: string; path: string }) => (
              <CommandItem
                key={doc.id}
                value={`doc-${doc.id}`}
                onSelect={() => handleSelect('doc', doc.path)}
              >
                <FileText className="mr-2 h-4 w-4 text-orange-500" />
                <span className="flex-1 truncate">{doc.name}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                  {doc.path}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
