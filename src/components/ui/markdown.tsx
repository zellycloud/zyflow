import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  content: string
  className?: string
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={cn('prose prose-sm dark:prose-invert max-w-none', className)}
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold mt-5 mb-3">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-medium mt-3 mb-2 text-muted-foreground">{children}</h4>
        ),
        p: ({ children }) => (
          <p className="my-2 leading-relaxed">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...props}>
                {children}
              </code>
            )
          }
          return (
            <code className={cn('block p-4 rounded-md bg-muted text-sm font-mono overflow-x-auto', className)} {...props}>
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="my-3 rounded-md bg-muted overflow-x-auto">{children}</pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 pl-4 border-l-4 border-primary/30 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto">
            <table className="w-full border-collapse border border-border">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 border border-border bg-muted font-semibold text-left">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 border border-border">{children}</td>
        ),
        a: ({ href, children }) => (
          <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        hr: () => <hr className="my-6 border-border" />,
        // Checkbox for task lists
        input: ({ type, checked, ...props }) => {
          if (type === 'checkbox') {
            return (
              <input
                type="checkbox"
                checked={checked}
                readOnly
                className="mr-2 h-4 w-4 rounded border-border"
                {...props}
              />
            )
          }
          return <input type={type} {...props} />
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
