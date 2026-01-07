import { useState, useMemo, useEffect } from 'react'
import {
  FileText,
  Search,
  BookOpen,
  Loader2,
  ExternalLink,
  MessageSquare,
  PanelRightClose,
  X,
  Edit2, // 편집 아이콘 추가
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useDocsList, useDocContent, flattenDocTree, type DocItem } from '@/hooks/useDocs'
import { DocTreeItem } from './DocTree'
import { MarkdownViewer } from './MarkdownViewer'
import { MarkdownEditor } from './MarkdownEditor' // 에디터 import
import { RagChat } from './RagChat' // RAG 채팅 import
import { cn } from '@/lib/utils'
import { useProjects } from '@/hooks/useProjects'

interface DocsViewerProps {
  projectPath: string
  remote?: { serverId: string }
  onClose?: () => void
}

export function DocsViewer({ projectPath, remote, onClose }: DocsViewerProps) {
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(['docs', 'openspec'])
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [showChatPanel, setShowChatPanel] = useState(false)
  const [isEditing, setIsEditing] = useState(false) // 편집 모드 상태

  // 활성 프로젝트 ID 가져오기 (RAG용)
  const { data: projectsData } = useProjects()
  const projectId = projectsData?.activeProjectId || ''

  const { data: docsList, isLoading: isListLoading } = useDocsList(projectPath, remote)
  const { data: docContent, isLoading: isContentLoading } = useDocContent(
    projectPath,
    selectedDocPath ?? undefined,
    remote
  )

  // 문서 변경 시 편집 모드 자동 해제
  useEffect(() => {
    setIsEditing(false)
  }, [selectedDocPath])

  // 검색 필터링 로직
  const filteredDocs = useMemo(() => {
    if (!docsList || !searchQuery.trim()) return docsList || []

    const query = searchQuery.toLowerCase()
    const allFiles = flattenDocTree(docsList)
    const matchingPaths = new Set<string>()

    for (const file of allFiles) {
      if (
        file.name.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query)
      ) {
        matchingPaths.add(file.path)
        const parts = file.path.split('/')
        for (let i = 1; i < parts.length; i++) {
          matchingPaths.add(parts.slice(0, i).join('/'))
        }
      }
    }

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

  // 초기 로딩 시 README 자동 선택
  const [initReadme, setInitReadme] = useState(false)
  if (!initReadme && docsList && docsList.length > 0 && !selectedDocPath) {
     const readme = docsList.find(
        (d) => d.type === 'file' && d.name.toLowerCase() === 'readme'
      )
      if (readme) {
        setSelectedDocPath(readme.path)
      }
      setInitReadme(true)
  }

  if (isListLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!docsList || docsList.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground relative">
        <div className="absolute top-4 right-4">
           {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
        <BookOpen className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg">문서가 없습니다</p>
        <p className="text-sm mt-1">
          /docs 폴더나 README.md 파일을 추가해보세요
        </p>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-background overflow-hidden flex">
      {/* 사이드바: 문서 트리 (고정 너비) */}
      <aside className="w-64 border-r flex flex-col bg-muted/10 shrink-0">
        <div className="p-3 border-b shrink-0 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="문서 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 bg-background"
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
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
      </aside>

      {/* 메인: 문서 뷰어 / 에디터 */}
      <div className="flex-1 flex flex-col relative bg-white dark:bg-zinc-950 min-w-0">
         {selectedDocPath && docContent ? (
           isEditing ? (
             // 편집 모드
             <MarkdownEditor
               projectPath={projectPath}
               docPath={docContent.path}
               content={docContent.content}
               onCancel={() => setIsEditing(false)}
               onSave={() => setIsEditing(false)}
             />
           ) : (
             // 뷰어 모드
             <>
               {/* 문서 헤더 */}
               <div className="flex items-center justify-between px-6 py-3 border-b bg-background/80 backdrop-blur shrink-0 sticky top-0 z-10 w-full">
                 <div className="flex-1 min-w-0 mr-4">
                   <h1 className="text-lg font-bold truncate flex items-center gap-2">
                     <FileText className="h-4 w-4 text-muted-foreground" />
                     {docContent.name}
                   </h1>
                   <div className="flex items-center text-xs text-muted-foreground mt-0.5 space-x-2">
                      <span className="truncate max-w-[300px]">{docContent.path}</span>
                      <span>•</span>
                      <span>{new Date(docContent.lastModified).toLocaleDateString()}</span>
                   </div>
                 </div>
                 <div className="flex items-center gap-1 shrink-0">
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={() => setShowChatPanel(!showChatPanel)}
                     className={cn("h-8 px-2 gap-1.5", showChatPanel && "bg-accent text-accent-foreground")}
                     title={showChatPanel ? "AI 채팅 닫기" : "AI 채팅 열기 (RAG)"}
                   >
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs hidden sm:inline">질문하기</span>
                   </Button>
                   
                   {/* 편집 버튼 추가 */}
                   <Button
                     variant="ghost"
                     size="sm"
                     className="h-8 px-2 gap-1.5"
                     onClick={() => setIsEditing(true)}
                     title="문서 편집"
                   >
                     <Edit2 className="size-3.5" />
                     <span className="text-xs hidden sm:inline">편집</span>
                   </Button>

                   <Button
                     variant="ghost"
                     size="sm"
                     className="h-8 px-2 gap-1.5"
                     onClick={() => {
                       const fullPath = `${projectPath}/${docContent.path}`
                       window.open(`vscode://file/${fullPath}`, '_blank')
                     }}
                     title="VS Code에서 열기"
                   >
                     <ExternalLink className="size-3.5" />
                     <span className="text-xs hidden sm:inline">Code</span>
                   </Button>
                   
                   {/* 구분선 */}
                   <div className="w-px h-4 bg-border mx-1" />
                   
                   {/* 닫기 버튼 */}
                   {onClose && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="문서 닫기">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                 </div>
               </div>

               {/* 문서 본문 */}
               <div className="flex-1 overflow-hidden relative">
                 {isContentLoading ? (
                   <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
                     <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                   </div>
                 ) : (
                  <ScrollArea className="h-full w-full">
                    <div className="px-8 py-8 max-w-4xl mx-auto pb-32 min-h-full">
                      <MarkdownViewer 
                        content={docContent.content}
                        currentDocPath={docContent.path}
                        onNavigate={(targetPath) => {
                          // 내부 링크 클릭 시 해당 문서로 이동
                          setSelectedDocPath(targetPath)
                        }}
                        className="min-h-[500px]" 
                      />
                    </div>
                  </ScrollArea>
                 )}
               </div>
             </>
           )
         ) : (
           <div className="flex h-full flex-col items-center justify-center text-muted-foreground relative">
              <div className="absolute top-3 right-3">
                {onClose && (
                  <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </div>
             <FileText className="h-16 w-16 mb-4 opacity-20" />
             <p className="text-lg font-medium">문서를 선택하세요</p>
             <p className="text-sm mt-1 opacity-70">왼쪽 탐색기에서 문서를 선택하여 내용을 확인하세요</p>
           </div>
         )}
      </div>

      {/* 우측: AI 채팅 패널 (RAG) */}
      {showChatPanel && (
        <aside className="w-96 border-l bg-muted/10 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b flex items-center justify-between shrink-0 h-[57px] bg-background">
              <span className="font-semibold text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                문서 Q&A
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowChatPanel(false)}>
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
            
            {projectId ? (
              <RagChat projectId={projectId} className="flex-1" />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">프로젝트를 선택해 주세요</p>
              </div>
            )}
        </aside>
      )}
    </div>
  )
}
