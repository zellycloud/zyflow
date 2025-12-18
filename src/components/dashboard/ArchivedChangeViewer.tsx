import { useArchivedChangeDetail } from '@/hooks/useArchivedChanges'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, FileText, ListTodo, BookOpen, FolderArchive } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ArchivedChangeViewerProps {
  changeId: string | null
}

export function ArchivedChangeViewer({ changeId }: ArchivedChangeViewerProps) {
  const { data: detail, isLoading, error } = useArchivedChangeDetail(changeId)

  if (!changeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FolderArchive className="h-12 w-12" />
        <p className="text-sm">아카이브된 변경 제안을 선택하세요</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-destructive">
        문서를 불러올 수 없습니다
      </div>
    )
  }

  if (!detail) {
    return null
  }

  const fileNames = Object.keys(detail.files)
  const hasProposal = fileNames.includes('proposal.md')
  const hasTasks = fileNames.includes('tasks.md')
  const hasDesign = fileNames.includes('design.md')
  const specFiles = fileNames.filter((f) => f.startsWith('specs/'))
  const otherFiles = fileNames.filter(
    (f) => !['proposal.md', 'tasks.md', 'design.md'].includes(f) && !f.startsWith('specs/')
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 헤더 - 고정 */}
      <div className="border-b p-4 shrink-0">
        <h2 className="text-lg font-semibold truncate">{changeId}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {fileNames.length}개 파일
        </p>
      </div>

      {/* 탭 컨텐츠 영역 */}
      <Tabs
        defaultValue={hasProposal ? 'proposal' : hasTasks ? 'tasks' : fileNames[0]}
        className="flex-1 flex flex-col min-h-0"
      >
        {/* 탭 목록 - 고정 */}
        <div className="border-b px-4 shrink-0">
          <TabsList className="h-10 bg-transparent">
            {hasProposal && (
              <TabsTrigger value="proposal" className="gap-1.5">
                <FileText className="h-4 w-4" />
                제안서
              </TabsTrigger>
            )}
            {hasTasks && (
              <TabsTrigger value="tasks" className="gap-1.5">
                <ListTodo className="h-4 w-4" />
                작업
              </TabsTrigger>
            )}
            {hasDesign && (
              <TabsTrigger value="design" className="gap-1.5">
                <BookOpen className="h-4 w-4" />
                설계
              </TabsTrigger>
            )}
            {specFiles.length > 0 && (
              <TabsTrigger value="specs" className="gap-1.5">
                <FileText className="h-4 w-4" />
                스펙 ({specFiles.length})
              </TabsTrigger>
            )}
            {otherFiles.length > 0 && (
              <TabsTrigger value="other" className="gap-1.5">
                기타 ({otherFiles.length})
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* 탭 컨텐츠 - 스크롤 가능 영역 */}
        {hasProposal && (
          <TabsContent value="proposal" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <article className="prose prose-sm dark:prose-invert max-w-none p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detail.files['proposal.md']}
                </ReactMarkdown>
              </article>
            </ScrollArea>
          </TabsContent>
        )}

        {hasTasks && (
          <TabsContent value="tasks" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <article className="prose prose-sm dark:prose-invert max-w-none p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detail.files['tasks.md']}
                </ReactMarkdown>
              </article>
            </ScrollArea>
          </TabsContent>
        )}

        {hasDesign && (
          <TabsContent value="design" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <article className="prose prose-sm dark:prose-invert max-w-none p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detail.files['design.md']}
                </ReactMarkdown>
              </article>
            </ScrollArea>
          </TabsContent>
        )}

        {specFiles.length > 0 && (
          <TabsContent value="specs" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-6 p-4">
                {specFiles.map((fileName) => (
                  <div key={fileName}>
                    <h3 className="text-sm font-medium mb-2 text-muted-foreground">
                      {fileName.replace('specs/', '')}
                    </h3>
                    <article className="prose prose-sm dark:prose-invert max-w-none border rounded-lg p-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {detail.files[fileName]}
                      </ReactMarkdown>
                    </article>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        )}

        {otherFiles.length > 0 && (
          <TabsContent value="other" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-6 p-4">
                {otherFiles.map((fileName) => (
                  <div key={fileName}>
                    <h3 className="text-sm font-medium mb-2 text-muted-foreground">
                      {fileName}
                    </h3>
                    <article className="prose prose-sm dark:prose-invert max-w-none border rounded-lg p-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {detail.files[fileName]}
                      </ReactMarkdown>
                    </article>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
