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
  Upload,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useServiceAccounts,
  useDeleteServiceAccount,
  type ServiceAccount,
  type ServiceType,
} from '@/hooks/useIntegrations';
import { ServiceAccountDialog } from './ServiceAccountDialog';
import { EnvImportDialog } from './EnvImportDialog';
import { SystemImportDialog } from './SystemImportDialog';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const SERVICE_ICONS: Record<ServiceType, React.ReactNode> = {
  github: <Github className="h-4 w-4" />,
  supabase: <Database className="h-4 w-4" />,
  vercel: <Triangle className="h-4 w-4" />,
  sentry: <Bug className="h-4 w-4" />,
  custom: <Key className="h-4 w-4" />,
};

const SERVICE_LABELS: Record<ServiceType, string> = {
  github: 'GitHub',
  supabase: 'Supabase',
  vercel: 'Vercel',
  sentry: 'Sentry',
  custom: 'Custom',
};

const SERVICE_COLORS: Record<ServiceType, string> = {
  github: 'bg-gray-500',
  supabase: 'bg-green-500',
  vercel: 'bg-black dark:bg-white dark:text-black',
  sentry: 'bg-purple-500',
  custom: 'bg-blue-500',
};

interface ServiceAccountListProps {
  onEdit?: (account: ServiceAccount) => void;
}

export function ServiceAccountList({ onEdit }: ServiceAccountListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [systemImportDialogOpen, setSystemImportDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ServiceAccount | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: accounts, isLoading } = useServiceAccounts();
  const deleteAccount = useDeleteServiceAccount();

  const handleEdit = (account: ServiceAccount) => {
    setEditingAccount(account);
    setDialogOpen(true);
    onEdit?.(account);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAccount.mutateAsync(id);
      toast.success('계정이 삭제되었습니다');
      setDeleteConfirm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제 실패');
    }
  };

  const handleCopy = async (account: ServiceAccount, field: string) => {
    const value = account.credentials[field];
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(`${account.id}-${field}`);
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

  // 타입별로 그룹화
  const groupedAccounts = accounts?.reduce(
    (acc, account) => {
      if (!acc[account.type]) {
        acc[account.type] = [];
      }
      acc[account.type].push(account);
      return acc;
    },
    {} as Record<ServiceType, ServiceAccount[]>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">서비스 계정</h3>
          <p className="text-sm text-muted-foreground">
            GitHub, Supabase, Vercel 등 외부 서비스 계정을 관리합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import from .env
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSystemImportDialogOpen(true)}>
                <Terminal className="h-4 w-4 mr-2" />
                Import from System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            계정 추가
          </Button>
        </div>
      </div>

      {!accounts?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Key className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              등록된 서비스 계정이 없습니다.
              <br />
              계정을 추가하여 프로젝트와 연결하세요.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              첫 계정 추가하기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedAccounts || {}).map(([type, typeAccounts]) => (
            <Card key={type}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`p-2 rounded-md ${SERVICE_COLORS[type as ServiceType]} text-white`}
                  >
                    {SERVICE_ICONS[type as ServiceType]}
                  </div>
                  <CardTitle className="text-base">
                    {SERVICE_LABELS[type as ServiceType]}
                  </CardTitle>
                  <Badge variant="secondary" className="ml-auto">
                    {typeAccounts.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y">
                  {typeAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{account.name}</span>
                          {account.environment && (
                            <Badge
                              variant="outline"
                              className={
                                account.environment === 'production'
                                  ? 'text-xs bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                                  : 'text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'
                              }
                            >
                              {account.environment === 'production' ? 'Production' : 'Staging'}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {Object.entries(account.credentials)
                            .slice(0, 2)
                            .map(([key, value]) => (
                              <div key={key} className="flex items-center gap-1">
                                <span className="text-xs font-mono bg-muted px-1 rounded">
                                  {key}
                                </span>
                                <span className="truncate max-w-[150px]">{value}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => handleCopy(account, key)}
                                >
                                  {copiedId === `${account.id}-${key}` ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(account)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(account.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ServiceAccountDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        account={editingAccount}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        title="계정 삭제"
        description="이 서비스 계정을 삭제하시겠습니까? 이 계정을 사용하는 프로젝트 연결도 해제됩니다."
        confirmText="삭제"
        cancelText="취소"
        variant="destructive"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        isLoading={deleteAccount.isPending}
      />

      <EnvImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />

      <SystemImportDialog
        open={systemImportDialogOpen}
        onOpenChange={setSystemImportDialogOpen}
      />
    </div>
  );
}
