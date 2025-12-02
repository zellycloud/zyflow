import { useState } from 'react';
import {
  Github,
  Database,
  Triangle,
  Bug,
  Key,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  Settings2,
  Users,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useProjectIntegration,
  useSetProjectService,
  useServiceAccounts,
  useEnvironments,
  useTestAccounts,
  useActivateEnvironment,
  useDeleteEnvironment,
  useDeleteTestAccount,
  type ServiceType,
  type Environment,
  type TestAccount,
} from '@/hooks/useIntegrations';
import { EnvironmentDialog } from './EnvironmentDialog';
import { TestAccountDialog } from './TestAccountDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

interface ProjectIntegrationsProps {
  projectId: string;
}

const SERVICE_CONFIG: Array<{
  type: ServiceType;
  label: string;
  icon: React.ReactNode;
  color: string;
}> = [
  { type: 'github', label: 'GitHub', icon: <Github className="h-4 w-4" />, color: 'bg-gray-500' },
  { type: 'supabase', label: 'Supabase', icon: <Database className="h-4 w-4" />, color: 'bg-green-500' },
  { type: 'vercel', label: 'Vercel', icon: <Triangle className="h-4 w-4" />, color: 'bg-black dark:bg-white dark:text-black' },
  { type: 'sentry', label: 'Sentry', icon: <Bug className="h-4 w-4" />, color: 'bg-purple-500' },
];

export function ProjectIntegrations({ projectId }: ProjectIntegrationsProps) {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="services" className="space-y-4">
        <TabsList>
          <TabsTrigger value="services" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            서비스 연결
          </TabsTrigger>
          <TabsTrigger value="environments" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            환경 설정
          </TabsTrigger>
          <TabsTrigger value="test-accounts" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            테스트 계정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services">
          <ServiceConnections projectId={projectId} />
        </TabsContent>

        <TabsContent value="environments">
          <EnvironmentSettings projectId={projectId} />
        </TabsContent>

        <TabsContent value="test-accounts">
          <TestAccountSettings projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================
// 서비스 연결 탭
// =============================================

function ServiceConnections({ projectId }: { projectId: string }) {
  const { data: integration, isLoading: integrationLoading } = useProjectIntegration(projectId);
  const { data: accounts, isLoading: accountsLoading } = useServiceAccounts();
  const setService = useSetProjectService();

  const handleServiceChange = async (serviceType: ServiceType, accountId: string | null) => {
    try {
      await setService.mutateAsync({
        projectId,
        serviceType,
        accountId: accountId === 'none' ? null : accountId,
      });
      toast.success('서비스 연결이 업데이트되었습니다');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '업데이트 실패');
    }
  };

  const isLoading = integrationLoading || accountsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">서비스 연결</h3>
        <p className="text-sm text-muted-foreground">
          이 프로젝트에서 사용할 서비스 계정을 선택합니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SERVICE_CONFIG.map(({ type, label, icon, color }) => {
          const connectedAccountId = integration?.integrations?.[type];
          const connectedAccount = accounts?.find((a) => a.id === connectedAccountId);
          const availableAccounts = accounts?.filter((a) => a.type === type) ?? [];

          return (
            <Card key={type}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-md ${color} text-white`}>{icon}</div>
                  <CardTitle className="text-base">{label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Select
                  value={connectedAccountId ?? 'none'}
                  onValueChange={(value) => handleServiceChange(type, value)}
                  disabled={setService.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="계정 선택">
                      {connectedAccount ? connectedAccount.name : '연결 안됨'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">연결 안됨</SelectItem>
                    {availableAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableAccounts.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Settings &gt; Integrations에서 {label} 계정을 먼저 등록하세요.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// =============================================
// 환경 설정 탭
// =============================================

function EnvironmentSettings({ projectId }: { projectId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: environments, isLoading } = useEnvironments(projectId);
  const activateEnv = useActivateEnvironment();
  const deleteEnv = useDeleteEnvironment();

  const handleEdit = (env: Environment) => {
    setEditingEnv(env);
    setDialogOpen(true);
  };

  const handleActivate = async (envId: string) => {
    try {
      await activateEnv.mutateAsync({ projectId, envId });
      toast.success('환경이 활성화되었습니다');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '활성화 실패');
    }
  };

  const handleDelete = async (envId: string) => {
    try {
      await deleteEnv.mutateAsync({ projectId, envId });
      toast.success('환경이 삭제되었습니다');
      setDeleteConfirm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제 실패');
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingEnv(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">환경 설정</h3>
          <p className="text-sm text-muted-foreground">
            local, staging, production 등 환경별 설정을 관리합니다.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          환경 추가
        </Button>
      </div>

      {!environments?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Globe className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              등록된 환경이 없습니다.
              <br />
              환경을 추가하여 환경별 설정을 관리하세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {environments.map((env) => (
            <Card key={env.id} className={env.isActive ? 'border-primary' : ''}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{env.name}</span>
                    {env.isActive && (
                      <Badge variant="default" className="text-xs">
                        Active
                      </Badge>
                    )}
                  </div>
                  {env.description && (
                    <p className="text-sm text-muted-foreground">{env.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {env.serverUrl && <span>URL: {env.serverUrl}</span>}
                    <span>{Object.keys(env.variables).length} 환경변수</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!env.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleActivate(env.id)}
                      disabled={activateEnv.isPending}
                    >
                      활성화
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(env)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirm(env.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EnvironmentDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        projectId={projectId}
        environment={editingEnv}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        title="환경 삭제"
        description="이 환경을 삭제하시겠습니까? 저장된 환경 변수도 함께 삭제됩니다."
        confirmText="삭제"
        cancelText="취소"
        variant="destructive"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        isLoading={deleteEnv.isPending}
      />
    </div>
  );
}

// =============================================
// 테스트 계정 탭
// =============================================

function TestAccountSettings({ projectId }: { projectId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TestAccount | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: accounts, isLoading } = useTestAccounts(projectId);
  const deleteAccount = useDeleteTestAccount();

  const handleEdit = (account: TestAccount) => {
    setEditingAccount(account);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAccount.mutateAsync({ projectId, id });
      toast.success('테스트 계정이 삭제되었습니다');
      setDeleteConfirm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제 실패');
    }
  };

  const handleCopy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('클립보드에 복사되었습니다');
    } catch {
      toast.error('복사 실패');
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingAccount(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">테스트 계정</h3>
          <p className="text-sm text-muted-foreground">
            개발/테스트용 계정 정보를 안전하게 저장합니다.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          계정 추가
        </Button>
      </div>

      {!accounts?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Users className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              등록된 테스트 계정이 없습니다.
              <br />
              테스트 계정을 추가하여 빠르게 로그인 정보를 확인하세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{account.role}</Badge>
                    <span className="font-medium">{account.email}</span>
                  </div>
                  {account.description && (
                    <p className="text-sm text-muted-foreground">{account.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Password: {account.password}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleCopy(account.email, `email-${account.id}`)}
                    >
                      {copiedId === `email-${account.id}` ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(account)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirm(account.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TestAccountDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        projectId={projectId}
        account={editingAccount}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        title="테스트 계정 삭제"
        description="이 테스트 계정을 삭제하시겠습니까?"
        confirmText="삭제"
        cancelText="취소"
        variant="destructive"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        isLoading={deleteAccount.isPending}
      />
    </div>
  );
}
