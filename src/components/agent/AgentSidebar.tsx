/**
 * Agent Sidebar Component
 *
 * Shows agent context: todos, files, and OpenSpec info
 */

import { useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentSession, useAgentLogs } from '@/hooks/useAgentSession'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface AgentSidebarProps {
  sessionId?: string
  changeId?: string
  projectPath?: string
}

interface TaskResult {
  task_id: string
  task_title: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
  error?: string
  started_at?: string
  completed_at?: string
}

function TaskItem({ task }: { task: TaskResult }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const statusIcon = {
    pending: <Circle className="w-4 h-4 text-muted-foreground" />,
    running: <Clock className="w-4 h-4 text-blue-500 animate-pulse" />,
    completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    failed: <AlertCircle className="w-4 h-4 text-red-500" />,
  }

  const hasDetails = task.output || task.error

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger className="w-full">
        <div
          className={cn(
            'flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors',
            task.status === 'running' && 'bg-blue-500/10',
            task.status === 'failed' && 'bg-red-500/10'
          )}
        >
          {hasDetails && (
            <span className="shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </span>
          )}
          {!hasDetails && <span className="w-3" />}
          {statusIcon[task.status]}
          <span className="text-sm truncate flex-1 text-left">
            {task.task_title}
          </span>
        </div>
      </CollapsibleTrigger>
      {hasDetails && (
        <CollapsibleContent>
          <div className="ml-9 p-2 text-xs bg-muted/30 rounded-lg mt-1">
            {task.output && (
              <pre className="whitespace-pre-wrap text-muted-foreground">
                {task.output.slice(0, 500)}
                {task.output.length > 500 && '...'}
              </pre>
            )}
            {task.error && (
              <pre className="whitespace-pre-wrap text-red-500">
                {task.error}
              </pre>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export function AgentSidebar({
  sessionId,
  changeId,
  projectPath,
}: AgentSidebarProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'files' | 'context'>('tasks')

  const { completedTasks, totalTasks, currentTask, status } = useAgentSession(sessionId)
  const { data: logs } = useAgentLogs(sessionId)

  const tasks: TaskResult[] = logs?.results || []
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm">Agent Context</h3>
        {sessionId && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{completedTasks}/{totalTasks} tasks</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  status === 'completed' && 'bg-green-500',
                  status === 'failed' && 'bg-red-500',
                  status === 'running' && 'bg-blue-500',
                  status === 'stopped' && 'bg-yellow-500',
                  !status && 'bg-primary'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            {currentTask && (
              <div className="text-xs text-muted-foreground">
                Current: {currentTask}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(['tasks', 'files', 'context'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium transition-colors',
              activeTab === tab
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'tasks' && 'Tasks'}
            {tab === 'files' && 'Files'}
            {tab === 'context' && 'Context'}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {activeTab === 'tasks' && (
          <div className="p-2 space-y-1">
            {tasks.length === 0 && !sessionId && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No active session
              </div>
            )}
            {tasks.length === 0 && sessionId && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Waiting for tasks...
              </div>
            )}
            {tasks.map((task) => (
              <TaskItem key={task.task_id} task={task} />
            ))}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="p-4">
            <div className="text-sm text-muted-foreground text-center">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Modified files will appear here</p>
            </div>
          </div>
        )}

        {activeTab === 'context' && (
          <div className="p-4 space-y-4">
            {changeId && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Change
                </h4>
                <div className="p-2 bg-muted/50 rounded-lg text-sm">
                  {changeId}
                </div>
              </div>
            )}
            {projectPath && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Project
                </h4>
                <div className="p-2 bg-muted/50 rounded-lg text-sm flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  <span className="truncate">{projectPath}</span>
                </div>
              </div>
            )}
            {!changeId && !projectPath && (
              <div className="text-sm text-muted-foreground text-center">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Select a change to see context</p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
