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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import {
  useImportEnv,
  useEnvFiles,
  type DetectedService,
  type EnvScanResult,
  type EnvFileInfo,
} from '@/hooks/useIntegrations';
import { useProjects } from '@/hooks/useProjects';
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
  // 프로젝트 목록 조회
  const { data: projectsData } = useProjects();
  const projects = projectsData?.projects || [];

  // 선택된 프로젝트
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectPath = selectedProject?.path || defaultProjectPath;

  // .env 파일 목록 조회
  const { data: envFiles, isLoading: isLoadingFiles } = useEnvFiles(
    projectPath,
    !!projectPath && open
  );

  // 선택된 .env 파일들
  const [selectedEnvFiles, setSelectedEnvFiles] = useState<Set<string>>(new Set());

  // 스캔 상태
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<EnvScanResult | null>(null);
  const [selectedServices, setSelectedServices] = useState<Map<string, SelectedService>>(
    new Map()
  );

  const importEnv = useImportEnv();

  // 프로젝트 변경 시 초기화
  useEffect(() => {
    if (selectedProjectId) {
      setSelectedEnvFiles(new Set());
      setScanResult(null);
      setSelectedServices(new Map());
    }
  }, [selectedProjectId]);

  // .env 파일 목록이 로드되면 모든 파일 기본 선택
  useEffect(() => {
    if (envFiles && envFiles.length > 0) {
      setSelectedEnvFiles(new Set(envFiles.map(f => f.name)));
    }
  }, [envFiles]);

  // Reset state when dialog opens
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      // Opening dialog - reset state
      setSelectedProjectId('');
      setSelectedEnvFiles(new Set());
      setScanning(false);
      setScanResult(null);
      setSelectedServices(new Map());
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  // .env 파일 선택/해제
  const handleToggleEnvFile = (fileName: string) => {
    const newSelected = new Set(selectedEnvFiles);
    if (newSelected.has(fileName)) {
      newSelected.delete(fileName);
    } else {
      newSelected.add(fileName);
    }
    setSelectedEnvFiles(newSelected);
    // 파일 선택 변경 시 스캔 결과 초기화
    setScanResult(null);
    setSelectedServices(new Map());
  };

  // 모든 파일 선택/해제
  const handleToggleAllFiles = () => {
    if (envFiles) {
      if (selectedEnvFiles.size === envFiles.length) {
        setSelectedEnvFiles(new Set());
      } else {
        setSelectedEnvFiles(new Set(envFiles.map(f => f.name)));
      }
      setScanResult(null);
      setSelectedServices(new Map());
    }
  };

  const handleScan = async () => {
    if (!projectPath) {
      toast.error('프로젝트를 선택해주세요');
      return;
    }

    if (selectedEnvFiles.size === 0) {
      toast.error('.env 파일을 선택해주세요');
      return;
    }

    setScanning(true);
    try {
      const filesParam = Array.from(selectedEnvFiles).join(',');
      const url = `${API_BASE}/env/scan?projectPath=${encodeURIComponent(projectPath)}&files=${encodeURIComponent(filesParam)}`;
      const res = await fetch(url);
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

  const isLoading = scanning || importEnv.isPending || isLoadingFiles;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] max-h-[800px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from .env</DialogTitle>
          <DialogDescription>
            프로젝트의 .env 파일에서 서비스 계정을 자동으로 가져옵니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto flex flex-col">
          {/* Step 1: Project Selection */}
          <div className="space-y-2">
            <Label>프로젝트 선택</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="프로젝트를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      <span>{project.name}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        ({project.path})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: .env File Selection */}
          {selectedProjectId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>.env 파일 선택</Label>
                <div className="flex items-center gap-2">
                  {envFiles && envFiles.length > 0 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleAllFiles}
                        className="h-auto py-1 px-2 text-xs"
                      >
                        {selectedEnvFiles.size === envFiles.length ? '전체 해제' : '전체 선택'}
                      </Button>
                      <Button
                        onClick={handleScan}
                        disabled={isLoading || selectedEnvFiles.size === 0}
                        size="sm"
                      >
                        {scanning ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        {selectedEnvFiles.size}개 파일 스캔
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {isLoadingFiles ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  파일 목록 조회 중...
                </div>
              ) : envFiles && envFiles.length > 0 ? (
                <div className="max-h-[250px] overflow-y-auto border rounded-lg p-3 space-y-2">
                  {envFiles.map((file) => (
                    <EnvFileItem
                      key={file.name}
                      file={file}
                      selected={selectedEnvFiles.has(file.name)}
                      onToggle={() => handleToggleEnvFile(file.name)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  .env 파일을 찾을 수 없습니다
                </div>
              )}
            </div>
          )}

          {/* Step 3: Scan Results */}
          {scanResult && (
            <div className="flex-1 min-h-0 flex flex-col space-y-3">
              {/* Found Files */}
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="break-all">
                  스캔된 파일: {scanResult.files.length > 0 ? scanResult.files.join(', ') : '없음'}
                </span>
              </div>

              {/* Services List */}
              {scanResult.services.length > 0 ? (
                <ScrollArea className="flex-1 min-h-[200px] max-h-[400px] border rounded-lg">
                  <div className="p-4 space-y-3">
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
          {!selectedProjectId && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FolderOpen className="h-8 w-8 mx-auto mb-2" />
                <p>프로젝트를 선택하세요</p>
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

interface EnvFileItemProps {
  file: EnvFileInfo;
  selected: boolean;
  onToggle: () => void;
}

function EnvFileItem({ file, selected, onToggle }: EnvFileItemProps) {
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
        selected ? 'bg-primary/10' : 'hover:bg-muted/50'
      }`}
      onClick={onToggle}
    >
      <Checkbox checked={selected} onCheckedChange={onToggle} />
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="font-mono text-sm">{file.name}</span>
      <Badge variant="secondary" className="text-xs">
        {file.variableCount}개 변수
      </Badge>
    </div>
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

          {service.environment && service.environment !== 'unknown' && (
            <Badge
              variant="outline"
              className={`text-xs ${
                service.environment === 'production' ? 'border-red-500 text-red-600' :
                service.environment === 'staging' ? 'border-yellow-500 text-yellow-600' :
                service.environment === 'development' ? 'border-blue-500 text-blue-600' :
                'border-green-500 text-green-600'
              }`}
            >
              {service.environment}
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
