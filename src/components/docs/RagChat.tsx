/**
 * RAG Chat Component
 * 
 * 문서 기반 AI 질문-답변 채팅 인터페이스
 */

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, RefreshCw, FileText, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface RagChatProps {
  projectId: string
  className?: string
}

export function RagChat({ projectId, className }: RagChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [indexStats, setIndexStats] = useState<{ totalChunks: number; uniqueFiles: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 인덱스 통계 로드
  const loadIndexStats = async () => {
    try {
      const res = await fetch(`/api/docs/index/stats?projectId=${encodeURIComponent(projectId)}`)
      const json = await res.json()
      if (json.success) {
        setIndexStats(json.data)
      }
    } catch (error) {
      console.error('Failed to load index stats:', error)
    }
  }

  // 문서 인덱싱
  const handleIndexDocuments = async () => {
    setIsIndexing(true)
    try {
      const res = await fetch('/api/docs/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectPath: '', // 서버에서 프로젝트 경로를 자동으로 조회
        }),
      })
      const json = await res.json()
      if (json.success) {
        await loadIndexStats()
        setMessages((prev) => [
          ...prev,
          {
            id: `system-${Date.now()}`,
            role: 'assistant',
            content: `✅ 문서 인덱싱 완료!\n- 인덱싱된 파일: ${json.data.indexed}개\n- 총 청크: ${json.data.chunks}개`,
          },
        ])
      }
    } catch (error) {
      console.error('Failed to index documents:', error)
    } finally {
      setIsIndexing(false)
    }
  }

  // 메시지 전송
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // 스트리밍 응답을 위한 어시스턴트 메시지 추가
    const assistantId = `assistant-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ])

    try {
      const res = await fetch('/api/docs/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to get response')
      }

      // 스트리밍 읽기
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        fullContent += chunk

        // 메시지 업데이트
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent } : m
          )
        )
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: '❌ 오류가 발생했습니다. 다시 시도해 주세요.' }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  // 엔터키 전송 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // 스크롤 자동 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 초기 로드
  useEffect(() => {
    loadIndexStats()
  }, [projectId])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-medium">AI 문서 어시스턴트</span>
        </div>
        <div className="flex items-center gap-2">
          {indexStats && (
            <Badge variant="secondary" className="gap-1">
              <Database className="h-3 w-3" />
              {indexStats.uniqueFiles}개 파일 / {indexStats.totalChunks}개 청크
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleIndexDocuments}
            disabled={isIndexing}
          >
            {isIndexing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            인덱싱
          </Button>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">문서에 대해 질문해 보세요</p>
            <p className="text-sm text-center max-w-sm">
              프로젝트 문서를 기반으로 답변해 드립니다.
              <br />
              먼저 "인덱싱" 버튼을 눌러 문서를 인덱싱해 주세요.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-4 py-3',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                {message.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content || '...'}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-background">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="문서에 대해 질문해 보세요... (Shift+Enter로 줄바꿈)"
            className="min-h-[44px] max-h-[200px] resize-none"
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
