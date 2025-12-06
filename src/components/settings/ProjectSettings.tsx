import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Settings,
  Loader2,
  Globe,
  HardDrive,
  ChevronDown,
  ChevronRight,
  Github,
  Database,
  Cloud,
  AlertCircle,
  FileCode,
  Users,
  Download,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLocalSettingsStatus, useExportToLocal } from '@/hooks/useProjects'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Project, ApiResponse, SettingsSource } from '@/types'

interface ProjectSettingsProps {
  project: Project
}

// Source 배지 컴포넌트
function SourceBadge({ source }: { source: SettingsSource }) {
  if (source === 'local') {
    return (
      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
        <HardDrive className="h-3 w-3 mr-1" />
        Local
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-xs bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20">
      <Globe className="h-3 w-3 mr-1" />
      Global
    </Badge>
  )
}

// 서비스 아이콘 컴포넌트
function ServiceIcon({ type }: { type: string }) {
  switch (type) {
    case 'github':
      return <Github className="h-4 w-4" />
    case 'supabase':
      return <Database className="h-4 w-4" />
    case 'vercel':
      return <Cloud className="h-4 w-4" />
    case 'sentry':
      return <AlertCircle className="h-4 w-4" />
    default:
      return <Settings className="h-4 w-4" />
  }
}

// 프로젝트 컨텍스트 조회 훅
function useProjectContext(projectId: string, projectPath: string) {
  return useQuery({
    queryKey: ['project-context', projectId, projectPath],
    queryFn: async () => {
      const response = await fetch(
        `/api/integrations/projects/${projectId}/context?projectPath=${encodeURIComponent(projectPath)}`
      )
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error || 'Failed to fetch project context')
      }
      return json as {
        context: {
          integrations: Record<string, { connected: boolean; accountName?: string }>
          environments: string[]
          activeEnvironment?: string
          source?: SettingsSource
          sources?: Record<string, SettingsSource>
        }
        source: SettingsSource
        sources?: Record<string, SettingsSource>
      }
    },
    staleTime: 30000,
  })
}

// 환경 목록 조회 훅
function useEnvironments(projectId: string, projectPath: string) {
  return useQuery({
    queryKey: ['project-environments', projectId, projectPath],
    queryFn: async () => {
      const response = await fetch(
        `/api/integrations/projects/${projectId}/environments?projectPath=${encodeURIComponent(projectPath)}`
      )
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error || 'Failed to fetch environments')
      }
      return json as {
        environments: Array<{
          id: string
          name: string
          isActive: boolean
          source: SettingsSource
          hasVariables?: boolean
        }>
        source: SettingsSource
      }
    },
    staleTime: 30000,
  })
}

// 테스트 계정 목록 조회 훅
function useTestAccounts(projectId: string, projectPath: string) {
  return useQuery({
    queryKey: ['project-test-accounts', projectId, projectPath],
    queryFn: async () => {
      const response = await fetch(
        `/api/integrations/projects/${projectId}/test-accounts?projectPath=${encodeURIComponent(projectPath)}`
      )
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error || 'Failed to fetch test accounts')
      }
      return json as {
        accounts: Array<{
          id: string
          role: string
          email: string
          description?: string
          source: SettingsSource
        }>
        source: SettingsSource
      }
    },
    staleTime: 30000,
  })
}

export function ProjectSettings({ project }: ProjectSettingsProps) {
  const [integrationsOpen, setIntegrationsOpen] = useState(true)
  const [environmentsOpen, setEnvironmentsOpen] = useState(true)
  const [testAccountsOpen, setTestAccountsOpen] = useState(true)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  const { data: localStatus, isLoading: statusLoading } = useLocalSettingsStatus(project.path)
  const { data: contextData, isLoading: contextLoading } = useProjectContext(project.id, project.path)
  const { data: envData, isLoading: envLoading } = useEnvironments(project.id, project.path)
  const { data: testAccountData, isLoading: testAccountLoading } = useTestAccounts(project.id, project.path)
  const exportToLocal = useExportToLocal()

  const handleExportToLocal = async () => {
    try {
      const result = await exportToLocal.mutateAsync({
        projectId: project.id,
        projectPath: project.path,
      })
      toast.success(`로컬 설정으로 내보냈습니다 (${result.exported.length}개 파일)`)
      setExportDialogOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내보내기 실패')
    }
  }

  const isLoading = statusLoading || contextLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const serviceTypes = ['github', 'supabase', 'vercel', 'sentry'] as const
  const integrations = contextData?.context?.integrations || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {project.name} Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            프로젝트별 통합 설정을 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {localStatus?.hasLocal ? (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <HardDrive className="h-3 w-3 mr-1" />
              로컬 설정 사용 중
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-500/10 text-gray-600 dark:text-gray-400">
              <Globe className="h-3 w-3 mr-1" />
              전역 설정 사용 중
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportDialogOpen(true)}
          >
            <Download className="h-4 w-4 mr-1" />
            Export to Local
          </Button>
        </div>
      </div>

      {/* Integrations Section */}
      <Collapsible open={integrationsOpen} onOpenChange={setIntegrationsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-start px-0 hover:bg-transparent">
            {integrationsOpen ? (
              <ChevronDown className="h-4 w-4 mr-2" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-2" />
            )}
            <span className="font-medium">Integrations</span>
            {contextData?.source && (
              <span className="ml-auto">
                <SourceBadge source={contextData.source} />
              </span>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="border rounded-lg divide-y">
            {serviceTypes.map((type) => {
              const integration = integrations[type]
              const isConnected = integration?.connected

              return (
                <div
                  key={type}
                  className="flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'p-2 rounded-lg',
                      isConnected ? 'bg-green-500/10' : 'bg-muted'
                    )}>
                      <ServiceIcon type={type} />
                    </div>
                    <div>
                      <p className="font-medium capitalize">{type}</p>
                      {integration?.accountName && (
                        <p className="text-xs text-muted-foreground">
                          {integration.accountName}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={isConnected ? 'default' : 'secondary'}
                    className={cn(
                      isConnected && 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
                    )}
                  >
                    {isConnected ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>
              )
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Environments Section */}
      <Collapsible open={environmentsOpen} onOpenChange={setEnvironmentsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-start px-0 hover:bg-transparent">
            {environmentsOpen ? (
              <ChevronDown className="h-4 w-4 mr-2" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-2" />
            )}
            <FileCode className="h-4 w-4 mr-2" />
            <span className="font-medium">Environments</span>
            {envData?.source && (
              <span className="ml-auto">
                <SourceBadge source={envData.source === 'hybrid' ? 'local' : envData.source} />
              </span>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {envLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : envData?.environments.length === 0 ? (
            <div className="text-center py-4 border rounded-lg bg-muted/30">
              <p className="text-sm text-muted-foreground">
                등록된 환경이 없습니다.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {envData?.environments.map((env) => (
                <div
                  key={env.id}
                  className="flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-3">
                    <FileCode className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{env.name}</p>
                      {env.hasVariables !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          {env.hasVariables ? '변수 설정됨' : '변수 없음'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {env.isActive && (
                      <Badge variant="outline" className="text-xs bg-primary/10">
                        Active
                      </Badge>
                    )}
                    <SourceBadge source={env.source} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Test Accounts Section */}
      <Collapsible open={testAccountsOpen} onOpenChange={setTestAccountsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-start px-0 hover:bg-transparent">
            {testAccountsOpen ? (
              <ChevronDown className="h-4 w-4 mr-2" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-2" />
            )}
            <Users className="h-4 w-4 mr-2" />
            <span className="font-medium">Test Accounts</span>
            {testAccountData?.source && (
              <span className="ml-auto">
                <SourceBadge source={testAccountData.source} />
              </span>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {testAccountLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : testAccountData?.accounts.length === 0 ? (
            <div className="text-center py-4 border rounded-lg bg-muted/30">
              <p className="text-sm text-muted-foreground">
                등록된 테스트 계정이 없습니다.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {testAccountData?.accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{account.email}</p>
                      {account.description && (
                        <p className="text-xs text-muted-foreground">
                          {account.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {account.role}
                    </Badge>
                    <SourceBadge source={account.source} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>로컬 설정으로 내보내기</DialogTitle>
            <DialogDescription>
              전역 DB의 설정을 프로젝트 로컬 폴더로 내보냅니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-sm">
              <span className="font-medium">{project.name}</span> 프로젝트의 설정을
              로컬로 내보냅니다.
            </p>
            <p className="text-xs text-muted-foreground">
              대상 경로: <code className="bg-muted px-1 rounded">{project.path}/.zyflow/</code>
            </p>
            <p className="text-xs text-muted-foreground">
              내보내기 항목: 계정 매핑, 환경 변수, 테스트 계정
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExportDialogOpen(false)}
              disabled={exportToLocal.isPending}
            >
              취소
            </Button>
            <Button onClick={handleExportToLocal} disabled={exportToLocal.isPending}>
              {exportToLocal.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  내보내는 중...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  내보내기
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
