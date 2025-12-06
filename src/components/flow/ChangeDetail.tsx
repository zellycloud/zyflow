import { useState } from 'react'
import { Loader2, FileText, Copy, Check, GitBranch, GitCommit, Upload, Settings, GitPullRequest, Archive } from 'lucide-react'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useCurrentChangeBranch, useChangePush, useConflicts } from '@/hooks/useChangeGit'
import { RemoteStatusBanner } from '@/components/git/RemoteStatusBanner'
import { ConflictResolutionDialog, ConflictBanner } from '@/components/git/ConflictResolutionDialog'
import type { Stage } from '@/types'

interface ChangeDetailProps {
  projectId: string
  changeId: string
}

export function ChangeDetail({ projectId, changeId }: ChangeDetailProps) {
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
  const [skipSpecs, setSkipSpecs] = useState(false)
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
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant={change.progress === 100 ? 'default' : 'outline'}
                        size="sm"
                        className="gap-2 ml-2"
                        disabled={change.progress !== 100 || archiveChange.isPending}
                      >
                        <Archive className={`h-4 w-4 ${archiveChange.isPending ? 'animate-pulse' : ''}`} />
                        Archive
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    {change.progress === 100
                      ? '완료된 Change를 아카이브로 이동'
                      : `모든 태스크 완료 필요 (${change.progress}%)`}
                  </TooltipContent>
                </Tooltip>
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
                        <div className="flex items-center space-x-2 pt-2">
                          <Checkbox
                            id="skipSpecs"
                            checked={skipSpecs}
                            onCheckedChange={(checked) => setSkipSpecs(checked === true)}
                          />
                          <Label htmlFor="skipSpecs" className="text-sm font-normal cursor-pointer">
                            Spec 업데이트 건너뛰기 (인프라/도구 변경용)
                          </Label>
                        </div>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        try {
                          await archiveChange.mutateAsync({ changeId, skipSpecs })
                          toast.success('Change가 아카이브되었습니다')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : '아카이브 실패')
                        }
                      }}
                      disabled={archiveChange.isPending}
                    >
                      {archiveChange.isPending ? '처리 중...' : '아카이브'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">진행률</span>
            <span className="font-medium">{change.progress}%</span>
          </div>
          <Progress value={change.progress} className="w-32" />
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
