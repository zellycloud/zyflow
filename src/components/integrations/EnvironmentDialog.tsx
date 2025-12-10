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
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  useCreateEnvironment,
  useUpdateEnvironment,
  type Environment,
} from '@/hooks/useIntegrations';
import { toast } from 'sonner';

interface EnvironmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  environment?: Environment | null;
}

export function EnvironmentDialog({
  open,
  onOpenChange,
  projectId,
  environment,
}: EnvironmentDialogProps) {
  const isEditing = !!environment;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [databaseUrl, setDatabaseUrl] = useState('');
  const [variables, setVariables] = useState<Array<{ key: string; value: string }>>([]);

  const createEnv = useCreateEnvironment();
  const updateEnv = useUpdateEnvironment();

  useEffect(() => {
    if (environment) {
      setName(environment.name);
      setDescription(environment.description ?? '');
      setServerUrl(environment.serverUrl ?? '');
      setDatabaseUrl(''); // 암호화되어 있으므로 빈 값으로 시작
      setVariables(
        Object.entries(environment.variables).map(([key, value]) => ({
          key,
          value: '', // 마스킹된 값이므로 빈 값으로 시작
        }))
      );
    } else {
      setName('');
      setDescription('');
      setServerUrl('');
      setDatabaseUrl('');
      setVariables([{ key: '', value: '' }]);
    }
  }, [environment, open]);

  const handleVariableChange = (index: number, field: 'key' | 'value', value: string) => {
    setVariables((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addVariable = () => {
    setVariables((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeVariable = (index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    try {
      const varsObj: Record<string, string> = {};
      variables.forEach(({ key, value }) => {
        if (key.trim() && value.trim()) {
          varsObj[key.trim()] = value;
        }
      });

      if (isEditing && environment) {
        await updateEnv.mutateAsync({
          projectId,
          envId: environment.id,
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          serverUrl: serverUrl.trim() || undefined,
          databaseUrl: databaseUrl.trim() || undefined,
          variables: Object.keys(varsObj).length > 0 ? varsObj : undefined,
        });
        toast.success('환경이 수정되었습니다');
      } else {
        if (!name.trim()) {
          toast.error('환경 이름을 입력하세요');
          return;
        }
        await createEnv.mutateAsync({
          projectId,
          name: name.trim(),
          description: description.trim() || undefined,
          serverUrl: serverUrl.trim() || undefined,
          databaseUrl: databaseUrl.trim() || undefined,
          variables: varsObj,
        });
        toast.success('환경이 생성되었습니다');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장 실패');
    }
  };

  const isPending = createEnv.isPending || updateEnv.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? '환경 수정' : '환경 추가'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? '환경 설정을 수정합니다. 빈 필드는 기존 값을 유지합니다.'
              : '새로운 환경(local, staging, production 등)을 추가합니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">환경 이름 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: local, staging, production"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 로컬 개발 환경"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="serverUrl">서버 URL</Label>
            <Input
              id="serverUrl"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://api.example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="databaseUrl">데이터베이스 URL</Label>
            <Input
              id="databaseUrl"
              type="password"
              value={databaseUrl}
              onChange={(e) => setDatabaseUrl(e.target.value)}
              placeholder="postgresql://..."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>환경 변수</Label>
              <Button type="button" variant="outline" size="sm" onClick={addVariable}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            {variables.map((variable, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="KEY"
                  value={variable.key}
                  onChange={(e) => handleVariableChange(index, 'key', e.target.value)}
                  className="flex-1 font-mono text-sm"
                />
                <Input
                  placeholder="value"
                  type="password"
                  value={variable.value}
                  onChange={(e) => handleVariableChange(index, 'value', e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeVariable(index)}
                  disabled={variables.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || (!isEditing && !name.trim())}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
