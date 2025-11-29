/**
 * Git Commit 다이얼로그 컴포넌트
 */

import { useState, useEffect } from 'react'
import { Check, Loader2, FileText, FilePlus, FileX } from 'lucide-react'
import { useGitStatus, useGitCommit, useGitAdd } from '@/hooks/useGit'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface GitCommitDialogProps {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function GitCommitDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: GitCommitDialogProps) {
  const { data: status, refetch } = useGitStatus()

  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  const commitMutation = useGitCommit()
  const addMutation = useGitAdd()

  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : open
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setOpen

  // 다이얼로그 열릴 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      refetch()
      setMessage('')
      // 이미 staged된 파일들 선택
      if (status?.staged) {
        setSelectedFiles(new Set(status.staged))
      }
    }
  }, [isOpen, refetch])

  // status 변경 시 staged 파일 선택 상태 업데이트
  useEffect(() => {
    if (status?.staged) {
      setSelectedFiles(new Set(status.staged))
    }
  }, [status?.staged])

  const allFiles = [
    ...(status?.staged || []).map((f) => ({ file: f, type: 'staged' as const })),
    ...(status?.modified || []).map((f) => ({ file: f, type: 'modified' as const })),
    ...(status?.untracked || []).map((f) => ({ file: f, type: 'untracked' as const })),
    ...(status?.deleted || []).map((f) => ({ file: f, type: 'deleted' as const })),
  ]

  const toggleFile = (file: string) => {
    const newSelected = new Set(selectedFiles)
    if (newSelected.has(file)) {
      newSelected.delete(file)
    } else {
      newSelected.add(file)
    }
    setSelectedFiles(newSelected)
  }

  const selectAll = () => {
    setSelectedFiles(new Set(allFiles.map((f) => f.file)))
  }

  const deselectAll = () => {
    setSelectedFiles(new Set())
  }

  const handleCommit = async () => {
    if (!message.trim()) {
      toast.error('Please enter a commit message')
      return
    }

    if (selectedFiles.size === 0) {
      toast.error('Please select at least one file to commit')
      return
    }

    try {
      // 선택된 파일들 stage
      const filesToAdd = Array.from(selectedFiles)
      await addMutation.mutateAsync(filesToAdd)

      // 커밋
      await commitMutation.mutateAsync({ message: message.trim() })

      toast.success(`Committed ${selectedFiles.size} file(s)`)

      setIsOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Commit failed')
    }
  }

  const getFileIcon = (type: 'staged' | 'modified' | 'untracked' | 'deleted') => {
    switch (type) {
      case 'staged':
        return <Check className="size-4 text-green-500" />
      case 'modified':
        return <FileText className="size-4 text-yellow-500" />
      case 'untracked':
        return <FilePlus className="size-4 text-blue-500" />
      case 'deleted':
        return <FileX className="size-4 text-red-500" />
    }
  }

  const getTypeLabel = (type: 'staged' | 'modified' | 'untracked' | 'deleted') => {
    switch (type) {
      case 'staged':
        return 'Staged'
      case 'modified':
        return 'Modified'
      case 'untracked':
        return 'New'
      case 'deleted':
        return 'Deleted'
    }
  }

  const isLoading = commitMutation.isPending || addMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
          <DialogDescription>
            Select files and enter a commit message
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* 파일 목록 */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Files ({selectedFiles.size}/{allFiles.length})</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  disabled={selectedFiles.size === allFiles.length}
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deselectAll}
                  disabled={selectedFiles.size === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[200px] rounded-md border">
              {allFiles.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No changes to commit
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {allFiles.map(({ file, type }) => (
                    <div
                      key={`${type}-${file}`}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer',
                        selectedFiles.has(file) && 'bg-accent'
                      )}
                      onClick={() => toggleFile(file)}
                    >
                      <Checkbox
                        checked={selectedFiles.has(file)}
                        onCheckedChange={() => toggleFile(file)}
                      />
                      {getFileIcon(type)}
                      <span className="flex-1 text-sm truncate" title={file}>
                        {file}
                      </span>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          type === 'staged' && 'bg-green-500/20 text-green-600',
                          type === 'modified' && 'bg-yellow-500/20 text-yellow-600',
                          type === 'untracked' && 'bg-blue-500/20 text-blue-600',
                          type === 'deleted' && 'bg-red-500/20 text-red-600'
                        )}
                      >
                        {getTypeLabel(type)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* 커밋 메시지 */}
          <div className="grid gap-2">
            <label htmlFor="commit-message" className="text-sm font-medium">Commit message</label>
            <Textarea
              id="commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCommit}
            disabled={isLoading || allFiles.length === 0 || selectedFiles.size === 0}
          >
            {isLoading && <Loader2 className="size-4 animate-spin mr-2" />}
            Commit {selectedFiles.size > 0 && `(${selectedFiles.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
