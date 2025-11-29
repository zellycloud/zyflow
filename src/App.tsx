import { useState } from 'react'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/context/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { ResizableSidebar } from '@/components/ui/resizable-sidebar'
import { FlowSidebar } from '@/components/layout/FlowSidebar'
import { FlowContent } from '@/components/flow/FlowContent'
import { ThemeToggle } from '@/components/dashboard/ThemeToggle'
import { GitBranch } from 'lucide-react'

// 선택된 항목 타입
export type SelectedItem =
  | { type: 'project'; projectId: string }
  | { type: 'change'; projectId: string; changeId: string }
  | { type: 'standalone-tasks'; projectId: string }
  | null

const queryClient = new QueryClient()

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
              <ThemeToggle />
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
