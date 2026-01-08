/**
 * Chat Panel Component
 *
 * Collapsible right-side chat panel for AI agent interaction
 */

import { useState, useRef, useEffect } from 'react'
import {
  Bot,
  Send,
  Loader2,
  StopCircle,
  RefreshCw,
  User,
  ChevronDown,
  MessageSquare,
  History,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Circle,
  ArrowLeft,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAgentSession, useAgentSessions, AgentMessage, AgentSessionState } from '@/hooks/useAgentSession'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useProjectsAllData } from '@/hooks/useProjects'
import { projectApiUrl, cliApiUrl } from '@/config/api'
import { RightResizableSidebar } from '@/components/ui/right-resizable-sidebar'

interface ChatPanelProps {
  className?: string
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

interface Change {
  id: string
  title: string
  status: string
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isError = message.role === 'error'
  const isAgent = message.role === 'agent'

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg text-sm',
        isUser && 'bg-primary/10 ml-8',
        !isUser && !isSystem && !isError && 'bg-muted mr-8',
        isSystem && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        isError && 'bg-red-500/10 text-red-600 dark:text-red-400'
      )}
    >
      {!isUser && (
        <div className="shrink-0 flex flex-col items-center gap-1">
          {isAgent && message.cli?.icon ? (
            <span className="text-base" title={message.cli.name}>{message.cli.icon}</span>
          ) : (
            <Bot className="w-4 h-4 text-primary" />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {/* CLI name badge for agent messages */}
        {isAgent && message.cli && (
          <div className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <span className="bg-muted px-1.5 py-0.5 rounded">{message.cli.name}</span>
          </div>
        )}
        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
          {message.content}
        </div>
        {message.timestamp && (
          <div className="text-xs text-muted-foreground mt-1">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
      {isUser && (
        <div className="shrink-0">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

function getStatusIcon(status: AgentSessionState['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-red-500" />
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
    case 'stopped':
      return <Circle className="w-3.5 h-3.5 text-yellow-500" />
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground" />
  }
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '방금 전'
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString()
}

interface SessionHistoryProps {
  sessions: AgentSessionState[]
  onSelect: (sessionId: string) => void
  onDelete: (sessionId: string) => void
  onBack: () => void
  onNewChat: () => void
}

function SessionHistory({ sessions, onSelect, onDelete, onBack, onNewChat }: SessionHistoryProps) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(cliApiUrl.session(sessionId), {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete session')
      return sessionId
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['agent-sessions'] })
      onDelete(sessionId)
    },
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="font-medium text-sm">대화 기록</span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewChat}>
                <Plus className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>새 대화</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Session List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              대화 기록이 없습니다
            </div>
          ) : (
            [...sessions]
              .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
              .map((session) => (
              <div
                key={session.session_id}
                className="group flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                onClick={() => onSelect(session.session_id)}
              >
                <div className="mt-0.5">{getStatusIcon(session.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">
                      {session.change_id}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(session.updated_at)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {session.completed_tasks}/{session.total_tasks} tasks
                    {session.current_task && (
                      <span className="ml-1">• {session.current_task}</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteMutation.mutate(session.session_id)
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export function ChatPanel({ className, collapsed, onCollapsedChange }: ChatPanelProps) {
  const [showHistory, setShowHistory] = useState(false)
  const [selectedChangeId, setSelectedChangeId] = useState<string | undefined>()
  const [loadedSessionId, setLoadedSessionId] = useState<string | undefined>()
  const [input, setInput] = useState('')
  const [globalMessages, setGlobalMessages] = useState<Array<{role: 'user' | 'assistant'; content: string}>>([])
  const [isGlobalChatLoading, setIsGlobalChatLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 전역 채팅 모드: Change 선택 없이 일반 질문
  const isGlobalChatMode = !selectedChangeId

  const { data: projectsData } = useProjectsAllData()
  const activeProject = projectsData?.projects.find(
    (p) => p.id === projectsData.activeProjectId
  )

  // Fetch all sessions for history
  const { data: sessions = [] } = useAgentSessions()

  // Fetch available changes for the active project
  const { data: changes } = useQuery({
    queryKey: ['project-changes', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const res = await fetch(projectApiUrl.changes(activeProject.id))
      if (!res.ok) return []
      const data = await res.json()
      return data.changes as Change[]
    },
    enabled: !!activeProject?.id,
  })

  const {
    sessionId,
    messages,
    status,
    isStreaming,
    error,
    startSession,
    stopSession,
    resumeSession,
    sendMessage,
  } = useAgentSession(loadedSessionId)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isStreaming || isGlobalChatLoading) return

    const message = input.trim()
    setInput('')

    if (isGlobalChatMode) {
      // 전역 채팅 모드: Claude API 직접 호출
      setGlobalMessages(prev => [...prev, { role: 'user', content: message }])
      setIsGlobalChatLoading(true)
      
      try {
        const res = await fetch('/api/chat/global', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...globalMessages, { role: 'user', content: message }],
            projectId: activeProject?.id,
          }),
        })
        
        if (!res.ok) throw new Error('Failed to get response')
        
        // 스트리밍 응답 처리
        const reader = res.body?.getReader()
        if (!reader) throw new Error('No reader')
        
        const decoder = new TextDecoder()
        let fullContent = ''
        setGlobalMessages(prev => [...prev, { role: 'assistant', content: '' }])
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          fullContent += chunk
          
          setGlobalMessages(prev => {
            const newMessages = [...prev]
            newMessages[newMessages.length - 1] = { role: 'assistant', content: fullContent }
            return newMessages
          })
        }
      } catch (error) {
        console.error('Global chat error:', error)
        setGlobalMessages(prev => [...prev, { role: 'assistant', content: '❌ 오류가 발생했습니다. 다시 시도해 주세요.' }])
      } finally {
        setIsGlobalChatLoading(false)
      }
    } else if (!sessionId && selectedChangeId) {
      // Change 모드: 기존 Agent 세션
      const defaultCLI = { id: 'claude', name: 'Claude', icon: '🤖' }
      await startSession(selectedChangeId, activeProject?.path, message, defaultCLI)
    } else if (sessionId) {
      await sendMessage(message)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME 조합 중(한글 입력 등)일 때는 Enter 무시
    if (e.nativeEvent.isComposing) return

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleStop = async () => {
    if (sessionId) {
      await stopSession()
    }
  }

  const handleResume = async () => {
    if (sessionId) {
      await resumeSession()
    }
  }

  const canSend = input.trim() && !isStreaming && !isGlobalChatLoading && (selectedChangeId || isGlobalChatMode)
  const canStop = isStreaming && sessionId
  const canResume = status === 'stopped' && sessionId

  const selectedChange = changes?.find((c) => c.id === selectedChangeId)
  const activeChanges = changes?.filter((c) => c.status === 'active') ?? []

  // 현재 표시할 메시지 (전역 모드 vs Change 모드)
  const displayMessages = isGlobalChatMode ? globalMessages : messages

  return (
    <RightResizableSidebar
      className={className}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
    >
      {/* Show History View or Chat View */}
      {showHistory ? (
        <SessionHistory
          sessions={sessions}
          onSelect={(sid) => {
            setLoadedSessionId(sid)
            setShowHistory(false)
          }}
          onDelete={(sid) => {
            if (loadedSessionId === sid) {
              setLoadedSessionId(undefined)
            }
          }}
          onBack={() => setShowHistory(false)}
          onNewChat={() => {
            setLoadedSessionId(undefined)
            setShowHistory(false)
          }}
        />
      ) : (
        <>
          {/* Header - Row 1: Title and actions */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Chat</span>
            </div>

            <div className="flex items-center gap-1">
              {/* New Chat Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setLoadedSessionId(undefined)
                        setSelectedChangeId(undefined)
                      }}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>새 대화</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* History Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowHistory(true)}
                    >
                      <History className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>대화 기록</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Header - Row 2: Change Selector */}
          <div className="flex items-center gap-2 px-3 pb-2 border-b">
            {/* Change Selector */}
            {activeProject && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs flex-1 justify-between">
                    {selectedChange ? (
                      <span className="truncate">
                        {selectedChange.title}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Change 선택</span>
                    )}
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[250px]">
                  <DropdownMenuLabel className="text-xs">
                    {activeProject.name}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {activeChanges.length > 0 ? (
                    activeChanges.map((change) => (
                      <DropdownMenuItem
                        key={change.id}
                        onClick={() => setSelectedChangeId(change.id)}
                        className={cn(
                          'text-xs',
                          selectedChangeId === change.id && 'bg-primary/10'
                        )}
                      >
                        <span className="truncate">{change.title}</span>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      활성 Change 없음
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {!activeProject && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">프로젝트를 선택하세요</p>
                </div>
              </div>
            )}

            {activeProject && displayMessages.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium mb-1">
                    {isGlobalChatMode ? '무엇이든 물어보세요' : '메시지를 보내 Agent를 시작하세요'}
                  </p>
                  <p className="text-xs opacity-70">
                    {isGlobalChatMode 
                      ? 'Change 선택 없이 일반 질문이 가능합니다'
                      : 'Change를 선택하면 Agent 모드로 전환됩니다'}
                  </p>
                </div>
              </div>
            )}

            {displayMessages.map((message, index) => (
              isGlobalChatMode ? (
                <div
                  key={index}
                  className={cn(
                    'flex gap-3 p-3 rounded-lg text-sm',
                    message.role === 'user' ? 'bg-primary/10 ml-8' : 'bg-muted mr-8'
                  )}
                >
                  {message.role === 'assistant' && (
                    <Bot className="w-4 h-4 text-primary shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                    {message.content || '...'}
                  </div>
                  {message.role === 'user' && (
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              ) : (
                <MessageBubble key={index} message={message as AgentMessage} />
              )
            ))}

            {(isStreaming || isGlobalChatLoading) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{isGlobalChatMode ? 'AI가 답변 중...' : 'Agent가 생각 중...'}</span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 rounded-lg text-red-600 dark:text-red-400 text-xs">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Status Bar */}
          {sessionId && (
            <div className="px-3 py-1.5 border-t bg-muted/50 text-xs text-muted-foreground flex items-center justify-between">
              <span>
                {sessionId.slice(0, 8)}...
                {status && ` • ${status}`}
              </span>
              {canResume && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResume}
                  className="h-5 text-xs px-2"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Resume
                </Button>
              )}
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 border-t">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isGlobalChatMode
                    ? '무엇이든 물어보세요...'
                    : '메시지를 입력하세요...'
                }
                disabled={!activeProject || isStreaming || isGlobalChatLoading}
                className="min-h-[60px] text-sm resize-none"
              />
              <div className="flex flex-col gap-1">
                {canStop ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleStop}
                  >
                    <StopCircle className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    className="h-8 w-8"
                    disabled={!canSend}
                  >
                    {isStreaming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </RightResizableSidebar>
  )
}

