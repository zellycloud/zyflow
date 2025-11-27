import { useState } from 'react'
import { useSpecs, useSpecContent } from '@/hooks/useSpecs'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { FileText, Loader2, ChevronLeft, Book, Code, Eye } from 'lucide-react'

interface SpecsViewerProps {
  onBack: () => void
}

export function SpecsViewer({ onBack }: SpecsViewerProps) {
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered')
  const { data: specs, isLoading: specsLoading } = useSpecs()
  const { data: specContent, isLoading: contentLoading } = useSpecContent(selectedSpecId)

  if (specsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Book className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Specs 뷰어</h2>
          {selectedSpecId && (
            <span className="text-sm text-muted-foreground">/ {selectedSpecId}</span>
          )}
        </div>

        {/* View Mode Toggle */}
        {selectedSpecId && (
          <div className="flex items-center gap-1 rounded-md border p-1">
            <Button
              variant={viewMode === 'rendered' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('rendered')}
              className="gap-1.5 h-7 px-2"
            >
              <Eye className="h-3.5 w-3.5" />
              Rendered
            </Button>
            <Button
              variant={viewMode === 'raw' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('raw')}
              className="gap-1.5 h-7 px-2"
            >
              <Code className="h-3.5 w-3.5" />
              Raw
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Specs List */}
        <aside className="w-64 border-r bg-sidebar">
          <ScrollArea className="h-full">
            <div className="p-4">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Capabilities ({specs?.length || 0})
              </h3>
              <div className="space-y-1">
                {specs?.map((spec) => (
                  <button
                    key={spec.id}
                    onClick={() => setSelectedSpecId(spec.id)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                      'hover:bg-accent',
                      selectedSpecId === spec.id && 'bg-accent font-medium'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{spec.id}</span>
                    </div>
                    {spec.requirementsCount > 0 && (
                      <span className="ml-6 text-xs text-muted-foreground">
                        {spec.requirementsCount} requirements
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* Spec Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {selectedSpecId ? (
            contentLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedSpecId}/spec.md</CardTitle>
                </CardHeader>
                <CardContent>
                  {viewMode === 'rendered' ? (
                    <Markdown content={specContent || ''} />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/50 p-4 rounded-md overflow-x-auto">
                      {specContent}
                    </pre>
                  )}
                </CardContent>
              </Card>
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Book className="h-12 w-12" />
              <p>스펙을 선택하세요</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
