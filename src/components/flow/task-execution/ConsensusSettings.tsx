/**
 * Consensus Settings Component
 *
 * 다중 AI 합의 설정 UI
 */

import { CheckCircle2, Handshake } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { CONSENSUS_STRATEGY_OPTIONS, type ConsensusSettingsProps } from './types'

export function ConsensusSettings({
  providers,
  enabled,
  onEnabledChange,
  strategy,
  onStrategyChange,
  selectedProviders,
  onToggleProvider,
  threshold,
  onThresholdChange,
}: ConsensusSettingsProps) {
  const availableProviders = providers.filter(p => p.enabled && p.available)

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Handshake className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">다중 AI 합의 (Consensus)</span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled && (
        <div className="space-y-4 pt-2 border-t">
          {/* Consensus Provider 선택 */}
          <div>
            <label className="text-xs font-medium mb-2 block text-muted-foreground">
              합의에 참여할 Provider 선택 (최소 2개)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {availableProviders.map((provider) => {
                const isSelected = selectedProviders.has(provider.id)
                return (
                  <button
                    key={provider.id}
                    onClick={() => onToggleProvider(provider.id)}
                    className={cn(
                      'p-2 rounded border text-left text-xs transition-all',
                      isSelected
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                        : 'border-muted hover:border-muted-foreground/50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span>{provider.icon}</span>
                      <span className="flex-1">{provider.name}</span>
                      {isSelected && <CheckCircle2 className="h-3 w-3 text-purple-500" />}
                    </div>
                  </button>
                )
              })}
            </div>
            {selectedProviders.size < 2 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Consensus를 사용하려면 최소 2개의 Provider가 필요합니다
              </p>
            )}
          </div>

          {/* Consensus 전략 */}
          <div>
            <label className="text-xs font-medium mb-2 block text-muted-foreground">합의 전략</label>
            <div className="grid grid-cols-2 gap-2">
              {CONSENSUS_STRATEGY_OPTIONS.map((option) => {
                const isSelected = strategy === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => onStrategyChange(option.value)}
                    className={cn(
                      'p-2 rounded border text-left text-xs transition-all',
                      isSelected
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                        : 'border-muted hover:border-muted-foreground/50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span>{option.icon}</span>
                      <div className="flex-1">
                        <div className="font-medium">{option.label}</div>
                        <div className="text-[10px] text-muted-foreground">{option.description}</div>
                      </div>
                      {isSelected && <CheckCircle2 className="h-3 w-3 text-purple-500" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 합의 임계값 */}
          <div>
            <label className="text-xs font-medium mb-2 block flex items-center justify-between text-muted-foreground">
              <span>합의 임계값</span>
              <span className="text-foreground">{Math.round(threshold * 100)}%</span>
            </label>
            <Slider
              value={[threshold * 100]}
              onValueChange={([value]) => onThresholdChange(value / 100)}
              min={50}
              max={100}
              step={5}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>50% (낮음)</span>
              <span>100% (엄격)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
