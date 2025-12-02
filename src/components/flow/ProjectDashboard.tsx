import { Loader2, GitBranch, CheckCircle2, Clock, BarChart3, Link2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFlowChanges } from '@/hooks/useFlowChanges'
import { useProjectsAllData } from '@/hooks/useProjects'
import { ProjectIntegrations } from '@/components/integrations'

interface ProjectDashboardProps {
  projectId: string
}

export function ProjectDashboard({ projectId }: ProjectDashboardProps) {
  const { data: projectsData } = useProjectsAllData()
  const { data: changes, isLoading } = useFlowChanges()

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

  const activeChanges = changes?.filter((c) => c.status === 'active') ?? []
  const completedChanges = changes?.filter((c) => c.status === 'completed') ?? []
  const totalProgress =
    activeChanges.length > 0
      ? Math.round(
          activeChanges.reduce((sum, c) => sum + c.progress, 0) / activeChanges.length
        )
      : 0

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{project.path}</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">진행중</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeChanges.length}</div>
                <p className="text-xs text-muted-foreground">
                  활성 Changes
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
                  완료된 Changes
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
              {activeChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  진행중인 Change가 없습니다
                </p>
              ) : (
                <div className="space-y-4">
                  {activeChanges.map((change) => (
                    <div
                      key={change.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{change.title}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {change.currentStage}
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

        <TabsContent value="integrations">
          <ProjectIntegrations projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
