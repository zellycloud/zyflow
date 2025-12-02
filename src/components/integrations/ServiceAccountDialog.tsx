import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Github, Database, Triangle, Bug, Key, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  useCreateServiceAccount,
  useUpdateServiceAccount,
  type ServiceAccount,
  type ServiceType,
  type Credentials,
} from '@/hooks/useIntegrations';
import { toast } from 'sonner';

interface ServiceAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: ServiceAccount | null;
}

const SERVICE_TABS: Array<{ value: ServiceType; label: string; icon: React.ReactNode }> = [
  { value: 'github', label: 'GitHub', icon: <Github className="h-4 w-4" /> },
  { value: 'supabase', label: 'Supabase', icon: <Database className="h-4 w-4" /> },
  { value: 'vercel', label: 'Vercel', icon: <Triangle className="h-4 w-4" /> },
  { value: 'sentry', label: 'Sentry', icon: <Bug className="h-4 w-4" /> },
  { value: 'custom', label: 'Custom', icon: <Key className="h-4 w-4" /> },
];

export function ServiceAccountDialog({ open, onOpenChange, account }: ServiceAccountDialogProps) {
  const isEditing = !!account;
  const [selectedType, setSelectedType] = useState<ServiceType>('github');
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>([]);

  const createAccount = useCreateServiceAccount();
  const updateAccount = useUpdateServiceAccount();

  // 편집 모드일 때 폼 초기화
  useEffect(() => {
    if (account) {
      setSelectedType(account.type);
      setName(account.name);
      // credentials는 마스킹되어 있으므로 빈 값으로 시작
      setCredentials({});
      if (account.type === 'custom') {
        setCustomFields(
          Object.entries(account.credentials).map(([key]) => ({ key, value: '' }))
        );
      }
    } else {
      setSelectedType('github');
      setName('');
      setCredentials({});
      setCustomFields([{ key: '', value: '' }]);
    }
  }, [account, open]);

  const handleCredentialChange = (field: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [field]: value }));
  };

  const handleCustomFieldChange = (index: number, field: 'key' | 'value', value: string) => {
    setCustomFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addCustomField = () => {
    setCustomFields((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeCustomField = (index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  };

  const getCredentialsFromForm = (): Credentials => {
    if (selectedType === 'custom') {
      const customCreds: Record<string, string> = {};
      customFields.forEach(({ key, value }) => {
        if (key.trim() && value.trim()) {
          customCreds[key.trim()] = value;
        }
      });
      return customCreds;
    }
    return credentials as Credentials;
  };

  const handleSubmit = async () => {
    try {
      const creds = getCredentialsFromForm();

      if (isEditing && account) {
        await updateAccount.mutateAsync({
          id: account.id,
          name: name.trim() || undefined,
          credentials: Object.keys(creds).length > 0 ? creds : undefined,
        });
        toast.success('계정이 수정되었습니다');
      } else {
        await createAccount.mutateAsync({
          type: selectedType,
          name: name.trim(),
          credentials: creds,
        });
        toast.success('계정이 생성되었습니다');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장 실패');
    }
  };

  const isPending = createAccount.isPending || updateAccount.isPending;

  const renderCredentialFields = () => {
    switch (selectedType) {
      case 'github':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                value={credentials.username || ''}
                onChange={(e) => handleCredentialChange('username', e.target.value)}
                placeholder="hansooha"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token">Personal Access Token *</Label>
              <Input
                id="token"
                type="password"
                value={credentials.token || ''}
                onChange={(e) => handleCredentialChange('token', e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={credentials.email || ''}
                onChange={(e) => handleCredentialChange('email', e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sshKeyPath">SSH Key Path (optional)</Label>
              <Input
                id="sshKeyPath"
                value={credentials.sshKeyPath || ''}
                onChange={(e) => handleCredentialChange('sshKeyPath', e.target.value)}
                placeholder="~/.ssh/id_ed25519"
              />
            </div>
          </>
        );

      case 'supabase':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="projectUrl">Project URL *</Label>
              <Input
                id="projectUrl"
                value={credentials.projectUrl || ''}
                onChange={(e) => handleCredentialChange('projectUrl', e.target.value)}
                placeholder="https://abcdef.supabase.co"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="anonKey">Anon Key *</Label>
              <Input
                id="anonKey"
                type="password"
                value={credentials.anonKey || ''}
                onChange={(e) => handleCredentialChange('anonKey', e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceRoleKey">Service Role Key (optional)</Label>
              <Input
                id="serviceRoleKey"
                type="password"
                value={credentials.serviceRoleKey || ''}
                onChange={(e) => handleCredentialChange('serviceRoleKey', e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
              />
            </div>
          </>
        );

      case 'vercel':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="token">Token *</Label>
              <Input
                id="token"
                type="password"
                value={credentials.token || ''}
                onChange={(e) => handleCredentialChange('token', e.target.value)}
                placeholder="vercel_xxxxxxxxxxxx"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamId">Team ID (optional)</Label>
              <Input
                id="teamId"
                value={credentials.teamId || ''}
                onChange={(e) => handleCredentialChange('teamId', e.target.value)}
                placeholder="team_xxxxxxxxxxxx"
              />
            </div>
          </>
        );

      case 'sentry':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="dsn">DSN *</Label>
              <Input
                id="dsn"
                value={credentials.dsn || ''}
                onChange={(e) => handleCredentialChange('dsn', e.target.value)}
                placeholder="https://xxxxxxx@sentry.io/123456"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgSlug">Organization Slug *</Label>
              <Input
                id="orgSlug"
                value={credentials.orgSlug || ''}
                onChange={(e) => handleCredentialChange('orgSlug', e.target.value)}
                placeholder="my-org"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectSlug">Project Slug *</Label>
              <Input
                id="projectSlug"
                value={credentials.projectSlug || ''}
                onChange={(e) => handleCredentialChange('projectSlug', e.target.value)}
                placeholder="my-project"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="authToken">Auth Token (optional)</Label>
              <Input
                id="authToken"
                type="password"
                value={credentials.authToken || ''}
                onChange={(e) => handleCredentialChange('authToken', e.target.value)}
                placeholder="sntrys_xxxxxxxxxxxx"
              />
            </div>
          </>
        );

      case 'custom':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Key-Value Pairs</Label>
              <Button type="button" variant="outline" size="sm" onClick={addCustomField}>
                <Plus className="h-3 w-3 mr-1" />
                Add Field
              </Button>
            </div>
            {customFields.map((field, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="Key"
                  value={field.key}
                  onChange={(e) => handleCustomFieldChange(index, 'key', e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Value"
                  type="password"
                  value={field.value}
                  onChange={(e) => handleCustomFieldChange(index, 'value', e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCustomField(index)}
                  disabled={customFields.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? '서비스 계정 수정' : '서비스 계정 추가'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? '계정 정보를 수정합니다. 빈 필드는 기존 값을 유지합니다.'
              : '외부 서비스의 인증 정보를 안전하게 저장합니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!isEditing && (
            <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as ServiceType)}>
              <TabsList className="grid grid-cols-5 w-full">
                {SERVICE_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1">
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">계정 이름 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: Personal, Work, zellycloud"
            />
          </div>

          <div className="space-y-4 pt-2">{renderCredentialFields()}</div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
