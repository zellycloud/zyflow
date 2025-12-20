/**
 * 커스텀 CLI 추가 다이얼로그
 * @module components/settings/CustomCLIDialog
 */

import { useState } from 'react'
import { Plus, Terminal, Save, Trash2, Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface CustomCLIProfile {
  id: string
  name: string
  command: string
  args: string[]
  description?: string
  icon?: string
  defaultModel?: string
  availableModels?: string[]
  env?: Record<string, string>
}

/** CLI 템플릿 정의 */
interface CLITemplate {
  id: string
  name: string
  icon: string
  command: string
  args: string
  description: string
  models: string
  defaultModel: string
  envTemplate: string
}

/** 인기 CLI 템플릿 */
const CLI_TEMPLATES: CLITemplate[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    icon: '🦙',
    command: 'ollama',
    args: 'run',
    description: 'Ollama 로컬 LLM',
    models: 'llama3.2, codellama, mistral, deepseek-coder',
    defaultModel: 'llama3.2',
    envTemplate: 'OLLAMA_HOST=localhost:11434'
  },
  {
    id: 'llamacpp',
    name: 'LlamaCpp',
    icon: '🦙',
    command: 'llama-cli',
    args: '--model',
    description: 'LlamaCpp CLI',
    models: 'qwen2.5-coder-32b-instruct, codellama-34b',
    defaultModel: 'qwen2.5-coder-32b-instruct',
    envTemplate: 'LLAMA_MODEL_PATH=/path/to/models'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    icon: '🎨',
    command: 'lms',
    args: 'run',
    description: 'LM Studio CLI',
    models: 'local-model',
    defaultModel: 'local-model',
    envTemplate: 'LMS_API_URL=http://localhost:1234'
  },
  {
    id: 'aider',
    name: 'Aider',
    icon: '🤝',
    command: 'aider',
    args: '--yes --no-git',
    description: 'Aider AI pair programmer',
    models: 'gpt-4, claude-3-sonnet, deepseek-coder',
    defaultModel: 'gpt-4',
    envTemplate: 'OPENAI_API_KEY=sk-xxx\nANTHROPIC_API_KEY=sk-xxx'
  },
  {
    id: 'cursor',
    name: 'Cursor CLI',
    icon: '🖱️',
    command: 'cursor',
    args: '--headless',
    description: 'Cursor AI Editor CLI',
    models: 'cursor-default',
    defaultModel: 'cursor-default',
    envTemplate: ''
  },
  {
    id: 'continue',
    name: 'Continue',
    icon: '▶️',
    command: 'continue',
    args: '',
    description: 'Continue Dev autocomplete',
    models: 'claude-3, gpt-4, codellama',
    defaultModel: 'claude-3',
    envTemplate: 'CONTINUE_CONFIG_PATH=~/.continue/config.json'
  }
]

interface CustomCLIDialogProps {
  onSave?: (profile: CustomCLIProfile) => Promise<void>
  existingProfiles?: CustomCLIProfile[]
}

export function CustomCLIDialog({ onSave, existingProfiles = [] }: CustomCLIDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'template' | 'form' | 'test' | 'models'>('template')
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('🔧')
  const [models, setModels] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [envVars, setEnvVars] = useState('')

  const resetForm = () => {
    setName('')
    setCommand('')
    setArgs('')
    setDescription('')
    setIcon('🔧')
    setModels('')
    setDefaultModel('')
    setEnvVars('')
    setStep('template')
    setTestResult(null)
    setSelectedTemplate(null)
  }

  const applyTemplate = (templateId: string) => {
    const template = CLI_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      setSelectedTemplate(templateId)
      setName(template.name)
      setCommand(template.command)
      setArgs(template.args)
      setDescription(template.description)
      setIcon(template.icon)
      setModels(template.models)
      setDefaultModel(template.defaultModel)
      setEnvVars(template.envTemplate)
      setStep('form')
    }
  }

  const generateId = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-')
  }

  const parseArgs = (argsStr: string): string[] => {
    return argsStr.split(/\s+/).filter(Boolean)
  }

  const parseEnvVars = (envStr: string): Record<string, string> => {
    const result: Record<string, string> = {}
    const lines = envStr.split('\n').filter(Boolean)
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join('=').trim()
      }
    }
    return result
  }

  const handleTest = async () => {
    setLoading(true)
    setTestResult(null)

    try {
      // API 호출하여 CLI 가용성 테스트
      const response = await fetch('/api/cli/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args: parseArgs(args) })
      })

      const data = await response.json()

      if (data.available) {
        setTestResult({ success: true, message: `✅ CLI 사용 가능 (${data.version || 'version unknown'})` })
        setStep('models')
      } else {
        setTestResult({ success: false, message: `❌ CLI를 찾을 수 없습니다: ${data.error || command}` })
      }
    } catch (error) {
      setTestResult({ success: false, message: `❌ 테스트 실패: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    const profile: CustomCLIProfile = {
      id: generateId(name),
      name,
      command,
      args: parseArgs(args),
      description: description || undefined,
      icon: icon || '🔧',
      defaultModel: defaultModel || undefined,
      availableModels: models.split(',').map(m => m.trim()).filter(Boolean),
      env: envVars ? parseEnvVars(envVars) : undefined
    }

    setLoading(true)
    try {
      if (onSave) {
        await onSave(profile)
      } else {
        // 기본 저장 로직
        await fetch('/api/cli/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile)
        })
      }
      setOpen(false)
      resetForm()
    } catch (error) {
      console.error('Failed to save profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const isValid = name && command

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          커스텀 CLI 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            커스텀 CLI 추가
          </DialogTitle>
          <DialogDescription>
            새로운 AI CLI를 추가하여 zyflow에서 사용할 수 있습니다
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-2 text-xs">
          <Badge variant={step === 'template' ? 'default' : 'outline'} className="text-xs">1. 템플릿</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant={step === 'form' ? 'default' : 'outline'} className="text-xs">2. 정보</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant={step === 'test' ? 'default' : 'outline'} className="text-xs">3. 테스트</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant={step === 'models' ? 'default' : 'outline'} className="text-xs">4. 모델</Badge>
        </div>

        {/* Step 1: Template Selection */}
        {step === 'template' && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              인기 있는 AI CLI 템플릿을 선택하거나 직접 설정하세요
            </div>

            {/* Template Grid */}
            <div className="grid grid-cols-2 gap-2">
              {CLI_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template.id)}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                    'hover:bg-accent hover:border-primary/50',
                    selectedTemplate === template.id && 'border-primary bg-accent'
                  )}
                >
                  <span className="text-2xl">{template.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {template.description}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-1 truncate">
                      $ {template.command}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom option */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setSelectedTemplate(null)
                  setStep('form')
                }}
              >
                <Zap className="h-4 w-4 mr-2" />
                직접 설정하기
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Basic Info Form */}
        {step === 'form' && (
          <div className="space-y-4">
            <div className="grid grid-cols-[auto_1fr] gap-4 items-center">
              <Label htmlFor="icon" className="text-right">아이콘</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-16 text-center text-xl"
                  maxLength={2}
                />
                <span className="text-xs text-muted-foreground">이모지 또는 2글자</span>
              </div>

              <Label htmlFor="name" className="text-right">이름 *</Label>
              <Input
                id="name"
                placeholder="My Custom CLI"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Label htmlFor="command" className="text-right">명령어 *</Label>
              <Input
                id="command"
                placeholder="my-cli"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="font-mono"
              />

              <Label htmlFor="args" className="text-right">기본 인자</Label>
              <Input
                id="args"
                placeholder="--flag1 --flag2"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                className="font-mono"
              />

              <Label htmlFor="description" className="text-right">설명</Label>
              <Input
                id="description"
                placeholder="CLI 설명"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('template')}>← 템플릿</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
                <Button onClick={() => setStep('test')} disabled={!isValid}>
                  다음 →
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Test */}
        {step === 'test' && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{icon}</span>
                <span className="font-medium">{name}</span>
              </div>
              <div className="font-mono text-sm text-muted-foreground">
                $ {command} {args}
              </div>
            </div>

            {testResult && (
              <div className={cn(
                'p-3 rounded-lg text-sm',
                testResult.success
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              )}>
                {testResult.message}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('form')}>← 뒤로</Button>
              <div className="flex gap-2">
                <Button onClick={handleTest} disabled={loading}>
                  {loading ? '테스트 중...' : 'CLI 테스트'}
                </Button>
                {testResult?.success && (
                  <Button onClick={() => setStep('models')}>다음 →</Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Model Settings */}
        {step === 'models' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="models">사용 가능한 모델 (쉼표로 구분)</Label>
                <Input
                  id="models"
                  placeholder="model-1, model-2, model-3"
                  value={models}
                  onChange={(e) => setModels(e.target.value)}
                  className="font-mono mt-1"
                />
              </div>

              <div>
                <Label htmlFor="defaultModel">기본 모델</Label>
                <Input
                  id="defaultModel"
                  placeholder="model-1"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  className="font-mono mt-1"
                />
              </div>

              <div>
                <Label htmlFor="envVars">환경 변수 (선택, KEY=VALUE 형식)</Label>
                <Textarea
                  id="envVars"
                  placeholder="API_KEY=xxx&#10;DEBUG=true"
                  value={envVars}
                  onChange={(e) => setEnvVars(e.target.value)}
                  className="font-mono mt-1"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('test')}>← 뒤로</Button>
              <Button onClick={handleSave} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * 커스텀 CLI 목록 및 관리 컴포넌트
 */
export function CustomCLIList() {
  const [profiles, setProfiles] = useState<CustomCLIProfile[]>([])
  const [loading, setLoading] = useState(true)

  // 프로필 로드
  const loadProfiles = async () => {
    try {
      const response = await fetch('/api/cli/profiles?type=custom')
      const data = await response.json()
      setProfiles(data.profiles || [])
    } catch (error) {
      console.error('Failed to load profiles:', error)
    } finally {
      setLoading(false)
    }
  }

  // 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('이 프로필을 삭제하시겠습니까?')) return

    try {
      await fetch(`/api/cli/profiles/${id}`, { method: 'DELETE' })
      setProfiles(prev => prev.filter(p => p.id !== id))
    } catch (error) {
      console.error('Failed to delete profile:', error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">커스텀 CLI</h3>
        <CustomCLIDialog onSave={async (profile) => {
          setProfiles(prev => [...prev, profile])
        }} />
      </div>

      {loading ? (
        <div className="text-muted-foreground">로딩 중...</div>
      ) : profiles.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center">
          등록된 커스텀 CLI가 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map(profile => (
            <div key={profile.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-xl">{profile.icon}</span>
                <div>
                  <div className="font-medium">{profile.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{profile.command}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(profile.id)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
