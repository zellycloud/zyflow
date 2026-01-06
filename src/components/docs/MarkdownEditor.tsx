import { useState, useEffect } from 'react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'
import { Button } from '@/components/ui/button'
import { Save, X } from 'lucide-react'
import { useSaveDocContent } from '@/hooks/useDocs'

interface MarkdownEditorProps {
  content: string
  projectPath: string
  docPath: string
  onCancel: () => void
  onSave?: () => void
}

export function MarkdownEditor({
  content: initialContent,
  projectPath,
  docPath,
  onCancel,
  onSave,
}: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent)
  const { mutate: saveDoc, isPending } = useSaveDocContent()
  
  // 초기 테마 설정 (SSR 안전하게 처리하되 여기선 SPA라 document 접근 가능)
  // useState 초기값 함수 내에서 document 접근은 안전함 (클라이언트 렌더링 시)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    }
    return 'light'
  })

  // 다크모드 감지 (변경 사항만 감지)
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark')
          setTheme(isDark ? 'dark' : 'light')
        }
      })
    })

    observer.observe(document.documentElement, { attributes: true })
    return () => observer.disconnect()
  }, [])

  const handleSave = () => {
    saveDoc(
      { projectPath, docPath, content },
      {
        onSuccess: () => {
          onSave?.()
        },
      }
    )
  }

  return (
    <div className="flex flex-col h-full" data-color-mode={theme}>
      <div className="flex items-center justify-between p-2 border-b bg-background/50">
        <span className="text-sm font-medium text-muted-foreground px-2">
           편집 모드
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
            <X className="w-4 h-4 mr-1" />
            취소
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            <Save className="w-4 h-4 mr-1" />
            {isPending ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <MDEditor
          value={content}
          onChange={(val) => setContent(val || '')}
          height="100%"
          style={{ borderRadius: 0 }}
          preview="live"
        />
      </div>
    </div>
  )
}
