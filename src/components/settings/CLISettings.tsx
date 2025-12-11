/**
 * CLI Settings Component
 *
 * Manage CLI profiles: enable/disable, select default models, and reorder
 */

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, GripVertical, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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

interface CLISetting {
  enabled: boolean
  selectedModel?: string
  order?: number
}

interface CLISettingsResponse {
  profiles: CLIProfile[]
  settings: Record<string, CLISetting>
}

interface SortableCLIItemProps {
  profile: CLIProfile
  settings: CLISetting
  onToggle: (enabled: boolean) => void
  onModelChange: (model: string) => void
}

function SortableCLIItem({ profile, settings, onToggle, onModelChange }: SortableCLIItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: profile.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isEnabled = settings.enabled ?? true
  const selectedModel = settings.selectedModel ?? profile.defaultModel

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={cn(
        'transition-all',
        isDragging && 'shadow-lg ring-2 ring-primary/20',
        !isEnabled && 'opacity-60'
      )}>
        <CardContent className="py-1.5 px-3">
          <div className="flex items-center gap-2">
            {/* Drag Handle */}
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground hover:text-foreground touch-none"
            >
              <GripVertical className="h-4 w-4" />
            </button>

            {/* Icon */}
            <span className="text-xl">{profile.icon || '🔧'}</span>

            {/* Name & Badge */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-sm truncate">{profile.name}</span>
              {profile.builtin && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                  Built-in
                </Badge>
              )}
            </div>

            {/* Model Selector - inline */}
            {isEnabled && profile.availableModels && profile.availableModels.length > 0 ? (
              <Select
                value={selectedModel}
                onValueChange={onModelChange}
              >
                <SelectTrigger className="h-7 text-xs w-[220px] ml-auto">
                  <SelectValue placeholder="모델 선택" />
                </SelectTrigger>
                <SelectContent>
                  {profile.availableModels.map((model) => (
                    <SelectItem key={model} value={model} className="text-xs">
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : isEnabled ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                <Terminal className="h-3 w-3" />
                <span>기본값</span>
              </div>
            ) : (
              <div className="ml-auto" />
            )}

            {/* Enable/Disable Switch */}
            <Switch
              checked={isEnabled}
              onCheckedChange={onToggle}
              className="shrink-0 ml-4"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function CLISettings() {
  const queryClient = useQueryClient()
  const [localSettings, setLocalSettings] = useState<Record<string, CLISetting>>({})
  const [orderedProfileIds, setOrderedProfileIds] = useState<string[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Fetch CLI profiles and settings
  const { data, isLoading, error } = useQuery({
    queryKey: ['cli-settings'],
    queryFn: async (): Promise<CLISettingsResponse> => {
      const res = await fetch('http://localhost:3001/api/cli/settings')
      if (!res.ok) throw new Error('Failed to fetch CLI settings')
      return res.json()
    },
  })

  // Initialize local settings and order from server data
  useEffect(() => {
    if (data?.profiles && data?.settings) {
      setLocalSettings(data.settings)

      // Sort profiles by order
      const sorted = [...data.profiles].sort((a, b) => {
        const orderA = data.settings[a.id]?.order ?? 999
        const orderB = data.settings[b.id]?.order ?? 999
        return orderA - orderB
      })
      setOrderedProfileIds(sorted.map(p => p.id))
    } else if (data?.profiles) {
      // Initialize with all enabled if no settings exist
      const initialSettings: Record<string, CLISetting> = {}
      data.profiles.forEach((profile, index) => {
        initialSettings[profile.id] = {
          enabled: true,
          selectedModel: profile.defaultModel,
          order: index,
        }
      })
      setLocalSettings(initialSettings)
      setOrderedProfileIds(data.profiles.map(p => p.id))
    }
  }, [data])

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (settings: Record<string, CLISetting>) => {
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = orderedProfileIds.indexOf(active.id as string)
      const newIndex = orderedProfileIds.indexOf(over.id as string)

      const newOrder = arrayMove(orderedProfileIds, oldIndex, newIndex)
      setOrderedProfileIds(newOrder)

      // Update order in settings
      const newSettings = { ...localSettings }
      newOrder.forEach((id, index) => {
        newSettings[id] = { ...newSettings[id], order: index }
      })
      setLocalSettings(newSettings)
      saveMutation.mutate(newSettings)
    }
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
  const profileMap = new Map(profiles.map(p => [p.id, p]))

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        사용할 AI CLI를 선택하고 기본 모델을 설정합니다. 드래그하여 순서를 변경할 수 있습니다.
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderedProfileIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {orderedProfileIds.map((profileId) => {
              const profile = profileMap.get(profileId)
              if (!profile) return null

              const settings = localSettings[profileId] ?? { enabled: true }

              return (
                <SortableCLIItem
                  key={profileId}
                  profile={profile}
                  settings={settings}
                  onToggle={(enabled) => handleToggle(profileId, enabled)}
                  onModelChange={(model) => handleModelChange(profileId, model)}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

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
