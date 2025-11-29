/**
 * Git Sync 버튼 컴포넌트
 * Pull/Push 작업을 위한 버튼
 */

import { useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Loader2 } from 'lucide-react'
import { useGitStatus, useGitPull, useGitPush, useGitFetch } from '@/hooks/useGit'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface GitSyncButtonProps {
  className?: string
  showLabel?: boolean
}

export function GitSyncButton({ className, showLabel = false }: GitSyncButtonProps) {
  const { data: status } = useGitStatus()
  const [isOpen, setIsOpen] = useState(false)

  const pullMutation = useGitPull()
  const pushMutation = useGitPush()
  const fetchMutation = useGitFetch()

  const isLoading = pullMutation.isPending || pushMutation.isPending || fetchMutation.isPending

  const handlePull = async () => {
    try {
      const result = await pullMutation.mutateAsync()
      toast.success(result.message || 'Pull successful')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pull failed')
    }
    setIsOpen(false)
  }

  const handlePush = async () => {
    try {
      const result = await pushMutation.mutateAsync({})
      toast.success(result.message || 'Push successful')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Push failed')
    }
    setIsOpen(false)
  }

  const handleFetch = async () => {
    try {
      const result = await fetchMutation.mutateAsync({})
      toast.success(result.message || 'Fetch successful')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Fetch failed')
    }
    setIsOpen(false)
  }

  if (!status?.isGitRepo) {
    return null
  }

  // 단일 버튼으로 표시할 때 (주요 액션)
  const primaryAction = status.behind > 0 ? 'pull' : status.ahead > 0 ? 'push' : 'fetch'

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', className)}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : primaryAction === 'pull' ? (
            <ArrowDownToLine className="size-4 text-orange-500" />
          ) : primaryAction === 'push' ? (
            <ArrowUpFromLine className="size-4 text-green-500" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {showLabel && (
            <span>
              {primaryAction === 'pull' ? 'Pull' : primaryAction === 'push' ? 'Push' : 'Sync'}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handlePull} disabled={pullMutation.isPending}>
          <ArrowDownToLine className="size-4 mr-2" />
          Pull
          {status.behind > 0 && (
            <span className="ml-auto text-xs text-orange-500">
              {status.behind} behind
            </span>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handlePush} disabled={pushMutation.isPending || !status.ahead}>
          <ArrowUpFromLine className="size-4 mr-2" />
          Push
          {status.ahead > 0 && (
            <span className="ml-auto text-xs text-green-500">
              {status.ahead} ahead
            </span>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleFetch} disabled={fetchMutation.isPending}>
          <RefreshCw className="size-4 mr-2" />
          Fetch
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
