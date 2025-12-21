/**
 * Status Bar Component
 *
 * Horizontal bar below header with sidebar toggles and status indicators
 */

import { useState } from 'react'
import {
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  FolderOpen,
  Copy,
  Check,
  GitBranch,
  Circle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useGitStatus } from '@/hooks/useGit'
import { toast } from 'sonner'

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
  const [copied, setCopied] = useState(false)
  const { data: gitStatus } = useGitStatus()

  // 경로에서 마지막 2-3 폴더만 표시 (너무 길면 축약)
  const shortenPath = (path: string | undefined) => {
    if (!path) return null
    const parts = path.split('/')
    if (parts.length <= 3) return path
    return '~/' + parts.slice(-2).join('/')
  }

  const handleCopyPath = async () => {
    if (!currentWorkingDirectory) return
    try {
      await navigator.clipboard.writeText(currentWorkingDirectory)
      setCopied(true)
      toast.success('경로가 복사되었습니다')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('복사에 실패했습니다')
    }
  }

  const displayPath = shortenPath(currentWorkingDirectory)

  // Git 상태 계산
  const isDirty = gitStatus?.isDirty ?? false
  const hasAhead = (gitStatus?.ahead ?? 0) > 0
  const hasBehind = (gitStatus?.behind ?? 0) > 0

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

      {/* Center - Current Working Directory + Git Status */}
      <div className="flex-1 flex items-center justify-center gap-3">
        {/* Folder Path with Copy Button */}
        {displayPath && (
          <div className="flex items-center gap-1">
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={handleCopyPath}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">경로 복사</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Git Status */}
        {gitStatus?.isGitRepo && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-muted/50 cursor-default">
                  <GitBranch className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono text-muted-foreground">
                    {gitStatus.branch}
                  </span>
                  {/* Dirty indicator */}
                  {isDirty && (
                    <Circle className="h-2 w-2 fill-orange-500 text-orange-500" />
                  )}
                  {/* Ahead/Behind */}
                  {hasAhead && (
                    <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                      <ArrowUp className="h-3 w-3" />
                      {gitStatus.ahead}
                    </span>
                  )}
                  {hasBehind && (
                    <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400">
                      <ArrowDown className="h-3 w-3" />
                      {gitStatus.behind}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="text-xs space-y-1">
                  <div className="font-medium">Git Status</div>
                  <div>브랜치: {gitStatus.branch}</div>
                  {gitStatus.upstream && <div>업스트림: {gitStatus.upstream}</div>}
                  {isDirty && (
                    <div className="text-orange-500">
                      변경됨: {gitStatus.modified.length + gitStatus.staged.length + gitStatus.untracked.length}개 파일
                    </div>
                  )}
                  {hasAhead && <div className="text-green-500">↑ {gitStatus.ahead}개 커밋 푸시 대기</div>}
                  {hasBehind && <div className="text-blue-500">↓ {gitStatus.behind}개 커밋 풀 대기</div>}
                </div>
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
