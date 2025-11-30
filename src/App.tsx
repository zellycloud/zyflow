import { useState } from 'react'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ThemeProvider } from '@/context/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { ResizableSidebar } from '@/components/ui/resizable-sidebar'
import { FlowSidebar } from '@/components/layout/FlowSidebar'
import { FlowContent } from '@/components/flow/FlowContent'
import { ThemeToggle } from '@/components/dashboard/ThemeToggle'
import { GitBranch, Circle } from 'lucide-react'
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

export default function App() {
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
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
                <ThemeToggle />
              </div>
            </header>

            {/* Body - Sidebar + Content */}
            <div className="flex flex-1 overflow-hidden">
              {/* Resizable Sidebar - 프로젝트 + Changes 트리 */}
              <ResizableSidebar>
                <FlowSidebar
                  selectedItem={selectedItem}
                  onSelect={setSelectedItem}
                />
              </ResizableSidebar>

              {/* Content Area - 선택에 따라 다른 뷰 */}
              <main className="flex-1 overflow-y-auto p-6">
                <FlowContent selectedItem={selectedItem} />
              </main>
            </div>
          </div>
          <Toaster position="bottom-right" />
        </SidebarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
