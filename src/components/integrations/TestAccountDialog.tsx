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
import { Loader2 } from 'lucide-react';
import {
  useCreateTestAccount,
  useUpdateTestAccount,
  type TestAccount,
} from '@/hooks/useIntegrations';
import { toast } from 'sonner';

interface TestAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  account?: TestAccount | null;
}

export function TestAccountDialog({
  open,
  onOpenChange,
  projectId,
  account,
}: TestAccountDialogProps) {
  const isEditing = !!account;
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [description, setDescription] = useState('');

  const createAccount = useCreateTestAccount();
  const updateAccount = useUpdateTestAccount();

  useEffect(() => {
    if (account) {
      setRole(account.role);
      setEmail(account.email);
      setPassword(''); // 암호화되어 있으므로 빈 값으로 시작
      setDescription(account.description ?? '');
    } else {
      setRole('');
      setEmail('');
      setPassword('');
      setDescription('');
    }
  }, [account, open]);

  const handleSubmit = async () => {
    try {
      if (isEditing && account) {
        await updateAccount.mutateAsync({
          projectId,
          id: account.id,
          role: role.trim() || undefined,
          email: email.trim() || undefined,
          password: password.trim() || undefined,
          description: description.trim() || undefined,
        });
        toast.success('테스트 계정이 수정되었습니다');
      } else {
        if (!role.trim() || !email.trim() || !password.trim()) {
          toast.error('역할, 이메일, 비밀번호를 모두 입력하세요');
          return;
        }
        await createAccount.mutateAsync({
          projectId,
          role: role.trim(),
          email: email.trim(),
          password: password.trim(),
          description: description.trim() || undefined,
        });
        toast.success('테스트 계정이 생성되었습니다');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장 실패');
    }
  };

  const isPending = createAccount.isPending || updateAccount.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? '테스트 계정 수정' : '테스트 계정 추가'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? '테스트 계정 정보를 수정합니다. 빈 필드는 기존 값을 유지합니다.'
              : '개발/테스트에 사용할 계정 정보를 저장합니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="role">역할 *</Label>
            <Input
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="예: admin, user, guest"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">이메일 *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">비밀번호 *</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEditing ? '변경하려면 입력' : '비밀번호 입력'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 관리자 테스트용 계정"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || (!isEditing && (!role.trim() || !email.trim() || !password.trim()))}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
