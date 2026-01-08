import * as React from 'react'
import { cn } from '@/lib/utils'

const DEFAULT_WIDTH = 400 // 채팅창은 조금 더 넓게 시작
const MIN_WIDTH = 300
const MAX_WIDTH = 800
const COLLAPSED_WIDTH = 0

interface RightResizableSidebarProps {
  children: React.ReactNode
  className?: string
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function RightResizableSidebar({
  children,
  className,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  collapsed: controlledCollapsed,
  onCollapsedChange,
}: RightResizableSidebarProps) {
  const [width, setWidth] = React.useState(() => {
    const saved = localStorage.getItem('chat-panel-width')
    return saved ? parseInt(saved, 10) : defaultWidth
  })
  const [internalCollapsed, setInternalCollapsed] = React.useState(() => {
    const saved = localStorage.getItem('chat-panel-collapsed')
    return saved === 'true'
  })

  // Support both controlled and uncontrolled modes
  const isCollapsed = controlledCollapsed ?? internalCollapsed
  const setIsCollapsed = (value: boolean | ((prev: boolean) => boolean)) => {
    const newValue = typeof value === 'function' ? value(isCollapsed) : value
    setInternalCollapsed(newValue)
    onCollapsedChange?.(newValue)
  }
  const [isResizing, setIsResizing] = React.useState(false)
  const sidebarRef = React.useRef<HTMLDivElement>(null)

  // Save width to localStorage
  React.useEffect(() => {
    localStorage.setItem('chat-panel-width', width.toString())
  }, [width])

  // Save collapsed state to localStorage
  React.useEffect(() => {
    localStorage.setItem('chat-panel-collapsed', isCollapsed.toString())
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
  }, [setIsCollapsed])

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      // 오른쪽 사이드바는 화면 오른쪽 끝에서 마우스 위치를 뺀 값이 너비
      // 하지만 여기서는 간단하게 window.innerWidth - e.clientX로 계산
      const newWidth = window.innerWidth - e.clientX
      
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

  // Keyboard shortcut (Cmd/Ctrl + Shift + C) - handled by parent (App.tsx) when using controlled mode
  React.useEffect(() => {
    // Skip if controlled externally
    if (controlledCollapsed !== undefined) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault()
        toggleCollapse()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleCollapse, controlledCollapsed])

  return (
    <div className="relative flex h-full">
      {/* Resize Handle - hidden when collapsed (Placed on LEFT for right sidebar) */}
      {!isCollapsed && (
        <div
          className={cn(
            'absolute left-0 top-0 h-full w-1 cursor-col-resize z-50', // z-index 추가
            'hover:bg-primary/20 active:bg-primary/30',
            'transition-colors duration-150',
            'border-l border-border', // 왼쪽 보더
            isResizing && 'bg-primary/30'
          )}
          style={{ transform: 'translateX(-50%)' }} // 핸들이 경계선 중앙에 오도록 조정
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          title="드래그하여 크기 조절, 더블클릭하여 기본값 복원"
        />
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={cn(
          'relative flex h-full shrink-0 transition-[width] duration-200 ease-in-out border-l border-border bg-background', // 배경색 및 왼쪽 보더 추가
          className
        )}
        style={{ width: isCollapsed ? COLLAPSED_WIDTH : width }}
      >
        {/* Sidebar Content */}
        <div
          className={cn(
            'flex h-full w-full flex-col overflow-hidden',
            'transition-opacity duration-200',
            isCollapsed && 'opacity-0 pointer-events-none'
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
