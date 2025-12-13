/**
 * Post-Task View
 *
 * Post-Task Agent 웹 UI 메인 뷰
 */

import { useState } from 'react'
import { Sparkles, Play, FileText, Archive, Zap } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskRunnerTab } from './TaskRunnerTab'
import { ReportsTab } from './ReportsTab'
import { QuarantineTab } from './QuarantineTab'
import { TriggersTab } from './TriggersTab'

interface PostTaskViewProps {
  projectId: string
  projectPath: string
}

export function PostTaskView({ projectPath }: PostTaskViewProps) {
  const [activeTab, setActiveTab] = useState('runner')

  if (!projectPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <Sparkles className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg">프로젝트 경로를 찾을 수 없습니다</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Post-Task Agent</h1>
          <p className="text-sm text-muted-foreground">
            코드 품질 점검, 테스트 자동화, CI/CD 분석
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="runner" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            <span>실행</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>리포트</span>
          </TabsTrigger>
          <TabsTrigger value="quarantine" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            <span>Quarantine</span>
          </TabsTrigger>
          <TabsTrigger value="triggers" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span>트리거</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runner" className="flex-1 mt-0">
          <TaskRunnerTab projectPath={projectPath} />
        </TabsContent>

        <TabsContent value="reports" className="flex-1 mt-0">
          <ReportsTab projectPath={projectPath} />
        </TabsContent>

        <TabsContent value="quarantine" className="flex-1 mt-0">
          <QuarantineTab projectPath={projectPath} />
        </TabsContent>

        <TabsContent value="triggers" className="flex-1 mt-0">
          <TriggersTab projectPath={projectPath} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
