/**
 * Global Command Palette
 *
 * Cmd+K로 활성화되는 전역 검색 기능
 * - 모든 프로젝트의 Change 검색
 * - 전역 문서 검색 (모든 프로젝트)
 * - AI 시맨틱 검색 (LEANN RAG)
 * - Memory 검색 (claude-mem)
 * - 빠른 액션
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  Settings,
  MessageSquare,
  Search,
  Sparkles,
  Brain,
  Loader2,
} from 'lucide-react'
import { useProjectsAllData } from '@/hooks/useProjects'
import { useQuery } from '@tanstack/react-query'

interface GlobalCommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate?: (item: { type: string; id?: string; projectId?: string; path?: string }) => void
  onOpenChat?: () => void
}

interface ChangeWithProject {
  id: string
  title: string
  status: string
  progress: number
  projectId: string
  projectName: string
}

interface GlobalDocResult {
  id: string
  name: string
  path: string
  projectId: string
  projectName: string
  changeId?: string
  matches: string[]
}

interface RagResult {
  score: number
  content: string
  source?: string
}

interface MemoryResult {
  id: number
  type: string
  title: string
  subtitle?: string
}

export function GlobalCommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onOpenChat,
}: GlobalCommandPaletteProps) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)

  const { data: projectsData } = useProjectsAllData()
  const activeProject = projectsData?.projects.find(
    (p) => p.id === projectsData?.activeProjectId
  )

  // Collect all changes from all projects
  const allChanges = useMemo(() => {
    if (!projectsData?.projects) return []

    const changes: ChangeWithProject[] = []
    for (const project of projectsData.projects) {
      if (project.changes) {
        for (const change of project.changes) {
          changes.push({
            id: change.id,
            title: change.title,
            status: change.progress === 100 ? 'completed' : 'active',
            progress: change.progress || 0,
            projectId: project.id,
            projectName: project.name,
          })
        }
      }
    }
    return changes
  }, [projectsData?.projects])

  // 전역 문서 검색 (모든 프로젝트)
  const { data: globalDocs = [], isLoading: isLoadingDocs } = useQuery({
    queryKey: ['global-docs-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return []
      const res = await fetch(`/api/docs/global-search?query=${encodeURIComponent(debouncedQuery)}&limit=10`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as GlobalDocResult[]
    },
    enabled: !!debouncedQuery && debouncedQuery.length >= 2 && open,
    staleTime: 5000,
  })

  // RAG 시맨틱 검색
  const { data: ragResults = [], isLoading: isLoadingRag } = useQuery({
    queryKey: ['rag-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return []
      const res = await fetch(`/api/rag/search?query=${encodeURIComponent(debouncedQuery)}&limit=5`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as RagResult[]
    },
    enabled: !!debouncedQuery && debouncedQuery.length >= 2 && open,
    staleTime: 10000,
  })

  // Memory 검색 (claude-mem)
  const { data: memoryResults = [], isLoading: isLoadingMemory } = useQuery({
    queryKey: ['memory-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return []
      const res = await fetch(`/api/memory/search?query=${encodeURIComponent(debouncedQuery)}&limit=5`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as MemoryResult[]
    },
    enabled: !!debouncedQuery && debouncedQuery.length >= 2 && open,
    staleTime: 10000,
  })

  // Filter changes based on query - search all projects
  const filteredChanges = useMemo(() => {
    if (query) {
      return allChanges.filter((c) =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.id.toLowerCase().includes(query.toLowerCase()) ||
        c.projectName.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    }
    // When no query, show recent changes from active project first, then others
    const activeProjectChanges = allChanges.filter(c => c.projectId === activeProject?.id).slice(0, 3)
    const otherChanges = allChanges.filter(c => c.projectId !== activeProject?.id).slice(0, 2)
    return [...activeProjectChanges, ...otherChanges]
  }, [query, allChanges, activeProject?.id])

  // Reset query when closing
  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  const handleSelect = useCallback((type: string, id?: string, projectId?: string, path?: string) => {
    onOpenChange(false)

    if (type === 'chat') {
      onOpenChat?.()
    } else if (type === 'change' && id) {
      onNavigate?.({ type: 'change', id, projectId: projectId || activeProject?.id })
    } else if (type === 'doc' && path) {
      onNavigate?.({ type: 'docs', id: path, projectId: projectId || activeProject?.id, path })
    } else if (type === 'settings') {
      onNavigate?.({ type: 'settings' })
    } else if (type === 'memory' && id) {
      // Memory 결과 클릭 시 (나중에 상세 보기 구현 가능)
      console.log('Memory item selected:', id)
    }
  }, [onOpenChange, onOpenChat, onNavigate, activeProject?.id])

  // Get status color
  const getStatusColor = (change: ChangeWithProject) => {
    if (change.progress === 100) return 'text-green-500'
    if (change.progress > 50) return 'text-yellow-500'
    return 'text-blue-500'
  }

  // Get memory type badge color
  const getMemoryTypeColor = (type: string) => {
    switch (type) {
      case 'decision': return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
      case 'bugfix': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
      case 'feature': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
      case 'discovery': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    }
  }

  const isSearching = isLoadingDocs || isLoadingRag || isLoadingMemory
  const hasQuery = query.length >= 2
  const hasResults = filteredChanges.length > 0 || globalDocs.length > 0 || ragResults.length > 0 || memoryResults.length > 0

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="모든 프로젝트에서 검색... (Changes, 문서, AI, Memory)"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Loading State */}
        {isSearching && hasQuery && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            <span>검색 중...</span>
          </div>
        )}

        {/* Empty State */}
        {!isSearching && hasQuery && !hasResults && (
          <CommandEmpty>
            <div className="flex flex-col items-center py-6 text-muted-foreground">
              <Search className="h-10 w-10 mb-2 opacity-50" />
              <p>검색 결과가 없습니다</p>
            </div>
          </CommandEmpty>
        )}

        {/* Quick Actions - Only when no query */}
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

        {/* Changes - All Projects */}
        {filteredChanges.length > 0 && (
          <>
            <CommandGroup heading="Changes (모든 프로젝트)">
              {filteredChanges.map((change) => (
                <CommandItem
                  key={`${change.projectId}-${change.id}`}
                  value={`change-${change.projectId}-${change.id}`}
                  onSelect={() => handleSelect('change', change.id, change.projectId)}
                >
                  <FolderGit2 className={`mr-2 h-4 w-4 ${getStatusColor(change)}`} />
                  <span className="flex-1 truncate">{change.title}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {change.projectName}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {change.progress}%
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Documents - Global Search */}
        {globalDocs.length > 0 && (
          <>
            <CommandGroup heading="문서 (모든 프로젝트)">
              {globalDocs.map((doc) => (
                <CommandItem
                  key={doc.id}
                  value={`doc-${doc.id}`}
                  onSelect={() => handleSelect('doc', doc.id, doc.projectId, doc.path)}
                >
                  <FileText className="mr-2 h-4 w-4 text-orange-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{doc.name}</span>
                      {doc.changeId && (
                        <span className="text-xs text-muted-foreground bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">
                          {doc.changeId}
                        </span>
                      )}
                    </div>
                    {doc.matches.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {doc.matches[0]}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-2">
                    {doc.projectName}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* AI Semantic Search (RAG) */}
        {ragResults.length > 0 && (
          <>
            <CommandGroup heading="AI 검색 (시맨틱)">
              {ragResults.map((result, index) => (
                <CommandItem
                  key={`rag-${index}`}
                  value={`rag-${index}-${result.content.slice(0, 20)}`}
                  onSelect={() => {
                    // RAG 결과에 source가 있으면 해당 문서로 이동
                    if (result.source) {
                      // source 경로에서 프로젝트 찾기
                      const matchingProject = projectsData?.projects.find(p =>
                        result.source?.startsWith(p.path)
                      )
                      if (matchingProject) {
                        // 프로젝트 상대 경로로 변환
                        const relativePath = result.source.replace(matchingProject.path + '/', '')
                        handleSelect('doc', result.source, matchingProject.id, relativePath)
                        return
                      }
                    }
                    // source가 없거나 프로젝트를 찾을 수 없으면 클립보드에 복사
                    navigator.clipboard.writeText(result.content)
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-purple-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{result.content.slice(0, 100)}...</p>
                    {result.source && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {result.source}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">
                    {(result.score * 100).toFixed(0)}%
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Memory Search (claude-mem) */}
        {memoryResults.length > 0 && (
          <CommandGroup heading="Memory (이전 작업 기록)">
            {memoryResults.map((memory) => (
              <CommandItem
                key={`memory-${memory.id}`}
                value={`memory-${memory.id}-${memory.title}`}
                onSelect={() => handleSelect('memory', String(memory.id))}
              >
                <Brain className="mr-2 h-4 w-4 text-cyan-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{memory.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getMemoryTypeColor(memory.type)}`}>
                      {memory.type}
                    </span>
                  </div>
                  {memory.subtitle && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {memory.subtitle}
                    </p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
