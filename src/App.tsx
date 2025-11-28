import { useState } from 'react'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/context/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { ResizableSidebar } from '@/components/ui/resizable-sidebar'
import { AppSidebar, type SelectedItem } from '@/components/layout/AppSidebar'
import { TaskBoard } from '@/components/dashboard/TaskBoard'
import { TasksPage } from '@/components/dashboard/TasksPage'
import { ThemeToggle } from '@/components/dashboard/ThemeToggle'
import { GitBranch, FolderOpen } from 'lucide-react'

export default function App() {
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({ type: 'tasks' })

  return (
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
            {/* Resizable Sidebar */}
            <ResizableSidebar>
              <AppSidebar
                selectedItem={selectedItem}
                onSelectItem={setSelectedItem}
              />
            </ResizableSidebar>

            {/* Content Area */}
            <main className="flex-1 overflow-y-auto p-6">
              {selectedItem?.type === 'tasks' ? (
                <TasksPage />
              ) : selectedItem?.type === 'change' ? (
                <TaskBoard changeId={selectedItem.id} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg">Change를 선택하세요</p>
                  <p className="text-sm mt-1">
                    왼쪽 사이드바에서 프로젝트를 펼치고 Change를 선택하세요
                  </p>
                </div>
              )}
            </main>
          </div>
        </div>
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </ThemeProvider>
  )
}
