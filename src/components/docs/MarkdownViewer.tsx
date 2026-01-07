import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MarkdownViewerProps {
  content: string
  className?: string
  projectPath?: string
  currentDocPath?: string // 현재 문서 경로 (상대 링크 계산용)
  onNavigate?: (docPath: string) => void // 내부 링크 클릭 시 호출
}

// Mermaid 컴포넌트
function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const id = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`).current

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'inherit',
    })

    const render = async () => {
      try {
        const { svg } = await mermaid.render(id, code)
        setSvg(svg)
        setError(null)
      } catch (err) {
        console.error('Mermaid render error:', err)
        setError('Diagram render failed')
      }
    }

    render()
  }, [code, id])

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-500 text-sm rounded border border-red-200">
        {error}
        <pre className="mt-2 text-xs text-foreground/50 overflow-auto">{code}</pre>
      </div>
    )
  }

  return (
    <div
      className="my-6 flex justify-center bg-white p-4 rounded-lg border shadow-sm dark:bg-zinc-900 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// 코드 블록 컴포넌트 (복사 기능 포함)
function CodeBlock({
  className,
  children,
  ...props
}: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>) {
  const [copied, setCopied] = useState(false)
  const codeContent = String(children).replace(/\n$/, '')
  const language = /language-(\w+)/.exec(className || '')?.[1]

  // Mermaid 언어 감지
  if (language === 'mermaid') {
    return <MermaidDiagram code={codeContent} />
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isInline = !className

  if (isInline) {
    return (
      <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono text-pink-600 dark:text-pink-400" {...props}>
        {children}
      </code>
    )
  }

  return (
    <div className="group relative my-4 rounded-lg border bg-zinc-950 text-zinc-50 dark:bg-zinc-900">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 rounded-t-lg">
        <span className="text-xs text-zinc-400 font-mono">
          {language || 'text'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div className="p-4 overflow-x-auto">
        <code className={cn('text-sm font-mono', className)} {...props}>
          {children}
        </code>
      </div>
    </div>
  )
}

/**
 * 상대 경로를 절대 경로로 변환
 * @param basePath 현재 문서 경로 (예: docs/guide/intro.md)
 * @param relativePath 상대 링크 경로 (예: ../api/ref.md)
 */
function resolveRelativePath(basePath: string, relativePath: string): string {
  // 이미 절대 경로면 그대로 반환
  if (relativePath.startsWith('/')) {
    return relativePath.slice(1)
  }

  // basePath에서 디렉토리 경로 추출
  const baseParts = basePath.split('/')
  baseParts.pop() // 파일명 제거

  const relativeParts = relativePath.split('/')
  
  for (const part of relativeParts) {
    if (part === '..') {
      baseParts.pop()
    } else if (part !== '.' && part !== '') {
      baseParts.push(part)
    }
  }

  return baseParts.join('/')
}

export function MarkdownViewer({ 
  content, 
  className, 
  currentDocPath,
  onNavigate 
}: MarkdownViewerProps) {
  // 내부 링크인지 확인
  const isInternalLink = (href: string): boolean => {
    if (!href) return false
    if (href.startsWith('http://') || href.startsWith('https://')) return false
    if (href.startsWith('mailto:')) return false
    if (href.startsWith('#')) return false // 앵커 링크
    // .md 파일이거나, 경로가 ./ 또는 ../ 로 시작하면 내부 링크
    return href.endsWith('.md') || href.startsWith('./') || href.startsWith('../')
  }

  // 내부 링크 클릭 핸들러
  const handleInternalLinkClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault()
    
    if (!onNavigate) return
    
    // 상대 경로 해결
    let targetPath = href
    if (currentDocPath && (href.startsWith('./') || href.startsWith('../'))) {
      targetPath = resolveRelativePath(currentDocPath, href)
    }
    
    // .md 확장자가 없으면 추가
    if (!targetPath.endsWith('.md')) {
      targetPath += '.md'
    }
    
    onNavigate(targetPath)
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={cn(
        'prose prose-zinc dark:prose-invert max-w-none',
        'prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-6 prose-h1:pb-2 prose-h1:border-b',
        'prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-4',
        'prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3',
        'prose-p:leading-7 prose-p:my-4',
        'prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6',
        'prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline',
        'prose-blockquote:border-l-4 prose-blockquote:border-blue-500/30 prose-blockquote:bg-blue-50/20 prose-blockquote:py-1 prose-blockquote:pl-4 prose-blockquote:italic',
        'prose-img:rounded-lg prose-img:shadow-md prose-img:max-h-[600px] prose-img:mx-auto',
        className
      )}
      components={{
        code: CodeBlock,
        a: ({ href, children }) => {
          const isExternal = href?.startsWith('http')
          const isInternal = href ? isInternalLink(href) : false
          
          if (isInternal && onNavigate) {
            return (
              <a
                href={href}
                onClick={(e) => handleInternalLinkClick(e, href!)}
                className="inline-flex items-center gap-0.5 cursor-pointer text-blue-500 hover:underline"
              >
                {children}
              </a>
            )
          }
          
          return (
            <a
              href={href}
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center gap-0.5"
            >
              {children}
              {isExternal && <ExternalLink className="h-3 w-3 opacity-50" />}
            </a>
          )
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

