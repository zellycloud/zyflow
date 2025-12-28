import { useState } from 'react'
import { ArrowLeft, Plus, Copy, RefreshCw, Trash2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useWebhookConfigs,
  useCreateWebhookConfig,
  useUpdateWebhookConfig,
  useDeleteWebhookConfig,
  useRegenerateWebhookSecret,
  useNotificationConfig,
  useUpdateNotificationConfig,
  useTestSlackNotification,
} from '@/hooks/useAlerts'
import type { AlertSource } from '@/hooks/useAlerts'

interface AlertSettingsProps {
  onBack: () => void
}

export function AlertSettings({ onBack }: AlertSettingsProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium">Alert Settings</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        <WebhookSettings />
        <NotificationSettings />
      </div>
    </div>
  )
}

function WebhookSettings() {
  const { data: configs, isLoading } = useWebhookConfigs()
  const createConfig = useCreateWebhookConfig()
  const updateConfig = useUpdateWebhookConfig()
  const deleteConfig = useDeleteWebhookConfig()
  const regenerateSecret = useRegenerateWebhookSecret()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newSource, setNewSource] = useState<AlertSource>('github')
  const [newName, setNewName] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newName.trim()) return
    await createConfig.mutateAsync({ source: newSource, name: newName.trim() })
    setNewName('')
    setShowAddForm(false)
  }

  const handleCopyEndpoint = (id: string, endpoint: string) => {
    const baseUrl = window.location.origin
    navigator.clipboard.writeText(`${baseUrl}${endpoint}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Webhook Endpoints</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {showAddForm && (
        <div className="rounded-lg border p-3 space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Source</Label>
            <Select value={newSource} onValueChange={(v) => setNewSource(v as AlertSource)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="vercel">Vercel</SelectItem>
                <SelectItem value="sentry">Sentry</SelectItem>
                <SelectItem value="supabase">Supabase</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., My Project GitHub"
              className="h-8"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={createConfig.isPending}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : configs && configs.length > 0 ? (
        <div className="space-y-2">
          {configs.map((config) => (
            <div key={config.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{config.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    ({config.source})
                  </span>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(enabled) =>
                    updateConfig.mutate({ configId: config.id, enabled })
                  }
                />
              </div>

              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-2 py-1 rounded truncate">
                  {config.endpoint}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleCopyEndpoint(config.id, config.endpoint)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                {copiedId === config.id && (
                  <span className="text-xs text-green-500">Copied!</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Secret: {config.secret}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => regenerateSecret.mutate(config.id)}
                  disabled={regenerateSecret.isPending}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteConfig.mutate(config.id)}
                disabled={deleteConfig.isPending}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          No webhook endpoints configured. Add one to start receiving alerts.
        </div>
      )}
    </div>
  )
}

function NotificationSettings() {
  const { data: config, isLoading } = useNotificationConfig()
  const updateConfig = useUpdateNotificationConfig()
  const testSlack = useTestSlackNotification()

  const [slackUrl, setSlackUrl] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)

  const handleSaveSlackUrl = async () => {
    await updateConfig.mutateAsync({
      slack: { webhookUrl: slackUrl, enabled: true },
    })
    setShowUrlInput(false)
    setSlackUrl('')
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Notifications</h3>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Slack</div>
            <div className="text-xs text-muted-foreground">
              {config?.slack.webhookUrl ? 'Connected' : 'Not configured'}
            </div>
          </div>
          <Switch
            checked={config?.slack.enabled || false}
            onCheckedChange={(enabled) =>
              updateConfig.mutate({ slack: { enabled } })
            }
            disabled={!config?.slack.webhookUrl}
          />
        </div>

        {showUrlInput ? (
          <div className="space-y-2">
            <Input
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="h-8 text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveSlackUrl} disabled={!slackUrl}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowUrlInput(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUrlInput(true)}
            >
              {config?.slack.webhookUrl ? 'Update URL' : 'Configure'}
            </Button>
            {config?.slack.webhookUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => testSlack.mutate()}
                disabled={testSlack.isPending}
              >
                <Send className="mr-1 h-3 w-3" />
                Test
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="font-medium text-sm">Notification Rules</div>

        <div className="flex items-center justify-between">
          <Label className="text-sm">Critical alerts</Label>
          <Switch
            checked={config?.rules.onCritical || false}
            onCheckedChange={(onCritical) =>
              updateConfig.mutate({
                rules: {
                  onCritical,
                  onAutofix: config?.rules.onAutofix || false,
                  onAll: config?.rules.onAll || false,
                },
              })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-sm">Auto-fix completed</Label>
          <Switch
            checked={config?.rules.onAutofix || false}
            onCheckedChange={(onAutofix) =>
              updateConfig.mutate({
                rules: {
                  onCritical: config?.rules.onCritical || false,
                  onAutofix,
                  onAll: config?.rules.onAll || false,
                },
              })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-sm">All alerts</Label>
          <Switch
            checked={config?.rules.onAll || false}
            onCheckedChange={(onAll) =>
              updateConfig.mutate({
                rules: {
                  onCritical: config?.rules.onCritical || false,
                  onAutofix: config?.rules.onAutofix || false,
                  onAll,
                },
              })
            }
          />
        </div>
      </div>
    </div>
  )
}
