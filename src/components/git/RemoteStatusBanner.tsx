/**
 * 원격 상태 알림 배너
 * OpenSpec Change: integrate-git-workflow (Phase 3)
 *
 * 원격 저장소에 새 커밋이 있을 때 알림을 표시합니다.
 */

import { useState } from 'react'
import { ArrowDown, RefreshCw, X, AlertTriangle, GitCommit, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRemoteUpdates, useGitPull, usePotentialConflicts } from '@/hooks/useChangeGit'
import { toast } from 'sonner'

interface RemoteStatusBannerProps {
  /** 자동 체크 활성화 (기본: true) */
  autoCheck?: boolean
  /** 체크 주기 (ms, 기본: 60000) */
  checkInterval?: number
}

export function RemoteStatusBanner({
  autoCheck = true,
  checkInterval = 60000,
}: RemoteStatusBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [showCommits, setShowCommits] = useState(false)

  const { data: remoteUpdates, isLoading, refetch } = useRemoteUpdates({
    enabled: autoCheck,
    refetchInterval: checkInterval,
  })

  const { data: conflicts } = usePotentialConflicts({
    enabled: remoteUpdates?.hasUpdates ?? false,
  })

  const pullMutation = useGitPull()

  // 업데이트 없거나 dismiss됨
  if (!remoteUpdates?.hasUpdates || dismissed) {
    return null
  }

  const handlePull = async () => {
    try {
      await pullMutation.mutateAsync()
      toast.success('Pull 완료')
      setDismissed(true)
    } catch (error) {
      toast.error(`Pull 실패: ${(error as Error).message}`)
    }
  }

  const handleRefresh = () => {
    refetch()
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 p-4 mb-4 rounded-r-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <ArrowDown className="h-5 w-5 text-blue-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-blue-900 dark:text-blue-100">
              원격에 {remoteUpdates.behind}개의 새 커밋이 있습니다
            </p>

            {/* 충돌 경고 */}
            {conflicts?.hasPotentialConflicts && (
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>충돌 가능성: {conflicts.files.join(', ')}</span>
              </div>
            )}

            {/* 커밋 목록 토글 */}
            {remoteUpdates.remoteCommits.length > 0 && (
              <button
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                onClick={() => setShowCommits(!showCommits)}
              >
                {showCommits ? '커밋 숨기기' : '커밋 보기'}
              </button>
            )}

            {/* 커밋 목록 */}
            {showCommits && (
              <ul className="mt-2 space-y-1 text-sm">
                {remoteUpdates.remoteCommits.map((commit) => (
                  <li key={commit.hash} className="flex items-center gap-2 text-muted-foreground">
                    <GitCommit className="h-3 w-3" />
                    <code className="text-xs">{commit.hash}</code>
                    <span className="truncate">{commit.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePull}
            disabled={pullMutation.isPending}
          >
            {pullMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pull 중...
              </>
            ) : (
              <>
                <ArrowDown className="mr-2 h-4 w-4" />
                Pull
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
