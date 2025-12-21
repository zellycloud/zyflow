import { useState, useMemo } from 'react'
import {
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  BookOpen,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { useDocsList, useDocContent, flattenDocTree, type DocItem } from '@/hooks/useDocs'
import { cn } from '@/lib/utils'

interface DocsViewerProps {
  projectPath: string
}

interface DocTreeItemProps {
  item: DocItem
  level: number
  selectedPath: string | null
  onSelect: (path: string) => void
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
}

function DocTreeItem({
  item,
  level,
  selectedPath,
  onSelect,
  expandedFolders,
  onToggleFolder,
}: DocTreeItemProps) {
  const isFolder = item.type === 'folder'
  const isExpanded = expandedFolders.has(item.path)
  const isSelected = selectedPath === item.path

  return (
    <div>
      <button
        onClick={() => {
          if (isFolder) {
            onToggleFolder(item.path)
          } else {
            onSelect(item.path)
          }
        }}
        className={cn(
          'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left',
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted text-foreground',
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isExpanded ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="size-4 shrink-0 text-blue-500" />
            ) : (
              <Folder className="size-4 shrink-0 text-blue-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <FileText className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{item.name}</span>
      </button>

      {isFolder && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <DocTreeItem
              key={child.id}
              item={child}
              level={level + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function DocsViewer({ projectPath }: DocsViewerProps) {
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(['docs'])
  )
  const [searchQuery, setSearchQuery] = useState('')

  const { data: docsList, isLoading: isListLoading } = useDocsList(projectPath)
  const { data: docContent, isLoading: isContentLoading } = useDocContent(
    projectPath,
    selectedDocPath ?? undefined
  )

  // 검색 필터링
  const filteredDocs = useMemo(() => {
    if (!docsList || !searchQuery.trim()) return docsList || []

    const query = searchQuery.toLowerCase()
    const allFiles = flattenDocTree(docsList)
    const matchingPaths = new Set<string>()

    // 매칭되는 파일 찾기
    for (const file of allFiles) {
      if (
        file.name.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query)
      ) {
        matchingPaths.add(file.path)
        // 부모 폴더도 추가
        const parts = file.path.split('/')
        for (let i = 1; i < parts.length; i++) {
          matchingPaths.add(parts.slice(0, i).join('/'))
        }
      }
    }

    // 필터링된 트리 생성
    function filterTree(items: DocItem[]): DocItem[] {
      const result: DocItem[] = []
      for (const item of items) {
        if (item.type === 'file') {
          if (matchingPaths.has(item.path)) {
            result.push(item)
          }
        } else if (item.type === 'folder') {
          const filteredChildren = filterTree(item.children || [])
          if (filteredChildren.length > 0 || matchingPaths.has(item.path)) {
            result.push({ ...item, children: filteredChildren })
          }
        }
      }
      return result
    }

    return filterTree(docsList)
  }, [docsList, searchQuery])

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // README 자동 선택
  useMemo(() => {
    if (docsList && docsList.length > 0 && !selectedDocPath) {
      const readme = docsList.find(
        (d) => d.type === 'file' && d.name.toLowerCase() === 'readme'
      )
      if (readme) {
        setSelectedDocPath(readme.path)
      }
    }
  }, [docsList, selectedDocPath])

  if (isListLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!docsList || docsList.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <BookOpen className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg">문서가 없습니다</p>
        <p className="text-sm mt-1">
          /docs 폴더나 README.md 파일을 추가해보세요
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4">
      {/* 문서 트리 사이드바 */}
      <div className="w-64 flex-shrink-0 border-r">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="문서 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <ScrollArea className="h-[calc(100%-57px)]">
          <div className="p-2">
            {filteredDocs.map((item) => (
              <DocTreeItem
                key={item.id}
                item={item}
                level={0}
                selectedPath={selectedDocPath}
                onSelect={setSelectedDocPath}
                expandedFolders={expandedFolders}
                onToggleFolder={toggleFolder}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* 문서 내용 뷰어 */}
      <div className="flex-1 overflow-hidden">
        {selectedDocPath ? (
          isContentLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : docContent ? (
            <ScrollArea className="h-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4 pb-4 border-b">
                  <div>
                    <h1 className="text-2xl font-bold">{docContent.name}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      {docContent.path}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // VS Code에서 열기 (file:// 프로토콜)
                      const fullPath = `${projectPath}/${docContent.path}`
                      window.open(`vscode://file${fullPath}`, '_blank')
                    }}
                  >
                    <ExternalLink className="size-4 mr-1" />
                    에디터에서 열기
                  </Button>
                </div>
                <Markdown content={docContent.content} />
              </div>
            </ScrollArea>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>문서를 불러올 수 없습니다</p>
            </div>
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg">문서를 선택하세요</p>
            <p className="text-sm mt-1">왼쪽에서 문서를 선택하여 내용을 확인하세요</p>
          </div>
        )}
      </div>
    </div>
  )
}
