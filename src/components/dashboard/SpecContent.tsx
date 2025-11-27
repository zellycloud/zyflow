import { useState } from 'react'
import { useSpecContent } from '@/hooks/useSpecs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { Loader2, Code, Eye, Book } from 'lucide-react'

interface SpecContentProps {
  specId: string
}

export function SpecContent({ specId }: SpecContentProps) {
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered')
  const { data: content, isLoading, error } = useSpecContent(specId)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Book className="h-12 w-12" />
        <p>스펙을 불러올 수 없습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Book className="h-5 w-5 text-primary" />
          {specId}
        </h2>
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
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {specId}/spec.md
          </CardTitle>
        </CardHeader>
        <CardContent>
          {viewMode === 'rendered' ? (
            <Markdown content={content || ''} />
          ) : (
            <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/50 p-4 rounded-md overflow-x-auto">
              {content}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
