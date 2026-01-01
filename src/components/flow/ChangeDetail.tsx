import { useState } from 'react'
import { Loader2, FileText, Copy, Check, GitBranch, GitCommit, Upload, Settings, GitPullRequest, Archive, Calendar, Clock } from 'lucide-react'
import { useFlowChangeDetail, useArchiveChange } from '@/hooks/useFlowChanges'
import { useProjectsAllData } from '@/hooks/useProjects'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { PipelineBar } from './PipelineBar'
import { StageContent } from './StageContent'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ChangeWorkflowDialog,
  ChangeCommitDialog,
  PushSettingsDialog,
  CreatePRDialog,
  type PushTiming,
} from '@/components/git/ChangeWorkflowDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCurrentChangeBranch, useChangePush, useConflicts } from '@/hooks/useChangeGit'
import { formatRelativeDate, formatDateTime } from '@/lib/utils'
import { RemoteStatusBanner } from '@/components/git/RemoteStatusBanner'
import { ConflictResolutionDialog, ConflictBanner } from '@/components/git/ConflictResolutionDialog'
import type { Stage } from '@/types'
import { ExecutionPanel } from '@/components/claude-flow'

interface ChangeDetailProps {
  projectId: string
  changeId: string
  onArchived?: () => void
}

export function ChangeDetail({ projectId, changeId, onArchived }: ChangeDetailProps) {
  const [activeTab, setActiveTab] = useState<Stage>('task')
  const [copied, setCopied] = useState(false)
  const { data, isLoading, error } = useFlowChangeDetail(changeId)
  const { data: projectsData } = useProjectsAllData()

  // Git 워크플로우 상태
  const [showStartDialog, setShowStartDialog] = useState(false)
  const [showCommitDialog, setShowCommitDialog] = useState(false)
  const [showPushSettings, setShowPushSettings] = useState(false)
  const [showCreatePR, setShowCreatePR] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [pushTiming, setPushTiming] = useState<PushTiming>('manual')

  // Git 상태 조회
  const { data: currentBranch } = useCurrentChangeBranch()
  const changePush = useChangePush()

  // 현재 Change 브랜치에 있는지 확인
  const isOnChangeBranch = currentBranch?.isChangeBranch && currentBranch?.changeId === changeId
  const branchName = `change/${changeId}`

  // 충돌 상태 조회 (Change 브랜치에 있을 때만)
  const { data: conflictsData } = useConflicts({ enabled: !!isOnChangeBranch })

  // Archive 관련 상태
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const archiveChange = useArchiveChange()

  // 푸시 핸들러
  const handlePush = async () => {
    try {
      await changePush.mutateAsync({ changeId })
      toast.success('푸시 완료')
    } catch (error) {
      toast.error('푸시 실패')
      console.error('Push failed:', error)
    }
  }

  // 현재 프로젝트의 tasks.md 경로
  const currentProject = projectsData?.projects.find(
    p => p.id === projectId || p.id === projectsData?.activeProjectId
  )
  const tasksFilePath = currentProject
    ? `${currentProject.path}/openspec/changes/${changeId}/tasks.md`
    : null

  const handleCopyPath = async () => {
    if (!tasksFilePath) return
    try {
      await navigator.clipboard.writeText(tasksFilePath)
      setCopied(true)
      toast.success('경로가 복사되었습니다')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('복사에 실패했습니다')
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>로딩 중...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-destructive">
        <p>Change를 불러올 수 없습니다</p>
        {error && <p className="text-sm mt-1">{error.message}</p>}
      </div>
    )
  }

  const { change, stages } = data

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 충돌 알림 배너 */}
      {isOnChangeBranch && conflictsData?.hasConflicts && (
        <ConflictBanner onOpenDialog={() => setShowConflictDialog(true)} />
      )}

      {/* 원격 상태 알림 배너 */}
      {isOnChangeBranch && <RemoteStatusBanner autoCheck={true} checkInterval={60000} />}

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{change.title}</h1>

          {/* Git Workflow Buttons */}
          <TooltipProvider>
            <div className="flex items-center gap-1">
              {/* 브랜치 시작/전환 버튼 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isOnChangeBranch ? 'secondary' : 'outline'}
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowStartDialog(true)}
                  >
                    <GitBranch className={`h-4 w-4 ${isOnChangeBranch ? 'text-green-600' : ''}`} />
                    {isOnChangeBranch ? branchName : '브랜치 시작'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isOnChangeBranch ? `현재 브랜치: ${branchName}` : '이 Change 작업을 위한 브랜치 생성/전환'}
                </TooltipContent>
              </Tooltip>

              {/* 커밋 버튼 (브랜치에 있을 때만) */}
              {isOnChangeBranch && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowCommitDialog(true)}
                    >
                      <GitCommit className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>커밋</TooltipContent>
                </Tooltip>
              )}

              {/* 푸시 버튼 (브랜치에 있을 때만) */}
              {isOnChangeBranch && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handlePush}
                      disabled={changePush.isPending}
                    >
                      <Upload className={`h-4 w-4 ${changePush.isPending ? 'animate-pulse' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>푸시</TooltipContent>
                </Tooltip>
              )}

              {/* 푸시 설정 버튼 */}
              {isOnChangeBranch && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPushSettings(true)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>푸시 설정</TooltipContent>
                </Tooltip>
              )}

              {/* PR 생성 버튼 (브랜치에 있을 때만) */}
              {isOnChangeBranch && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 ml-2"
                      onClick={() => setShowCreatePR(true)}
                    >
                      <GitPullRequest className="h-4 w-4" />
                      PR 생성
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>GitHub Pull Request 생성</TooltipContent>
                </Tooltip>
              )}

              {/* Archive 버튼 - 100% 완료 시에만 활성화 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={change.progress === 100 ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2 ml-2"
                    disabled={change.progress !== 100 || archiveChange.isPending}
                    onClick={() => {
                      setArchiveError(null)
                      setShowArchiveDialog(true)
                    }}
                  >
                    <Archive className={`h-4 w-4 ${archiveChange.isPending ? 'animate-pulse' : ''}`} />
                    Archive
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {change.progress === 100
                    ? '완료된 Change를 아카이브로 이동'
                    : `모든 태스크 완료 필요 (${change.progress}%)`}
                </TooltipContent>
              </Tooltip>
              <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Change 아카이브</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3 text-sm text-muted-foreground">
                        <p>
                          <strong className="text-foreground">"{change.title}"</strong>를 아카이브하시겠습니까?
                        </p>
                        <p>
                          아카이브하면 Change 폴더가 <code className="bg-muted px-1 rounded">archive/</code>로 이동되고,
                          관련 Spec이 메인 <code className="bg-muted px-1 rounded">specs/</code> 폴더로 업데이트됩니다.
                        </p>
                        {archiveError && (
                          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 space-y-2">
                            <p className="text-destructive font-medium">Spec 업데이트 실패</p>
                            <p className="text-xs text-muted-foreground">{archiveError}</p>
                            <p className="text-sm">Spec 업데이트 없이 아카이브하시겠습니까?</p>
                          </div>
                        )}
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setArchiveError(null)}>취소</AlertDialogCancel>
                    {archiveError ? (
                      <>
                        <AlertDialogAction
                          onClick={async () => {
                            try {
                              // 자동 수정 후 재시도
                              await archiveChange.mutateAsync({ changeId, skipSpecs: false, autoFix: true, projectId })
                              toast.success('Change가 아카이브되었습니다 (자동 수정 적용)')
                              setShowArchiveDialog(false)
                              setArchiveError(null)
                              onArchived?.()
                            } catch (error) {
                              // 자동 수정 실패 시 강제 옵션 제공
                              const err = error as Error & { canForce?: boolean }
                              if (err.canForce) {
                                toast.error('자동 수정 실패. 강제 아카이브를 시도해주세요.')
                              } else {
                                toast.error(error instanceof Error ? error.message : '아카이브 실패')
                              }
                            }
                          }}
                          disabled={archiveChange.isPending}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {archiveChange.isPending ? '처리 중...' : '자동 수정 후 재시도'}
                        </AlertDialogAction>
                        <AlertDialogAction
                          onClick={async () => {
                            try {
                              // 강제 아카이브 (validation 건너뜀)
                              await archiveChange.mutateAsync({ changeId, skipSpecs: false, force: true, projectId })
                              toast.success('Change가 아카이브되었습니다 (검증 건너뜀)')
                              setShowArchiveDialog(false)
                              setArchiveError(null)
                              onArchived?.()
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : '아카이브 실패')
                            }
                          }}
                          disabled={archiveChange.isPending}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          {archiveChange.isPending ? '처리 중...' : '강제 아카이브'}
                        </AlertDialogAction>
                      </>
                    ) : (
                      <AlertDialogAction
                        onClick={async (e) => {
                          e.preventDefault()
                          try {
                            await archiveChange.mutateAsync({ changeId, skipSpecs: false, projectId })
                            toast.success('Change가 아카이브되었습니다')
                            setShowArchiveDialog(false)
                            onArchived?.()
                          } catch (error) {
                            const err = error as Error & { validationErrors?: string[]; canForce?: boolean }
                            const message = err.message || '아카이브 실패'
                            // Validation 에러인 경우 재시도 옵션 제공
                            if (err.canForce || message.includes('Validation') || message.includes('spec') || message.includes('Spec') || message.includes('ADDED')) {
                              setArchiveError(message)
                            } else {
                              toast.error(message)
                            }
                          }
                        }}
                        disabled={archiveChange.isPending}
                      >
                        {archiveChange.isPending ? '처리 중...' : '아카이브'}
                      </AlertDialogAction>
                    )}
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">진행률</span>
            <span className="font-medium">{change.progress}%</span>
          </div>
          <Progress value={change.progress} className="w-32" />

          {/* 생성/수정 날짜 */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  생성: {formatRelativeDate(change.createdAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatDateTime(change.createdAt)}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  수정: {formatRelativeDate(change.updatedAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatDateTime(change.updatedAt)}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {/* tasks.md 파일 경로 표시 */}
        {tasksFilePath && (
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">
              {tasksFilePath}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleCopyPath}
              title="경로 복사"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Pipeline Bar */}
      <PipelineBar
        stages={stages}
        currentStage={change.currentStage}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Stage Content */}
      <div className="border rounded-lg p-4">
        <StageContent
          changeId={changeId}
          stage={activeTab}
          tasks={stages[activeTab]?.tasks ?? []}
          specPath={change.specPath}
        />
      </div>

      {/* Claude Flow Execution Panel */}
      {currentProject && (
        <ExecutionPanel
          changeId={changeId}
          projectPath={currentProject.path}
        />
      )}

      {/* Git Workflow Dialogs */}
      <ChangeWorkflowDialog
        changeId={changeId}
        changeTitle={change.title}
        open={showStartDialog}
        onOpenChange={setShowStartDialog}
      />
      <ChangeCommitDialog
        changeId={changeId}
        changeTitle={change.title}
        open={showCommitDialog}
        onOpenChange={setShowCommitDialog}
      />
      <PushSettingsDialog
        open={showPushSettings}
        onOpenChange={setShowPushSettings}
        currentTiming={pushTiming}
        onTimingChange={setPushTiming}
      />
      <CreatePRDialog
        changeId={changeId}
        changeTitle={change.title}
        open={showCreatePR}
        onOpenChange={setShowCreatePR}
        onSuccess={(url) => {
          toast.success('PR이 생성되었습니다', {
            action: {
              label: '열기',
              onClick: () => window.open(url, '_blank'),
            },
          })
        }}
      />
      <ConflictResolutionDialog
        open={showConflictDialog}
        onOpenChange={setShowConflictDialog}
        onResolved={() => {
          toast.success('모든 충돌이 해결되었습니다')
        }}
      />
    </div>
  )
}
