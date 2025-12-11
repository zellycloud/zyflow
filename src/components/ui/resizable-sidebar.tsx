import * as React from 'react'
import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const DEFAULT_WIDTH = 256 // 16rem = 256px
const MIN_WIDTH = 200
const MAX_WIDTH = 480
const COLLAPSED_WIDTH = 0

interface ResizableSidebarProps {
  children: React.ReactNode
  className?: string
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
}

export function ResizableSidebar({
  children,
  className,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
}: ResizableSidebarProps) {
  const [width, setWidth] = React.useState(() => {
    const saved = localStorage.getItem('sidebar-width')
    return saved ? parseInt(saved, 10) : defaultWidth
  })
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    return saved === 'true'
  })
  const [isResizing, setIsResizing] = React.useState(false)
  const sidebarRef = React.useRef<HTMLDivElement>(null)

  // Save width to localStorage
  React.useEffect(() => {
    localStorage.setItem('sidebar-width', width.toString())
  }, [width])

  // Save collapsed state to localStorage
  React.useEffect(() => {
    localStorage.setItem('sidebar-collapsed', isCollapsed.toString())
  }, [isCollapsed])

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const handleDoubleClick = React.useCallback(() => {
    setWidth(defaultWidth)
  }, [defaultWidth])

  const toggleCollapse = React.useCallback(() => {
    setIsCollapsed((prev) => !prev)
  }, [])

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const newWidth = e.clientX
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, minWidth, maxWidth])

  // Keyboard shortcut (Cmd/Ctrl + B)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleCollapse()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleCollapse])

  return (
    <div className="relative flex h-full">
      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={cn(
          'relative flex h-full shrink-0 transition-[width] duration-200 ease-in-out',
          className
        )}
        style={{ width: isCollapsed ? COLLAPSED_WIDTH : width }}
      >
        {/* Sidebar Content */}
        <div
          className={cn(
            'flex h-full w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground',
            'transition-opacity duration-200',
            isCollapsed && 'opacity-0 pointer-events-none'
          )}
        >
          {children}
        </div>

        {/* Resize Handle - hidden when collapsed */}
        {!isCollapsed && (
          <div
            className={cn(
              'absolute right-0 top-0 h-full w-1 cursor-col-resize',
              'hover:bg-primary/20 active:bg-primary/30',
              'transition-colors duration-150',
              'border-r border-border',
              isResizing && 'bg-primary/30'
            )}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            title="드래그하여 크기 조절, 더블클릭하여 기본값 복원"
          />
        )}
      </div>

      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'absolute top-2 z-10 h-7 w-7 rounded-md',
          'bg-background/80 backdrop-blur-sm border shadow-sm',
          'hover:bg-accent',
          'transition-all duration-200',
          isCollapsed ? 'left-2' : '-right-3'
        )}
        onClick={toggleCollapse}
        title={isCollapsed ? '사이드바 열기 (⌘B)' : '사이드바 접기 (⌘B)'}
      >
        {isCollapsed ? (
          <PanelLeft className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
