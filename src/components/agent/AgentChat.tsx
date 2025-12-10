/**
 * Agent Chat Component
 *
 * Real-time chat interface for AI agent interaction
 */

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, StopCircle, RefreshCw, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAgentSession, AgentMessage } from '@/hooks/useAgentSession'

interface AgentChatProps {
  sessionId?: string
  changeId?: string
  projectPath?: string
  onSessionStart?: (sessionId: string) => void
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isError = message.role === 'error'

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg',
        isUser && 'bg-primary/10 ml-12',
        !isUser && !isSystem && !isError && 'bg-muted mr-12',
        isSystem && 'bg-blue-500/10 text-blue-600 dark:text-blue-400 text-sm',
        isError && 'bg-red-500/10 text-red-600 dark:text-red-400 text-sm'
      )}
    >
      {!isUser && (
        <div className="shrink-0">
          <Bot className="w-5 h-5 text-primary" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {message.content}
        </div>
        {message.timestamp && (
          <div className="text-xs text-muted-foreground mt-2">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
      {isUser && (
        <div className="shrink-0">
          <User className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

export function AgentChat({
  sessionId: initialSessionId,
  changeId,
  projectPath,
  onSessionStart,
}: AgentChatProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
  } = useAgentSession(initialSessionId)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Notify parent of new session
  useEffect(() => {
    if (sessionId && onSessionStart) {
      onSessionStart(sessionId)
    }
  }, [sessionId, onSessionStart])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isStreaming) return

    const message = input.trim()
    setInput('')

    if (!sessionId && changeId) {
      // Start new session with the message as initial prompt
      await startSession(changeId, projectPath, message)
    } else if (sessionId) {
      // Send message to existing session
      await sendMessage(message)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  const canSend = input.trim() && !isStreaming
  const canStop = isStreaming && sessionId
  const canResume = status === 'stopped' && sessionId

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !changeId && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a change to start an agent session</p>
            </div>
          </div>
        )}

        {messages.length === 0 && changeId && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Send a message to start the agent</p>
              <p className="text-sm mt-2">The agent will execute tasks for this change</p>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}

        {isStreaming && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Agent is thinking...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Status Bar */}
      {sessionId && (
        <div className="px-4 py-2 border-t bg-muted/50 text-xs text-muted-foreground flex items-center justify-between">
          <span>
            Session: {sessionId.slice(0, 8)}...
            {status && ` • Status: ${status}`}
          </span>
          <div className="flex gap-2">
            {canResume && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResume}
                className="h-6 text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Resume
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              changeId
                ? 'Send a message to the agent...'
                : 'Select a change first...'
            }
            disabled={!changeId || isStreaming}
            className="min-h-[80px] resize-none"
          />
          <div className="flex flex-col gap-2">
            {canStop ? (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={handleStop}
              >
                <StopCircle className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
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
    </div>
  )
}
