/**
 * Status Bar Component
 *
 * Horizontal bar below header with sidebar toggles and status indicators
 */

import { PanelLeft, PanelLeftClose, PanelRight, PanelRightClose } from 'lucide-react'
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
  className?: string
}

export function StatusBar({
  leftSidebarCollapsed,
  rightSidebarCollapsed,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  className,
}: StatusBarProps) {
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

      {/* Center - Can add breadcrumb or status later */}
      <div className="flex-1" />

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
