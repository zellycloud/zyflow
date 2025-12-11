/**
 * CLI Settings Component
 *
 * Manage CLI profiles: enable/disable and select default models
 */

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Terminal, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface CLIProfile {
  id: string
  name: string
  type: string
  command: string
  description?: string
  icon?: string
  builtin?: boolean
  defaultModel?: string
  availableModels?: string[]
  enabled?: boolean
  selectedModel?: string
}

interface CLISettingsResponse {
  profiles: CLIProfile[]
  settings: Record<string, { enabled: boolean; selectedModel?: string }>
}

export function CLISettings() {
  const queryClient = useQueryClient()
  const [localSettings, setLocalSettings] = useState<
    Record<string, { enabled: boolean; selectedModel?: string }>
  >({})

  // Fetch CLI profiles and settings
  const { data, isLoading, error } = useQuery({
    queryKey: ['cli-settings'],
    queryFn: async (): Promise<CLISettingsResponse> => {
      const res = await fetch('http://localhost:3001/api/cli/settings')
      if (!res.ok) throw new Error('Failed to fetch CLI settings')
      return res.json()
    },
  })

  // Initialize local settings from server data
  useEffect(() => {
    if (data?.settings) {
      setLocalSettings(data.settings)
    } else if (data?.profiles) {
      // Initialize with all enabled if no settings exist
      const initialSettings: Record<string, { enabled: boolean; selectedModel?: string }> = {}
      data.profiles.forEach((profile) => {
        initialSettings[profile.id] = {
          enabled: true,
          selectedModel: profile.defaultModel,
        }
      })
      setLocalSettings(initialSettings)
    }
  }, [data])

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (settings: Record<string, { enabled: boolean; selectedModel?: string }>) => {
      const res = await fetch('http://localhost:3001/api/cli/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      if (!res.ok) throw new Error('Failed to save CLI settings')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cli-settings'] })
      queryClient.invalidateQueries({ queryKey: ['cli-profiles'] })
      toast.success('CLI 설정이 저장되었습니다')
    },
    onError: (err: Error) => {
      toast.error(`저장 실패: ${err.message}`)
    },
  })

  const handleToggle = (profileId: string, enabled: boolean) => {
    const newSettings = {
      ...localSettings,
      [profileId]: { ...localSettings[profileId], enabled },
    }
    setLocalSettings(newSettings)
    saveMutation.mutate(newSettings)
  }

  const handleModelChange = (profileId: string, model: string) => {
    const newSettings = {
      ...localSettings,
      [profileId]: { ...localSettings[profileId], selectedModel: model },
    }
    setLocalSettings(newSettings)
    saveMutation.mutate(newSettings)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            CLI 설정을 불러오는데 실패했습니다. API 서버가 실행 중인지 확인하세요.
          </p>
        </CardContent>
      </Card>
    )
  }

  const profiles = data?.profiles ?? []

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        사용할 AI CLI를 선택하고 기본 모델을 설정합니다. 비활성화된 CLI는 채팅 패널에서 표시되지 않습니다.
      </div>

      <div className="grid gap-4">
        {profiles.map((profile) => {
          const settings = localSettings[profile.id] ?? { enabled: true }
          const isEnabled = settings.enabled ?? true
          const selectedModel = settings.selectedModel ?? profile.defaultModel

          return (
            <Card key={profile.id} className={!isEnabled ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{profile.icon || '🔧'}</span>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {profile.name}
                        {profile.builtin && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Built-in
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {profile.description || `${profile.command} CLI`}
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggle(profile.id, checked)}
                  />
                </div>
              </CardHeader>

              {isEnabled && profile.availableModels && profile.availableModels.length > 0 && (
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4">
                    <Label htmlFor={`model-${profile.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                      기본 모델
                    </Label>
                    <Select
                      value={selectedModel}
                      onValueChange={(value) => handleModelChange(profile.id, value)}
                    >
                      <SelectTrigger id={`model-${profile.id}`} className="h-8 text-xs">
                        <SelectValue placeholder="모델 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {profile.availableModels.map((model) => (
                          <SelectItem key={model} value={model} className="text-xs">
                            <div className="flex items-center gap-2">
                              {model === profile.defaultModel && (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              )}
                              <span>{model}</span>
                              {model === profile.defaultModel && (
                                <span className="text-muted-foreground">(기본)</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              )}

              {isEnabled && (!profile.availableModels || profile.availableModels.length === 0) && (
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Terminal className="h-3 w-3" />
                    <span>모델 선택 불가 - CLI 기본값 사용</span>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {profiles.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              등록된 CLI가 없습니다.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
