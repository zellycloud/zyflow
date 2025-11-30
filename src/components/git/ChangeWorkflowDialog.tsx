/**
 * Change Git 워크플로우 다이얼로그
 * OpenSpec Change: integrate-git-workflow (Phase 2)
 */

import { useState } from 'react'
import { GitBranch, AlertTriangle, Loader2, Check, Archive } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useChangeGitWorkflow, type CommitMessageStage } from '@/hooks/useChangeGit'

interface ChangeWorkflowDialogProps {
  changeId: string
  changeTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ChangeWorkflowDialog({
  changeId,
  changeTitle,
  open,
  onOpenChange,
  onSuccess,
}: ChangeWorkflowDialogProps) {
  const [stashOption, setStashOption] = useState(false)
  const workflow = useChangeGitWorkflow(changeId)

  const handleStartBranch = async () => {
    try {
      await workflow.startBranch({ stashChanges: stashOption })
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      // 에러는 workflow.error로 표시됨
      console.error('Failed to start branch:', error)
    }
  }

  const branchName = `change/${changeId}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Change 작업 시작
          </DialogTitle>
          <DialogDescription>
            {changeTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 브랜치 정보 */}
          <div className="rounded-md border p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">브랜치 이름</span>
              <code className="bg-muted px-2 py-1 rounded">{branchName}</code>
            </div>
            {workflow.hasBranch ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check className="h-4 w-4" />
                <span>브랜치가 이미 존재합니다. 전환합니다.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <GitBranch className="h-4 w-4" />
                <span>새 브랜치를 생성합니다.</span>
              </div>
            )}
          </div>

          {/* uncommitted changes 경고 */}
          {workflow.hasUncommittedChanges && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <p>커밋되지 않은 변경사항이 있습니다:</p>
                <p className="text-sm opacity-80">{workflow.uncommittedSummary}</p>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="stash-option"
                    checked={stashOption}
                    onChange={(e) => setStashOption(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="stash-option" className="text-sm cursor-pointer flex items-center gap-1">
                    <Archive className="h-3 w-3" />
                    변경사항을 임시 저장(stash)하고 진행
                  </label>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* 에러 표시 */}
          {workflow.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {(workflow.error as Error).message}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleStartBranch}
            disabled={
              workflow.isStarting ||
              (workflow.hasUncommittedChanges && !stashOption)
            }
          >
            {workflow.isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                처리 중...
              </>
            ) : workflow.hasBranch ? (
              '브랜치 전환'
            ) : (
              '브랜치 생성'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Change 커밋 다이얼로그 ====================

interface ChangeCommitDialogProps {
  changeId: string
  changeTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ChangeCommitDialog({
  changeId,
  changeTitle,
  open,
  onOpenChange,
  onSuccess,
}: ChangeCommitDialogProps) {
  const [stage, setStage] = useState<CommitMessageStage>('code')
  const [description, setDescription] = useState('')
  const [commitAll, setCommitAll] = useState(true)
  const workflow = useChangeGitWorkflow(changeId)

  const handleCommit = async () => {
    if (!description.trim()) return

    try {
      await workflow.commit({
        stage,
        description: description.trim(),
        all: commitAll,
      })
      setDescription('')
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to commit:', error)
    }
  }

  // 커밋 메시지 미리보기
  const previewMessage = `[${changeId}] ${stage}: ${description || '...'}`

  const stages: { value: CommitMessageStage; label: string }[] = [
    { value: 'spec', label: 'Spec' },
    { value: 'task', label: 'Task' },
    { value: 'code', label: 'Code' },
    { value: 'test', label: 'Test' },
    { value: 'commit', label: 'Commit' },
    { value: 'docs', label: 'Docs' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Change 커밋</DialogTitle>
          <DialogDescription>
            {changeTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Stage 선택 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Stage</label>
            <div className="flex flex-wrap gap-2">
              {stages.map((s) => (
                <Button
                  key={s.value}
                  size="sm"
                  variant={stage === s.value ? 'default' : 'outline'}
                  onClick={() => setStage(s.value)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          {/* 설명 입력 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">커밋 설명</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="변경 내용을 설명하세요"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {/* 커밋 메시지 미리보기 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">미리보기</label>
            <code className="block bg-muted p-3 rounded-md text-sm break-all">
              {previewMessage}
            </code>
          </div>

          {/* 옵션 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="commit-all"
              checked={commitAll}
              onChange={(e) => setCommitAll(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="commit-all" className="text-sm cursor-pointer">
              모든 변경사항 커밋 (-a)
            </label>
          </div>

          {/* 에러 표시 */}
          {workflow.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {(workflow.error as Error).message}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleCommit}
            disabled={workflow.isCommitting || !description.trim()}
          >
            {workflow.isCommitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                커밋 중...
              </>
            ) : (
              '커밋'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Change 푸시 설정 다이얼로그 ====================

export type PushTiming = 'immediate' | 'on-stage-complete' | 'manual'

interface PushSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTiming: PushTiming
  onTimingChange: (timing: PushTiming) => void
}

export function PushSettingsDialog({
  open,
  onOpenChange,
  currentTiming,
  onTimingChange,
}: PushSettingsDialogProps) {
  const [selectedTiming, setSelectedTiming] = useState<PushTiming>(currentTiming)

  const handleSave = () => {
    onTimingChange(selectedTiming)
    onOpenChange(false)
  }

  const timingOptions: { value: PushTiming; label: string; description: string }[] = [
    {
      value: 'immediate',
      label: '즉시 푸시',
      description: '커밋 후 즉시 원격 저장소에 푸시합니다.',
    },
    {
      value: 'on-stage-complete',
      label: 'Stage 완료 시',
      description: '각 Stage의 모든 태스크가 완료되면 푸시합니다.',
    },
    {
      value: 'manual',
      label: '수동',
      description: '수동으로 푸시 버튼을 눌러야 푸시됩니다.',
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>푸시 타이밍 설정</DialogTitle>
          <DialogDescription>
            커밋 후 원격 저장소에 푸시할 시점을 선택하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {timingOptions.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedTiming === option.value
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
            >
              <input
                type="radio"
                name="push-timing"
                value={option.value}
                checked={selectedTiming === option.value}
                onChange={() => setSelectedTiming(option.value)}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSave}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
