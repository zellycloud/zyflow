import { ChevronRight, ChevronDown, GitBranch, GitCommit, Upload, Settings, Calendar } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PipelineBar } from './PipelineBar'
import { StageContent } from './StageContent'
import {
  ChangeWorkflowDialog,
  ChangeCommitDialog,
  PushSettingsDialog,
  type PushTiming,
} from '@/components/git/ChangeWorkflowDialog'
import { useState } from 'react'
import type { FlowChange, Stage } from '@/types'
import { STAGE_CONFIG } from '@/constants/stages'
import { formatRelativeDate } from '@/lib/utils'
import { useCurrentChangeBranch, useChangePush } from '@/hooks/useChangeGit'

interface ChangeItemProps {
  change: FlowChange
  isExpanded: boolean
  onToggle: () => void
}

export function ChangeItem({ change, isExpanded, onToggle }: ChangeItemProps) {
  const [activeTab, setActiveTab] = useState<Stage>(change.currentStage)

  // Git 워크플로우 다이얼로그 상태
  const [showStartDialog, setShowStartDialog] = useState(false)
  const [showCommitDialog, setShowCommitDialog] = useState(false)
  const [showPushSettings, setShowPushSettings] = useState(false)
  const [pushTiming, setPushTiming] = useState<PushTiming>('manual')

  // Git 상태 조회
  const { data: currentBranch } = useCurrentChangeBranch()
  const changePush = useChangePush()

  // 현재 Change 브랜치에 있는지 확인
  const isOnChangeBranch = currentBranch?.isChangeBranch && currentBranch?.changeId === change.id
  const branchName = `change/${change.id}`

  // 푸시 핸들러
  const handlePush = async () => {
    try {
      await changePush.mutateAsync({ changeId: change.id })
    } catch (error) {
      console.error('Push failed:', error)
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Collapsed / Header */}
      <div className="flex items-center">
        <button
          className="flex-1 flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
          onClick={onToggle}
        >
          {/* Toggle Icon */}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          {/* Title */}
          <span className="font-medium truncate flex-1">{change.title}</span>

          {/* Created Date */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Calendar className="h-3 w-3" />
                {formatRelativeDate(change.createdAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              생성일: {change.createdAt ? new Date(change.createdAt).toLocaleString('ko-KR') : '-'}
            </TooltipContent>
          </Tooltip>

          {/* Current Stage Badge */}
          <Badge variant="outline" className="shrink-0 flex items-center gap-1">
            {(() => {
              const IconComponent = STAGE_CONFIG[change.currentStage].icon
              return <IconComponent className="h-3 w-3" />
            })()}
            {STAGE_CONFIG[change.currentStage].label}
          </Badge>

          {/* Progress */}
          <div className="w-24 shrink-0 flex items-center gap-2">
            <Progress value={change.progress} className="h-2" />
            <span className="text-xs text-muted-foreground w-8">{change.progress}%</span>
          </div>
        </button>

        {/* Git Workflow Buttons */}
        <div className="flex items-center gap-1 pr-4">
          {/* 브랜치 시작/전환 버튼 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isOnChangeBranch ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowStartDialog(true)
                }}
              >
                <GitBranch className={`h-4 w-4 ${isOnChangeBranch ? 'text-green-600' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isOnChangeBranch ? `현재 브랜치: ${branchName}` : '브랜치 시작'}
            </TooltipContent>
          </Tooltip>

          {/* 커밋 버튼 (브랜치에 있을 때만) */}
          {isOnChangeBranch && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCommitDialog(true)
                  }}
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
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePush()
                  }}
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
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowPushSettings(true)
                  }}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>푸시 설정</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t">
          {/* Pipeline Bar */}
          <div className="p-4 bg-muted/30">
            <PipelineBar
              stages={change.stages}
              currentStage={change.currentStage}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>

          {/* Stage Content */}
          <div className="p-4">
            <StageContent
              changeId={change.id}
              stage={activeTab}
              tasks={change.stages?.[activeTab]?.tasks ?? []}
              specPath={change.specPath}
            />
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ChangeWorkflowDialog
        changeId={change.id}
        changeTitle={change.title}
        open={showStartDialog}
        onOpenChange={setShowStartDialog}
      />
      <ChangeCommitDialog
        changeId={change.id}
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
    </div>
  )
}
