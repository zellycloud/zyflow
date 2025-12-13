/**
 * Status Bar Component
 *
 * Horizontal bar below header with sidebar toggles and status indicators
 */

import { PanelLeft, PanelLeftClose, PanelRight, PanelRightClose, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface StatusBarProps {
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
  currentWorkingDirectory?: string
  className?: string
}

export function StatusBar({
  leftSidebarCollapsed,
  rightSidebarCollapsed,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  currentWorkingDirectory,
  className,
}: StatusBarProps) {
  // 경로에서 마지막 2-3 폴더만 표시 (너무 길면 축약)
  const shortenPath = (path: string | undefined) => {
    if (!path) return null
    const parts = path.split('/')
    if (parts.length <= 3) return path
    return '~/' + parts.slice(-2).join('/')
  }

  const displayPath = shortenPath(currentWorkingDirectory)
  return (
    <div
      className={cn(
        'flex h-8 shrink-0 items-center justify-between border-b bg-muted/30 px-2',
        className
      )}
    >
      {/* Left Side - Sidebar Toggle */}
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onToggleLeftSidebar}
              >
                {leftSidebarCollapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {leftSidebarCollapsed ? '사이드바 열기' : '사이드바 접기'} (⌘B)
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Center - Current Working Directory */}
      <div className="flex-1 flex items-center justify-center">
        {displayPath && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded hover:bg-muted/50 cursor-default max-w-md">
                  <FolderOpen className="h-3 w-3 shrink-0" />
                  <span className="truncate font-mono">{displayPath}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="text-xs font-mono">{currentWorkingDirectory}</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Right Side - Chat Toggle */}
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onToggleRightSidebar}
              >
                {rightSidebarCollapsed ? (
                  <PanelRight className="h-4 w-4" />
                ) : (
                  <PanelRightClose className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {rightSidebarCollapsed ? '채팅 열기' : '채팅 접기'} (⌘⇧C)
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
