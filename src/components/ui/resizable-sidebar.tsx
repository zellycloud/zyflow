import * as React from 'react'
import { cn } from '@/lib/utils'

const DEFAULT_WIDTH = 256 // 16rem = 256px
const MIN_WIDTH = 200
const MAX_WIDTH = 480

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
    // Load from localStorage
    const saved = localStorage.getItem('sidebar-width')
    return saved ? parseInt(saved, 10) : defaultWidth
  })
  const [isResizing, setIsResizing] = React.useState(false)
  const sidebarRef = React.useRef<HTMLDivElement>(null)

  // Save width to localStorage
  React.useEffect(() => {
    localStorage.setItem('sidebar-width', width.toString())
  }, [width])

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const handleDoubleClick = React.useCallback(() => {
    setWidth(defaultWidth)
  }, [defaultWidth])

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

  return (
    <div
      ref={sidebarRef}
      className={cn('relative flex h-full shrink-0', className)}
      style={{ width }}
    >
      {/* Sidebar Content */}
      <div className="flex h-full w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
        {children}
      </div>

      {/* Resize Handle */}
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
    </div>
  )
}
