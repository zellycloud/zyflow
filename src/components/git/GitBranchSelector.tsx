/**
 * Git 브랜치 선택 드롭다운 컴포넌트
 */

import { useState } from 'react'
import { GitBranch, Check, Plus, Loader2 } from 'lucide-react'
import { useGitStatus, useGitBranches, useGitCheckout, useGitCreateBranch } from '@/hooks/useGit'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface GitBranchSelectorProps {
  className?: string
}

export function GitBranchSelector({ className }: GitBranchSelectorProps) {
  const { data: status } = useGitStatus()
  const { data: branchesData, isLoading: isLoadingBranches } = useGitBranches()

  const [open, setOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')

  const checkoutMutation = useGitCheckout()
  const createBranchMutation = useGitCreateBranch()

  const handleSelectBranch = async (branch: string) => {
    if (branch === status?.branch) {
      setOpen(false)
      return
    }

    try {
      await checkoutMutation.mutateAsync({ branch })
      toast.success(`Switched to branch '${branch}'`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to switch branch')
    }
    setOpen(false)
  }

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return

    try {
      await createBranchMutation.mutateAsync({
        name: newBranchName.trim(),
        checkout: true,
      })
      toast.success(`Created and switched to branch '${newBranchName}'`)
      setNewBranchName('')
      setCreateDialogOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create branch')
    }
  }

  if (!status?.isGitRepo) {
    return null
  }

  const branches = branchesData?.branches || []
  const currentBranch = status.branch
  const localBranches = branches.filter((b) => !b.startsWith('origin/'))
  const remoteBranches = branches.filter((b) => b.startsWith('origin/'))

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn('justify-between gap-2 min-w-[120px]', className)}
            disabled={checkoutMutation.isPending}
          >
            {checkoutMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GitBranch className="size-4" />
            )}
            <span className="truncate max-w-[120px]">{currentBranch}</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-[200px]" align="start">
          <DropdownMenuLabel>Local branches</DropdownMenuLabel>
          {isLoadingBranches ? (
            <DropdownMenuItem disabled>
              <Loader2 className="size-4 animate-spin mr-2" />
              Loading...
            </DropdownMenuItem>
          ) : (
            localBranches.map((branch) => (
              <DropdownMenuItem
                key={branch}
                onClick={() => handleSelectBranch(branch)}
                disabled={checkoutMutation.isPending}
              >
                <Check
                  className={cn(
                    'mr-2 size-4',
                    branch === currentBranch ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {branch}
              </DropdownMenuItem>
            ))
          )}

          {remoteBranches.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Remote branches</DropdownMenuLabel>
              {remoteBranches.slice(0, 5).map((branch) => (
                <DropdownMenuItem
                  key={branch}
                  onClick={() => handleSelectBranch(branch.replace('origin/', ''))}
                  disabled={checkoutMutation.isPending}
                >
                  <Check className="mr-2 size-4 opacity-0" />
                  {branch}
                </DropdownMenuItem>
              ))}
              {remoteBranches.length > 5 && (
                <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                  +{remoteBranches.length - 5} more...
                </DropdownMenuItem>
              )}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setOpen(false)
              setCreateDialogOpen(true)
            }}
          >
            <Plus className="mr-2 size-4" />
            Create new branch
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new branch</DialogTitle>
            <DialogDescription>
              Create a new branch from '{currentBranch}'
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="branch-name" className="text-sm font-medium">
                Branch name
              </label>
              <Input
                id="branch-name"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/my-new-feature"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateBranch()
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim() || createBranchMutation.isPending}
            >
              {createBranchMutation.isPending && (
                <Loader2 className="size-4 animate-spin mr-2" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
