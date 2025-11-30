/**
 * 충돌 해결 다이얼로그
 * OpenSpec Change: integrate-git-workflow (Phase 3 - Task 3.5)
 *
 * Git merge 충돌 발생 시 사용자가 충돌을 해결할 수 있는 UI를 제공합니다.
 * - 충돌 파일 목록 표시
 * - 파일별 ours/theirs 선택
 * - 수동 편집 후 해결 마킹
 * - Merge 중단/계속 옵션
 */

import { useState } from 'react'
import {
  AlertTriangle,
  FileWarning,
  Check,
  X,
  GitMerge,
  ChevronDown,
  ChevronRight,
  User,
  Users,
  Edit,
  Loader2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useConflictResolution, useConflictFile } from '@/hooks/useChangeGit'
import { cn } from '@/lib/utils'

interface ConflictResolutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolved?: () => void
}

export function ConflictResolutionDialog({
  open,
  onOpenChange,
  onResolved,
}: ConflictResolutionDialogProps) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set())

  const {
    hasConflicts,
    conflictFiles,
    isLoading,
    resolveWithOurs,
    resolveWithTheirs,
    markAsResolved,
    abortMerge,
    continueMerge,
    isResolving,
    isAborting,
    isContinuing,
    refetch,
  } = useConflictResolution()

  const handleResolveOurs = async (file: string) => {
    try {
      await resolveWithOurs(file)
      setResolvedFiles((prev) => new Set(prev).add(file))
      toast.success(`${file} - 내 버전으로 해결됨`)
    } catch (error) {
      toast.error(`충돌 해결 실패: ${(error as Error).message}`)
    }
  }

  const handleResolveTheirs = async (file: string) => {
    try {
      await resolveWithTheirs(file)
      setResolvedFiles((prev) => new Set(prev).add(file))
      toast.success(`${file} - 원격 버전으로 해결됨`)
    } catch (error) {
      toast.error(`충돌 해결 실패: ${(error as Error).message}`)
    }
  }

  const handleMarkResolved = async (file: string) => {
    try {
      await markAsResolved(file)
      setResolvedFiles((prev) => new Set(prev).add(file))
      toast.success(`${file} - 해결 완료로 표시됨`)
    } catch (error) {
      toast.error(`해결 마킹 실패: ${(error as Error).message}`)
    }
  }

  const handleAbort = async () => {
    try {
      await abortMerge()
      toast.success('Merge가 중단되었습니다')
      setResolvedFiles(new Set())
      onOpenChange(false)
    } catch (error) {
      toast.error(`Merge 중단 실패: ${(error as Error).message}`)
    }
  }

  const handleContinue = async () => {
    try {
      await continueMerge()
      toast.success('Merge가 완료되었습니다')
      setResolvedFiles(new Set())
      onOpenChange(false)
      onResolved?.()
    } catch (error) {
      const err = error as Error & { remainingConflicts?: string[] }
      if (err.remainingConflicts) {
        toast.error(`아직 해결되지 않은 충돌이 있습니다: ${err.remainingConflicts.join(', ')}`)
      } else {
        toast.error(`Merge 계속 실패: ${err.message}`)
      }
      refetch()
    }
  }

  const allResolved = conflictFiles.length === 0 || conflictFiles.every((f) => resolvedFiles.has(f))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            충돌 해결
          </DialogTitle>
          <DialogDescription>
            Merge 중 충돌이 발생했습니다. 각 파일의 충돌을 해결해주세요.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hasConflicts && conflictFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Check className="h-12 w-12 mb-4 text-green-500" />
            <p>모든 충돌이 해결되었습니다</p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {conflictFiles.map((file) => (
                <ConflictFileItem
                  key={file}
                  file={file}
                  isResolved={resolvedFiles.has(file)}
                  isExpanded={expandedFile === file}
                  onToggle={() => setExpandedFile(expandedFile === file ? null : file)}
                  onResolveOurs={() => handleResolveOurs(file)}
                  onResolveTheirs={() => handleResolveTheirs(file)}
                  onMarkResolved={() => handleMarkResolved(file)}
                  isResolving={isResolving}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="destructive"
            onClick={handleAbort}
            disabled={isAborting || isContinuing}
          >
            {isAborting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                중단 중...
              </>
            ) : (
              <>
                <X className="mr-2 h-4 w-4" />
                Merge 중단
              </>
            )}
          </Button>

          <Button
            onClick={handleContinue}
            disabled={!allResolved || isContinuing || isAborting}
          >
            {isContinuing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                진행 중...
              </>
            ) : (
              <>
                <GitMerge className="mr-2 h-4 w-4" />
                Merge 완료
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 개별 충돌 파일 아이템
interface ConflictFileItemProps {
  file: string
  isResolved: boolean
  isExpanded: boolean
  onToggle: () => void
  onResolveOurs: () => void
  onResolveTheirs: () => void
  onMarkResolved: () => void
  isResolving: boolean
}

function ConflictFileItem({
  file,
  isResolved,
  isExpanded,
  onToggle,
  onResolveOurs,
  onResolveTheirs,
  onMarkResolved,
  isResolving,
}: ConflictFileItemProps) {
  const { data: fileContent } = useConflictFile(file, { enabled: isExpanded && !isResolved })

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden',
        isResolved ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-amber-200'
      )}
    >
      {/* 파일 헤더 */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <FileWarning className={cn('h-4 w-4', isResolved ? 'text-green-500' : 'text-amber-500')} />
        <span className="flex-1 font-mono text-sm truncate">{file}</span>
        {isResolved ? (
          <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/50">
            <Check className="mr-1 h-3 w-3" />
            해결됨
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/50">
            충돌
          </Badge>
        )}
      </div>

      {/* 확장된 내용 */}
      {isExpanded && !isResolved && (
        <div className="border-t p-3 space-y-3">
          {/* 충돌 내용 미리보기 */}
          {fileContent?.content && (
            <div className="bg-muted rounded p-2 max-h-40 overflow-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {fileContent.content.slice(0, 1000)}
                {fileContent.content.length > 1000 && '\n... (truncated)'}
              </pre>
            </div>
          )}

          {/* 해결 옵션 */}
          <div className="flex flex-wrap gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onResolveOurs()
                    }}
                    disabled={isResolving}
                  >
                    <User className="mr-2 h-4 w-4" />
                    내 버전 (Ours)
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  현재 브랜치의 버전을 유지합니다
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onResolveTheirs()
                    }}
                    disabled={isResolving}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    원격 버전 (Theirs)
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  병합하려는 브랜치의 버전을 사용합니다
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onMarkResolved()
                    }}
                    disabled={isResolving}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    수동 편집 완료
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  파일을 직접 편집한 후 해결 완료로 표시합니다
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>Ours</strong>: 내가 작업 중인 브랜치의 내용을 유지
            <br />
            <strong>Theirs</strong>: 병합하려는 브랜치(원격)의 내용으로 대체
            <br />
            <strong>수동 편집</strong>: 에디터에서 직접 충돌을 해결한 경우
          </p>
        </div>
      )}
    </div>
  )
}

// 충돌 알림 배너 (ChangeDetail에서 사용)
interface ConflictBannerProps {
  onOpenDialog: () => void
}

export function ConflictBanner({ onOpenDialog }: ConflictBannerProps) {
  const { hasConflicts, conflictFiles } = useConflictResolution()

  if (!hasConflicts) {
    return null
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-950 border-l-4 border-amber-500 p-4 mb-4 rounded-r-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-100">
              Merge 충돌 발생
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {conflictFiles.length}개의 파일에서 충돌이 발생했습니다
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenDialog}>
          충돌 해결
        </Button>
      </div>
    </div>
  )
}
