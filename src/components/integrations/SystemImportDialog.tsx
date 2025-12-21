import { useState, useCallback, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertTriangle,
  GitBranch,
  Github,
  Cloud,
  Package,
  Terminal,
} from 'lucide-react';
import {
  useScanSystemSources,
  useImportSystemServices,
  type SystemSource,
  type DetectedSystemService,
} from '@/hooks/useIntegrations';
import { toast } from 'sonner';

interface SystemImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath?: string;
}

interface SelectedService {
  type: string;
  source: string;
  name: string;
}

// Source 아이콘 매핑
const SOURCE_ICONS: Record<string, React.ReactNode> = {
  'git-config': <GitBranch className="h-4 w-4" />,
  'git-remote': <Github className="h-4 w-4" />,
  'gh-cli': <Github className="h-4 w-4" />,
  'aws-credentials': <Cloud className="h-4 w-4" />,
  'gcloud': <Cloud className="h-4 w-4" />,
  'azure-cli': <Cloud className="h-4 w-4" />,
  'docker': <Package className="h-4 w-4" />,
  'npm': <Package className="h-4 w-4" />,
};

// Service type 아이콘 매핑
const SERVICE_ICONS: Record<string, React.ReactNode> = {
  github: <Github className="h-4 w-4" />,
  aws: <Cloud className="h-4 w-4" />,
  gcp: <Cloud className="h-4 w-4" />,
  azure: <Cloud className="h-4 w-4" />,
};

export function SystemImportDialog({
  open,
  onOpenChange,
  projectPath,
}: SystemImportDialogProps) {
  const [selectedServices, setSelectedServices] = useState<Map<string, SelectedService>>(new Map());
  const [serviceNames, setServiceNames] = useState<Map<string, string>>(new Map());

  // 시스템 설정 스캔
  const {
    data: scanResult,
    isLoading: isScanning,
    refetch: rescan,
  } = useScanSystemSources(projectPath, open);

  const importServices = useImportSystemServices();

  // Reset state when dialog opens
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      setSelectedServices(new Map());
      setServiceNames(new Map());
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  // 스캔 결과 변경 시 완전한 서비스 자동 선택
  useEffect(() => {
    if (scanResult?.services) {
      const newSelected = new Map<string, SelectedService>();
      const newNames = new Map<string, string>();

      scanResult.services.forEach((service) => {
        const key = `${service.type}-${service.source}`;
        newNames.set(key, service.displayName);

        if (service.isComplete && !service.existingAccount) {
          newSelected.set(key, {
            type: service.type,
            source: service.source,
            name: service.displayName,
          });
        }
      });

      setSelectedServices(newSelected);
      setServiceNames(newNames);
    }
  }, [scanResult]);

  const handleToggleService = (service: DetectedSystemService) => {
    const key = `${service.type}-${service.source}`;
    const newSelected = new Map(selectedServices);

    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.set(key, {
        type: service.type,
        source: service.source,
        name: serviceNames.get(key) || service.displayName,
      });
    }
    setSelectedServices(newSelected);
  };

  const handleNameChange = (service: DetectedSystemService, name: string) => {
    const key = `${service.type}-${service.source}`;
    const newNames = new Map(serviceNames);
    newNames.set(key, name);
    setServiceNames(newNames);

    // 선택된 서비스 이름도 업데이트
    if (selectedServices.has(key)) {
      const newSelected = new Map(selectedServices);
      const existing = newSelected.get(key)!;
      newSelected.set(key, { ...existing, name });
      setSelectedServices(newSelected);
    }
  };

  const handleImport = async () => {
    if (selectedServices.size === 0) {
      toast.error('임포트할 서비스를 선택해주세요');
      return;
    }

    try {
      const result = await importServices.mutateAsync({
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

  const isLoading = isScanning || importServices.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] max-h-[750px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from System</DialogTitle>
          <DialogDescription>
            시스템에 설정된 개발 도구에서 서비스 계정을 자동으로 가져옵니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Sources Status */}
          {scanResult?.sources && scanResult.sources.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>감지된 소스</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => rescan()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${isScanning ? 'animate-spin' : ''}`} />
                  다시 스캔
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {scanResult.sources.map((source) => (
                  <SourceBadge key={source.id} source={source} />
                ))}
              </div>
            </div>
          )}

          {/* Loading State */}
          {isScanning && !scanResult && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p>시스템 설정 스캔 중...</p>
              </div>
            </div>
          )}

          {/* Services List */}
          {scanResult && scanResult.services.length > 0 && (
            <ScrollArea className="flex-1 min-h-0 border rounded-lg">
              <div className="p-4 space-y-3">
                {scanResult.services.map((service) => {
                  const key = `${service.type}-${service.source}`;
                  return (
                    <ServiceItem
                      key={key}
                      service={service}
                      selected={selectedServices.has(key)}
                      name={serviceNames.get(key) || service.displayName}
                      onToggle={() => handleToggleService(service)}
                      onNameChange={(name) => handleNameChange(service, name)}
                    />
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* No Services Found */}
          {scanResult && scanResult.services.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Terminal className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">가져올 수 있는 서비스를 찾지 못했습니다</p>
                <p className="text-sm mt-1">
                  다음 도구들이 설정되어 있는지 확인하세요:
                </p>
                <div className="mt-3 space-y-1 text-sm text-left max-w-xs mx-auto">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4" />
                    <code className="text-xs bg-muted px-1 rounded">gh auth login</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    <code className="text-xs bg-muted px-1 rounded">git config --global user.name</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4" />
                    <code className="text-xs bg-muted px-1 rounded">~/.aws/credentials</code>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          {scanResult && scanResult.services.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {selectedServices.size}개 선택됨 / {scanResult.services.length}개 감지됨
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
            {importServices.isPending ? (
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

interface SourceBadgeProps {
  source: SystemSource;
}

function SourceBadge({ source }: SourceBadgeProps) {
  const icon = SOURCE_ICONS[source.id] || <Terminal className="h-3 w-3" />;

  return (
    <Badge
      variant={source.available ? 'default' : 'secondary'}
      className={`flex items-center gap-1.5 ${!source.available ? 'opacity-50' : ''}`}
    >
      {icon}
      <span>{source.name}</span>
      {source.available ? (
        <CheckCircle2 className="h-3 w-3 text-green-400" />
      ) : (
        <AlertCircle className="h-3 w-3" />
      )}
    </Badge>
  );
}

interface ServiceItemProps {
  service: DetectedSystemService;
  selected: boolean;
  name: string;
  onToggle: () => void;
  onNameChange: (name: string) => void;
}

function ServiceItem({ service, selected, name, onToggle, onNameChange }: ServiceItemProps) {
  const hasExisting = !!service.existingAccount;
  const isIncomplete = !service.isComplete;
  const icon = SERVICE_ICONS[service.type] || <Terminal className="h-4 w-4" />;

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-border'
      } ${isIncomplete ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={`service-${service.type}-${service.source}`}
          checked={selected}
          onCheckedChange={onToggle}
          disabled={isIncomplete}
          className="mt-1"
        />

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {icon}
            <Label
              htmlFor={`service-${service.type}-${service.source}`}
              className="font-medium cursor-pointer"
            >
              {service.displayName}
            </Label>
            <Badge variant="outline" className="text-xs">
              {service.type}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              via {service.source}
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

          {/* Account Name Input */}
          {selected && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                계정 이름:
              </Label>
              <Input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                className="h-7 text-sm"
                placeholder="계정 이름 입력"
              />
            </div>
          )}

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

          {/* Existing Account Warning */}
          {hasExisting && (
            <div className="text-xs text-orange-600">
              기존 계정 "{service.existingAccount?.name}"이(가) 있습니다. 새 계정이 생성됩니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
