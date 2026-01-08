/**
 * MenuBar Component
 *
 * Navigation menu bar with dropdown menus for project-level features
 * Located below StatusBar, spanning only the main content area (not sidebars)
 */

import {
  GitBranch,
  Inbox,
  Archive,
  Bot,
  Sparkles,
  BookOpen,
  Settings,
  ChevronDown,
  Bell,
  ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { SelectedItem } from '@/types'

interface MenuBarProps {
  selectedItem: SelectedItem
  activeProjectId?: string
  onSelectItem: (item: SelectedItem) => void
  className?: string
}

export function MenuBar({
  selectedItem,
  activeProjectId,
  onSelectItem,
  className,
}: MenuBarProps) {
  // 프로젝트가 선택되지 않으면 메뉴바를 표시하지 않음
  if (!activeProjectId) {
    return (
      <div
        className={cn(
          'flex h-9 shrink-0 items-center border-b bg-background px-4',
          className
        )}
      >
        <span className="text-xs text-muted-foreground">
          프로젝트를 선택하세요
        </span>
      </div>
    )
  }

  const handleSelect = (type: NonNullable<SelectedItem>['type']) => {
    if (!activeProjectId || !type) return

    switch (type) {
      case 'project':
        onSelectItem({ type: 'project', projectId: activeProjectId })
        break
      case 'standalone-tasks':
        onSelectItem({ type: 'standalone-tasks', projectId: activeProjectId })
        break
      case 'archived':
        onSelectItem({ type: 'archived', projectId: activeProjectId })
        break
      case 'agent':
        onSelectItem({ type: 'agent', projectId: activeProjectId })
        break
      case 'post-task':
        onSelectItem({ type: 'post-task', projectId: activeProjectId })
        break
      case 'docs':
        onSelectItem({ type: 'docs', projectId: activeProjectId })
        break
      case 'project-settings':
        onSelectItem({ type: 'project-settings', projectId: activeProjectId })
        break
      case 'alerts':
        onSelectItem({ type: 'alerts', projectId: activeProjectId })
        break
      case 'backlog':
        onSelectItem({ type: 'backlog', projectId: activeProjectId })
        break
    }
  }

  // 현재 선택된 메뉴 확인
  const isChangesActive = selectedItem?.type === 'project' || selectedItem?.type === 'change'
  const isInboxActive = selectedItem?.type === 'standalone-tasks'
  const isBacklogActive = selectedItem?.type === 'backlog'
  const isArchivedActive = selectedItem?.type === 'archived'
  const isToolsActive = selectedItem?.type === 'agent' || selectedItem?.type === 'post-task'
  const isViewActive = selectedItem?.type === 'docs' || selectedItem?.type === 'project-settings'
  const isAlertsActive = selectedItem?.type === 'alerts'

  return (
    <div
      className={cn(
        'flex h-9 shrink-0 items-center gap-1 border-b bg-background px-2',
        className
      )}
    >
      {/* Inbox Button */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1 text-xs',
          isInboxActive && 'bg-accent'
        )}
        onClick={() => handleSelect('standalone-tasks')}
      >
        <Inbox className="h-3.5 w-3.5" />
        Inbox
      </Button>

      {/* Backlog Button */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1 text-xs',
          isBacklogActive && 'bg-accent'
        )}
        onClick={() => handleSelect('backlog')}
      >
        <ClipboardList className="h-3.5 w-3.5" />
        Backlog
      </Button>

      {/* Changes Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 gap-1 text-xs',
              isChangesActive && 'bg-accent'
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Changes
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => handleSelect('project')}
            className={cn(isChangesActive && 'bg-accent')}
          >
            <GitBranch className="h-4 w-4 mr-2" />
            Active Changes
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => handleSelect('archived')}
            className={cn(isArchivedActive && 'bg-accent')}
          >
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Tools Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 gap-1 text-xs',
              isToolsActive && 'bg-accent'
            )}
          >
            <Bot className="h-3.5 w-3.5" />
            Tools
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => handleSelect('agent')}
            className={cn(selectedItem?.type === 'agent' && 'bg-accent')}
          >
            <Bot className="h-4 w-4 mr-2" />
            Agent
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleSelect('post-task')}
            className={cn(selectedItem?.type === 'post-task' && 'bg-accent')}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Post-Task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 gap-1 text-xs',
              isViewActive && 'bg-accent'
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            View
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => handleSelect('docs')}
            className={cn(selectedItem?.type === 'docs' && 'bg-accent')}
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Docs
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => handleSelect('project-settings')}
            className={cn(selectedItem?.type === 'project-settings' && 'bg-accent')}
          >
            <Settings className="h-4 w-4 mr-2" />
            Project Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Alerts Button */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1 text-xs',
          isAlertsActive && 'bg-accent'
        )}
        onClick={() => handleSelect('alerts')}
      >
        <Bell className="h-3.5 w-3.5" />
        Alerts
      </Button>
    </div>
  )
}
