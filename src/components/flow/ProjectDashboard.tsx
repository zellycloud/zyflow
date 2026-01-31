import { Loader2, GitBranch, CheckCircle2, BarChart3, Link2, GitFork } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useFlowChanges } from '@/hooks/useFlowChanges'
import { useProjectsAllData } from '@/hooks/useProjects'
import { useHideCompletedSpecs } from '@/hooks/useHideCompletedSpecs'
import { ProjectIntegrations } from '@/components/integrations'
import { ProjectDiagramTab } from '@/components/diagram/ProjectDiagramTab'

interface ProjectDashboardProps {
  projectId: string
}

export function ProjectDashboard({ projectId }: ProjectDashboardProps) {
  const { data: projectsData } = useProjectsAllData()
  const { isLoading } = useFlowChanges()
  const { hideCompleted, setHideCompleted } = useHideCompletedSpecs()

  const project = projectsData?.projects.find((p) => p.id === projectId)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>로딩 중...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>프로젝트를 찾을 수 없습니다</p>
      </div>
    )
  }

  // Use project.changes for better type information (includes type: 'spec' | 'openspec')
  type ChangeWithType = { id: string; title: string; progress: number; type?: string; status?: string; updatedAt?: string; currentStage?: string }
  const allProjectChanges = (project?.changes ?? []) as ChangeWithType[]

  // Filter by type for summary cards
  const moaiSpecs = allProjectChanges.filter((c) => c.type === 'spec')
  const openspecChanges = allProjectChanges.filter((c) => c.type === 'openspec')

  // Filter for Changes list (apply hideCompleted toggle)
  const filteredChanges = allProjectChanges.filter((c) => {
    if (hideCompleted && c.status === 'completed') return false
    return true
  })

  // Completed changes for summary
  const completedChanges = allProjectChanges.filter((c) => c.status === 'completed')

  // Calculate average progress from non-completed items
  const activeItems = allProjectChanges.filter((c) => c.status !== 'completed')
  const totalProgress = activeItems.length > 0
    ? Math.round(activeItems.reduce((sum, c) => sum + (c.progress || 0), 0) / activeItems.length)
    : 0

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{project.path}</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="diagram" className="flex items-center gap-2">
              <GitFork className="h-4 w-4" />
              Diagram
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Integrations
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Switch
              id="hide-completed-dashboard"
              checked={hideCompleted}
              onCheckedChange={setHideCompleted}
            />
            <Label
              htmlFor="hide-completed-dashboard"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              완료 숨기기
            </Label>
          </div>
        </div>

        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">MoAI SPEC</CardTitle>
                <span className="text-purple-600 dark:text-purple-400 text-[10px] font-semibold">SPEC</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {hideCompleted
                    ? moaiSpecs.filter((s) => s.status !== 'completed').length
                    : moaiSpecs.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {hideCompleted ? '활성 MoAI SPECs' : '전체 MoAI SPECs'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">OpenSpec</CardTitle>
                <span className="text-blue-600 dark:text-blue-400 text-[10px] font-semibold">OPEN</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{openspecChanges.length}</div>
                <p className="text-xs text-muted-foreground">
                  OpenSpec Changes
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">완료</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{completedChanges.length}</div>
                <p className="text-xs text-muted-foreground">
                  완료된 항목
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">평균 진행률</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalProgress}%</div>
                <Progress value={totalProgress} className="mt-2" />
              </CardContent>
            </Card>
          </div>

          {/* Changes List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Changes
              </CardTitle>
              <CardDescription>
                프로젝트의 모든 변경 제안 목록입니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {hideCompleted ? '진행중인 Change가 없습니다' : 'Change가 없습니다'}
                </p>
              ) : (
                <div className="space-y-4">
                  {filteredChanges.map((change) => (
                    <div
                      key={change.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {/* Type label */}
                          {change.type === 'spec' ? (
                            <span className="text-purple-600 dark:text-purple-400 text-[10px] font-semibold shrink-0">SPEC</span>
                          ) : change.type === 'openspec' ? (
                            <span className="text-blue-600 dark:text-blue-400 text-[10px] font-semibold shrink-0">OPEN</span>
                          ) : null}
                          <p className="font-medium">{change.title}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {change.currentStage || 'spec'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {change.progress}% 완료
                          </span>
                        </div>
                      </div>
                      <div className="w-24">
                        <Progress value={change.progress} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagram">
          <ProjectDiagramTab projectId={projectId} projectPath={project.path} />
        </TabsContent>

        <TabsContent value="integrations">
          <ProjectIntegrations projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
