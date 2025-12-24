/**
 * Agent Page Component
 *
 * Main page for AI agent interaction with OpenSpec changes
 */

import { useState, useEffect } from 'react'
import {
  Bot,
  ChevronDown,
  Settings2,
  Terminal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { projectApiUrl } from '@/config/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { AgentChat } from './AgentChat'
import { AgentSidebar } from './AgentSidebar'
import { CLISelector } from '@/components/cli/CLISelector'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

interface AgentPageProps {
  projectId?: string
  changeId?: string
  projectPath?: string
}

interface Change {
  id: string
  title: string
  status: string
}

export function AgentPage({ projectId, changeId: initialChangeId, projectPath }: AgentPageProps) {
  const [selectedChangeId, setSelectedChangeId] = useState<string | undefined>(() => {
    if (initialChangeId) return initialChangeId
    try {
      if (projectId) {
        return localStorage.getItem(`zyflow-agent-change-${projectId}`) || undefined
      }
    } catch {
      // Ignore localStorage errors
    }
    return undefined
  })
  
  const [selectedCLI, setSelectedCLI] = useState<string>('claude')
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [showSidebar, setShowSidebar] = useState(true)

  // Fetch available changes for the project
  const { data: changes } = useQuery({
    queryKey: ['project-changes', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const res = await fetch(projectApiUrl.changes(projectId))
      if (!res.ok) return []
      const data = await res.json()
      return data.changes as Change[]
    },
    enabled: !!projectId,
  })

  // Update selected change when prop changes
  useEffect(() => {
    if (initialChangeId) {
      setSelectedChangeId(initialChangeId)
    }
  }, [initialChangeId])

  // Persist selected change to localStorage
  useEffect(() => {
    if (projectId && selectedChangeId) {
      localStorage.setItem(`zyflow-agent-change-${projectId}`, selectedChangeId)
    }
  }, [projectId, selectedChangeId])

  const selectedChange = changes?.find((c) => c.id === selectedChangeId)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Agent</h2>
          </div>

          {/* Change Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                {selectedChange ? (
                  <>
                    <span className="max-w-[200px] truncate">{selectedChange.title}</span>
                    <ChevronDown className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">Select Change</span>
                    <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[300px]">
              <DropdownMenuLabel>Active Changes</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {changes?.filter((c) => c.status === 'active').map((change) => (
                <DropdownMenuItem
                  key={change.id}
                  onClick={() => setSelectedChangeId(change.id)}
                  className={cn(selectedChangeId === change.id && 'bg-primary/10')}
                >
                  <span className="truncate">{change.title}</span>
                </DropdownMenuItem>
              ))}
              {!changes?.filter((c) => c.status === 'active').length && (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  No active changes
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          {/* CLI Selector */}
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <CLISelector
              value={selectedCLI}
              onChange={setSelectedCLI}
            />
          </div>

          {/* Toggle Sidebar */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            <Settings2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 min-w-0">
          <AgentChat
            sessionId={sessionId}
            changeId={selectedChangeId}
            projectPath={projectPath}
            onSessionStart={setSessionId}
          />
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div className="w-80 shrink-0">
            <AgentSidebar
              sessionId={sessionId}
              changeId={selectedChangeId}
              projectPath={projectPath}
            />
          </div>
        )}
      </div>
    </div>
  )
}
