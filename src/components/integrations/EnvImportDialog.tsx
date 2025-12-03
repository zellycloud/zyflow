import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  useImportEnv,
  type DetectedService,
  type EnvScanResult,
} from '@/hooks/useIntegrations';
import { toast } from 'sonner';

const API_BASE = 'http://localhost:3001/api/integrations';

interface EnvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectPath?: string;
}

interface SelectedService {
  type: string;
  name: string;
}

export function EnvImportDialog({
  open,
  onOpenChange,
  defaultProjectPath = '',
}: EnvImportDialogProps) {
  const [projectPath, setProjectPath] = useState(defaultProjectPath);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<EnvScanResult | null>(null);
  const [selectedServices, setSelectedServices] = useState<Map<string, SelectedService>>(
    new Map()
  );

  const importEnv = useImportEnv();

  // Reset state when dialog opens - called from onOpenChange handler
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      // Opening dialog - reset state
      setProjectPath(defaultProjectPath || '');
      setSelectedServices(new Map());
      setScanning(false);
      setScanResult(null);
    }
    onOpenChange(newOpen);
  }, [defaultProjectPath, onOpenChange]);

  const handleScan = async () => {
    if (!projectPath.trim()) {
      toast.error('프로젝트 경로를 입력해주세요');
      return;
    }

    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/env/scan?projectPath=${encodeURIComponent(projectPath)}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to scan env files');
      }
      const data = await res.json() as EnvScanResult;
      setScanResult(data);

      // Auto-select complete services without existing accounts
      const newSelected = new Map<string, SelectedService>();
      data.services.forEach((service) => {
        if (service.isComplete && !service.existingAccount) {
          newSelected.set(service.type, {
            type: service.type,
            name: service.displayName,
          });
        }
      });
      setSelectedServices(newSelected);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '스캔 실패');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleService = (service: DetectedService) => {
    const newSelected = new Map(selectedServices);
    if (newSelected.has(service.type)) {
      newSelected.delete(service.type);
    } else {
      newSelected.set(service.type, {
        type: service.type,
        name: service.displayName,
      });
    }
    setSelectedServices(newSelected);
  };

  const handleImport = async () => {
    if (selectedServices.size === 0) {
      toast.error('임포트할 서비스를 선택해주세요');
      return;
    }

    try {
      const result = await importEnv.mutateAsync({
        projectPath,
        services: Array.from(selectedServices.values()),
      });

      const messages: string[] = [];
      if (result.created > 0) messages.push(`${result.created}개 생성`);
      if (result.updated > 0) messages.push(`${result.updated}개 업데이트`);
      if (result.skipped > 0) messages.push(`${result.skipped}개 스킵`);

      toast.success(`임포트 완료: ${messages.join(', ')}`);

      if (result.errors.length > 0) {
        result.errors.forEach((err) => {
          toast.error(`${err.type}: ${err.error}`);
        });
      }

      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '임포트 실패');
    }
  };

  const isLoading = scanning || importEnv.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from .env</DialogTitle>
          <DialogDescription>
            프로젝트의 .env 파일에서 서비스 계정을 자동으로 가져옵니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Project Path Input */}
          <div className="space-y-2">
            <Label htmlFor="projectPath">프로젝트 경로</Label>
            <div className="flex gap-2">
              <Input
                id="projectPath"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/project"
                disabled={isLoading}
              />
              <Button onClick={handleScan} disabled={isLoading || !projectPath.trim()}>
                {scanning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">스캔</span>
              </Button>
            </div>
          </div>

          {/* Scan Results */}
          {scanResult && (
            <div className="flex-1 overflow-hidden flex flex-col space-y-4">
              {/* Found Files */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>
                  발견된 파일: {scanResult.files.length > 0 ? scanResult.files.join(', ') : '없음'}
                </span>
              </div>

              {/* Services List */}
              {scanResult.services.length > 0 ? (
                <ScrollArea className="flex-1 border rounded-lg p-4">
                  <div className="space-y-3">
                    {scanResult.services.map((service) => (
                      <ServiceItem
                        key={service.type}
                        service={service}
                        selected={selectedServices.has(service.type)}
                        onToggle={() => handleToggleService(service)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p>알려진 서비스를 찾지 못했습니다.</p>
                    {scanResult.unmatchedCount > 0 && (
                      <p className="text-xs mt-1">
                        {scanResult.unmatchedCount}개의 환경변수가 매칭되지 않음
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Summary */}
              {scanResult.services.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {selectedServices.size}개 선택됨 / {scanResult.services.length}개 감지됨
                </div>
              )}
            </div>
          )}

          {/* Initial State */}
          {!scanResult && !scanning && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FileText className="h-8 w-8 mx-auto mb-2" />
                <p>프로젝트 경로를 입력하고 스캔 버튼을 눌러주세요.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            취소
          </Button>
          <Button
            onClick={handleImport}
            disabled={isLoading || selectedServices.size === 0}
          >
            {importEnv.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {selectedServices.size > 0
              ? `${selectedServices.size}개 임포트`
              : '임포트'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ServiceItemProps {
  service: DetectedService;
  selected: boolean;
  onToggle: () => void;
}

function ServiceItem({ service, selected, onToggle }: ServiceItemProps) {
  const hasExisting = !!service.existingAccount;
  const isIncomplete = !service.isComplete;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-border'
      } ${isIncomplete ? 'opacity-60' : ''}`}
    >
      <Checkbox
        id={`service-${service.type}`}
        checked={selected}
        onCheckedChange={onToggle}
        disabled={isIncomplete}
      />

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Label
            htmlFor={`service-${service.type}`}
            className="font-medium cursor-pointer"
          >
            {service.displayName}
          </Label>
          <Badge variant="outline" className="text-xs">
            {service.type}
          </Badge>

          {service.isComplete ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          )}

          {hasExisting && (
            <Badge variant="secondary" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              기존 계정 있음
            </Badge>
          )}
        </div>

        {/* Credentials Preview */}
        <div className="flex flex-wrap gap-1 text-xs">
          {Object.entries(service.credentials).map(([key, value]) => (
            <span
              key={key}
              className="px-1.5 py-0.5 bg-muted rounded font-mono"
            >
              {key}: {value}
            </span>
          ))}
        </div>

        {/* Missing Required */}
        {service.missingRequired.length > 0 && (
          <div className="text-xs text-yellow-600">
            필수 항목 누락: {service.missingRequired.join(', ')}
          </div>
        )}

        {/* Source Files */}
        <div className="text-xs text-muted-foreground">
          출처: {service.sources.join(', ')}
        </div>

        {/* Existing Account Warning */}
        {hasExisting && (
          <div className="text-xs text-orange-600">
            기존 계정 "{service.existingAccount?.name}"이(가) 업데이트됩니다.
          </div>
        )}
      </div>
    </div>
  );
}
