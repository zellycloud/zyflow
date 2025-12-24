import { useState, useEffect, useMemo, useCallback } from 'react'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ThemeProvider } from '@/context/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { ResizableSidebar } from '@/components/ui/resizable-sidebar'
import { FlowSidebar } from '@/components/layout/FlowSidebar'
import { StatusBar } from '@/components/layout/StatusBar'
import { MenuBar } from '@/components/layout/MenuBar'
import { FlowContent } from '@/components/flow/FlowContent'
import { ChatPanel } from '@/components/chat'
import { DocsCommandPalette } from '@/components/docs'
import { ThemeToggle } from '@/components/dashboard/ThemeToggle'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useProjectsAllData } from '@/hooks/useProjects'
import { GitBranch, Circle, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// 선택된 항목 타입
export type SelectedItem =
  | { type: 'project'; projectId: string }
  | { type: 'change'; projectId: string; changeId: string }
  | { type: 'standalone-tasks'; projectId: string }
  | { type: 'project-settings'; projectId: string }
  | { type: 'agent'; projectId: string; changeId?: string }
  | { type: 'post-task'; projectId: string }
  | { type: 'archived'; projectId: string; archivedChangeId?: string }
  | { type: 'docs'; projectId: string }
  | { type: 'settings' }
  | null

const queryClient = new QueryClient()

function ApiStatusIndicator() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3001/api/health')
      if (!res.ok) throw new Error('API server not responding')
      return res.json()
    },
    refetchInterval: 10000,
    retry: false,
  })

  const status = isLoading ? 'checking' : isError ? 'offline' : 'online'
  const uptime = data?.data?.uptime
    ? `${Math.floor(data.data.uptime / 60)}m ${Math.floor(data.data.uptime % 60)}s`
    : null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle
              className={cn(
                'h-2 w-2 fill-current',
                status === 'online' && 'text-green-500',
                status === 'offline' && 'text-red-500',
                status === 'checking' && 'text-yellow-500 animate-pulse'
              )}
            />
            <span>API</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs">
            <div className="font-medium">
              API Server: {status === 'online' ? 'Connected' : status === 'offline' ? 'Disconnected' : 'Checking...'}
            </div>
            {uptime && <div className="text-muted-foreground">Uptime: {uptime}</div>}
            {isError && (
              <div className="text-red-400 mt-1">
                Run `npm run dev:all` to start
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function WebSocketIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isConnected ? (
              <Wifi className="h-3 w-3 text-green-500" />
            ) : (
              <WifiOff className="h-3 w-3 text-red-500" />
            )}
            <span>WS</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs">
            WebSocket: {isConnected ? 'Connected (실시간)' : 'Disconnected'}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function AppContent() {
  // 초기 상태를 로컬 스토리지에서 불러오기
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(() => {
    try {
      const saved = localStorage.getItem('zyflow-selected-item')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  // Sidebar collapsed states
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    return saved === 'true'
  })
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('chat-panel-collapsed')
    return saved === 'true'
  })
  const [docsCommandPaletteOpen, setDocsCommandPaletteOpen] = useState(false)

  const { isConnected } = useWebSocket()
  const { data: projectsData } = useProjectsAllData()

  // 현재 작업 폴더 (활성 프로젝트의 경로)
  const currentWorkingDirectory = useMemo(() => {
    const activeProjectId = projectsData?.activeProjectId
    const projects = projectsData?.projects
    if (!activeProjectId || !projects) return undefined
    const activeProject = projects.find(p => p.id === activeProjectId)
    return activeProject?.path
  }, [projectsData])

  // Save sidebar states
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', leftSidebarCollapsed.toString())
  }, [leftSidebarCollapsed])

  useEffect(() => {
    localStorage.setItem('chat-panel-collapsed', rightSidebarCollapsed.toString())
  }, [rightSidebarCollapsed])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + B for left sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setLeftSidebarCollapsed(prev => !prev)
      }
      // Cmd/Ctrl + Shift + C for right sidebar (chat)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault()
        setRightSidebarCollapsed(prev => !prev)
      }
      // Cmd/Ctrl + Shift + D for docs command palette
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'd') {
        e.preventDefault()
        setDocsCommandPaletteOpen(prev => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 상태 변경 시 로컬 스토리지에 저장
  useEffect(() => {
    if (selectedItem) {
      localStorage.setItem('zyflow-selected-item', JSON.stringify(selectedItem))
    } else {
      localStorage.removeItem('zyflow-selected-item')
    }
  }, [selectedItem])

  // 문서 선택 핸들러 (명령어 팔레트에서 선택 시)
  const handleSelectDoc = useCallback((_docPath: string) => {
    // 활성 프로젝트가 있으면 Docs 페이지로 이동
    if (projectsData?.activeProjectId) {
      setSelectedItem({ type: 'docs', projectId: projectsData.activeProjectId })
    }
  }, [projectsData?.activeProjectId])

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full flex-col bg-background">
        {/* Header - Full Width */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">ZyFlow</h1>
          </div>
          <div className="flex items-center gap-4">
            <ApiStatusIndicator />
            <WebSocketIndicator isConnected={isConnected} />
            <ThemeToggle />
          </div>
        </header>

        {/* Status Bar - Sidebar toggles + Current Working Directory */}
        <StatusBar
          leftSidebarCollapsed={leftSidebarCollapsed}
          rightSidebarCollapsed={rightSidebarCollapsed}
          onToggleLeftSidebar={() => setLeftSidebarCollapsed(prev => !prev)}
          onToggleRightSidebar={() => setRightSidebarCollapsed(prev => !prev)}
          currentWorkingDirectory={currentWorkingDirectory}
        />

        {/* Body - Sidebar + Content + Chat */}
        <div className="flex flex-1 overflow-hidden">
          {/* Resizable Sidebar - 프로젝트 + Changes 트리 */}
          <ResizableSidebar
            collapsed={leftSidebarCollapsed}
            onCollapsedChange={setLeftSidebarCollapsed}
          >
            <FlowSidebar
              selectedItem={selectedItem}
              onSelect={setSelectedItem}
            />
          </ResizableSidebar>

          {/* Main Content Area with MenuBar */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* MenuBar - Navigation for project-level features */}
            <MenuBar
              selectedItem={selectedItem}
              activeProjectId={projectsData?.activeProjectId ?? undefined}
              onSelectItem={setSelectedItem}
            />

            {/* Content Area - 선택에 따라 다른 뷰 */}
            <main className="flex-1 overflow-y-auto p-6">
              <FlowContent selectedItem={selectedItem} onSelectItem={setSelectedItem} />
            </main>
          </div>

          {/* Chat Panel - 오른쪽 채팅 패널 */}
          <ChatPanel
            collapsed={rightSidebarCollapsed}
            onCollapsedChange={setRightSidebarCollapsed}
          />
        </div>
      </div>
      <Toaster position="bottom-right" />

      {/* 문서 검색 명령어 팔레트 (Cmd+Shift+D) */}
      <DocsCommandPalette
        open={docsCommandPaletteOpen}
        onOpenChange={setDocsCommandPaletteOpen}
        projectPath={currentWorkingDirectory}
        onSelectDoc={handleSelectDoc}
      />
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
