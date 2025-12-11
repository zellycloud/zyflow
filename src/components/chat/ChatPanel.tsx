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
  PanelRightClose,
  PanelRight,
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

const PANEL_WIDTH = 400
const COLLAPSED_WIDTH = 0

interface ChatPanelProps {
  className?: string
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
        <div className="shrink-0">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      <div className="flex-1 min-w-0">
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
      const res = await fetch(`http://localhost:3001/api/cli/sessions/${sessionId}`, {
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
            sessions.map((session) => (
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

export function ChatPanel({ className }: ChatPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('chat-panel-collapsed')
    return saved === 'true'
  })
  const [showHistory, setShowHistory] = useState(false)
  const [selectedChangeId, setSelectedChangeId] = useState<string | undefined>()
  const [loadedSessionId, setLoadedSessionId] = useState<string | undefined>()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
      const res = await fetch(
        `http://localhost:3001/api/projects/${activeProject.id}/changes`
      )
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

  // Save collapsed state
  useEffect(() => {
    localStorage.setItem('chat-panel-collapsed', isCollapsed.toString())
  }, [isCollapsed])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Keyboard shortcut (Cmd/Ctrl + Shift + C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault()
        setIsCollapsed((prev) => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isStreaming) return

    const message = input.trim()
    setInput('')

    if (!sessionId && selectedChangeId) {
      await startSession(selectedChangeId, activeProject?.path, message)
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

  const canSend = input.trim() && !isStreaming && selectedChangeId
  const canStop = isStreaming && sessionId
  const canResume = status === 'stopped' && sessionId

  const selectedChange = changes?.find((c) => c.id === selectedChangeId)
  const activeChanges = changes?.filter((c) => c.status === 'active') ?? []

  return (
    <div className={cn('relative flex h-full', className)}>
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'absolute top-2 z-10 h-7 w-7 rounded-md',
          'bg-background/80 backdrop-blur-sm border shadow-sm',
          'hover:bg-accent',
          'transition-all duration-200',
          isCollapsed ? 'right-2' : '-left-3'
        )}
        onClick={toggleCollapse}
        title={isCollapsed ? '채팅 열기 (⌘⇧C)' : '채팅 접기 (⌘⇧C)'}
      >
        {isCollapsed ? (
          <PanelRight className="h-4 w-4" />
        ) : (
          <PanelRightClose className="h-4 w-4" />
        )}
      </Button>

      {/* Panel */}
      <div
        className={cn(
          'flex h-full shrink-0 transition-[width] duration-200 ease-in-out border-l bg-background',
          className
        )}
        style={{ width: isCollapsed ? COLLAPSED_WIDTH : PANEL_WIDTH }}
      >
        <div
          className={cn(
            'flex flex-col h-full w-full overflow-hidden',
            'transition-opacity duration-200',
            isCollapsed && 'opacity-0 pointer-events-none'
          )}
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
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">Chat</span>
                </div>

                <div className="flex items-center gap-1">
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

                  {/* Change Selector */}
                  {activeProject && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
                          {selectedChange ? (
                            <span className="max-w-[100px] truncate">
                              {selectedChange.title}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Change</span>
                          )}
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[250px]">
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

                {activeProject && messages.length === 0 && !selectedChangeId && (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Change를 선택하세요</p>
                    </div>
                  </div>
                )}

                {activeProject && messages.length === 0 && selectedChangeId && (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">메시지를 보내 Agent를 시작하세요</p>
                    </div>
                  </div>
                )}

                {messages.map((message, index) => (
                  <MessageBubble key={index} message={message} />
                ))}

                {isStreaming && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Agent가 생각 중...</span>
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
                      selectedChangeId
                        ? '메시지를 입력하세요...'
                        : 'Change를 먼저 선택하세요'
                    }
                    disabled={!selectedChangeId || isStreaming}
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
        </div>
      </div>
    </div>
  )
}
