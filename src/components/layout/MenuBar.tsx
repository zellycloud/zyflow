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
  const isAgentActive = selectedItem?.type === 'agent'
  const isDocsActive = selectedItem?.type === 'docs'
  const isSettingsActive = selectedItem?.type === 'project-settings'
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

      {/* Agent Button */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1 text-xs',
          isAgentActive && 'bg-accent'
        )}
        onClick={() => handleSelect('agent')}
      >
        <Bot className="h-3.5 w-3.5" />
        Agent
      </Button>

      {/* Docs Button */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1 text-xs',
          isDocsActive && 'bg-accent'
        )}
        onClick={() => handleSelect('docs')}
      >
        <BookOpen className="h-3.5 w-3.5" />
        Docs
      </Button>

      {/* Project Settings Button */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1 text-xs',
          isSettingsActive && 'bg-accent'
        )}
        onClick={() => handleSelect('project-settings')}
      >
        <Settings className="h-3.5 w-3.5" />
        Settings
      </Button>

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
