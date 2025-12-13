import { useEffect, useRef, useState, useCallback } from 'react'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'

// Initialize mermaid with default config
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
  },
})

export interface MermaidRendererProps {
  /** Mermaid diagram code */
  code: string
  /** Optional className for container */
  className?: string
  /** Theme override */
  theme?: 'default' | 'dark' | 'forest' | 'neutral'
  /** Callback when a node is clicked */
  onNodeClick?: (nodeId: string, path: string) => void
  /** Callback on render error */
  onError?: (error: Error) => void
  /** Callback on successful render */
  onRender?: () => void
}

export function MermaidRenderer({
  code,
  className,
  theme = 'default',
  onNodeClick,
  onError,
  onRender,
}: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)

  // Handle click events from diagram
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (!onNodeClick) return

      // Extract path from click event in the code
      const clickMatch = code.match(new RegExp(`click ${nodeId} "([^"]+)"`))
      if (clickMatch) {
        onNodeClick(nodeId, clickMatch[1])
      }
    },
    [code, onNodeClick]
  )

  // Expose click handler globally for mermaid
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).mermaidClickHandler = handleNodeClick
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).mermaidClickHandler
    }
  }, [handleNodeClick])

  // Render diagram
  useEffect(() => {
    if (!containerRef.current || !code.trim()) return

    const renderDiagram = async () => {
      setIsRendering(true)
      setError(null)

      try {
        // Update mermaid theme
        mermaid.initialize({
          startOnLoad: false,
          theme: theme,
          securityLevel: 'loose',
        })

        // Clear previous content
        containerRef.current!.innerHTML = ''

        // Generate unique ID
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`

        // Process code to add click handlers
        let processedCode = code
        if (onNodeClick) {
          // Replace click events with JavaScript callbacks
          processedCode = code.replace(
            /click (\w+) "([^"]+)"/g,
            'click $1 call mermaidClickHandler("$1")'
          )
        }

        // Render
        const { svg } = await mermaid.render(id, processedCode)
        containerRef.current!.innerHTML = svg

        onRender?.()
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error.message)
        onError?.(error)
      } finally {
        setIsRendering(false)
      }
    }

    renderDiagram()
  }, [code, theme, onNodeClick, onError, onRender])

  if (error) {
    return (
      <div
        className={cn(
          'p-4 rounded-lg border border-destructive bg-destructive/10',
          className
        )}
      >
        <p className="text-sm font-medium text-destructive">
          다이어그램 렌더링 오류
        </p>
        <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
          {error}
        </pre>
        <details className="mt-4">
          <summary className="text-xs text-muted-foreground cursor-pointer">
            원본 코드 보기
          </summary>
          <pre className="mt-2 p-2 text-xs bg-muted rounded overflow-auto max-h-48">
            {code}
          </pre>
        </details>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
      <div
        ref={containerRef}
        className="mermaid-container [&_svg]:max-w-full [&_svg]:h-auto"
      />
    </div>
  )
}
