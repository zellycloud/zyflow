import { useState, useEffect, useMemo, useCallback } from 'react'
import { FileText, Search, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDocsList, flattenDocTree, type DocItem } from '@/hooks/useDocs'
import { cn } from '@/lib/utils'

interface DocsCommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectPath?: string
  onSelectDoc: (docPath: string) => void
}

export function DocsCommandPalette({
  open,
  onOpenChange,
  projectPath,
  onSelectDoc,
}: DocsCommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { data: docsList, isLoading } = useDocsList(projectPath)

  // 모든 문서 파일 목록
  const allDocs = useMemo(() => {
    if (!docsList) return []
    return flattenDocTree(docsList)
  }, [docsList])

  // 필터링된 문서 목록
  const filteredDocs = useMemo(() => {
    if (!query.trim()) return allDocs
    const lowerQuery = query.toLowerCase()
    return allDocs.filter(
      (doc) =>
        doc.name.toLowerCase().includes(lowerQuery) ||
        doc.path.toLowerCase().includes(lowerQuery)
    )
  }, [allDocs, query])

  // 선택 인덱스 리셋
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, filteredDocs.length])

  // 다이얼로그 열릴 때 쿼리 초기화
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  // 키보드 네비게이션
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev < filteredDocs.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredDocs[selectedIndex]) {
            onSelectDoc(filteredDocs[selectedIndex].path)
            onOpenChange(false)
          }
          break
        case 'Escape':
          onOpenChange(false)
          break
      }
    },
    [filteredDocs, selectedIndex, onSelectDoc, onOpenChange]
  )

  const handleSelectDoc = (doc: DocItem) => {
    onSelectDoc(doc.path)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>문서 검색</DialogTitle>
        </DialogHeader>
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="문서 검색... (이름 또는 경로)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
        </div>
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {query ? '검색 결과가 없습니다' : '문서가 없습니다'}
            </div>
          ) : (
            <div className="p-2">
              {filteredDocs.map((doc, index) => (
                <button
                  key={doc.id}
                  onClick={() => handleSelectDoc(doc)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-md text-left transition-colors',
                    index === selectedIndex
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{doc.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {doc.path}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted">↑↓</kbd> 탐색
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted">Enter</kbd> 선택
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted">Esc</kbd> 닫기
            </span>
          </div>
          <div>
            {filteredDocs.length}개 문서
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
