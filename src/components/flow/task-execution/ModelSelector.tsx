/**
 * Model Selector Component
 *
 * AI Model 선택 UI
 */

import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MODEL_OPTIONS, type ModelSelectorProps } from './types'

export function ModelSelector({
  providers,
  selectedProvider,
  selectedModel,
  onSelect,
}: ModelSelectorProps) {
  const provider = providers.find(p => p.id === selectedProvider)

  if (!provider || provider.availableModels.length === 0) {
    return null
  }

  // Claude의 경우 기존 카드 스타일 UI 사용
  if (selectedProvider === 'claude') {
    return (
      <div className="space-y-2 mt-4">
        <label className="text-sm font-medium">모델 선택</label>
        <div className="space-y-2">
          {MODEL_OPTIONS.map((option) => {
            const Icon = option.icon
            const isSelected = selectedModel === option.value

            return (
              <button
                key={option.value}
                onClick={() => onSelect(option.value)}
                className={cn(
                  'w-full p-3 rounded-lg border-2 text-left transition-all',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn('h-4 w-4', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // 다른 Provider의 경우 심플한 리스트 스타일
  return (
    <div className="space-y-2 mt-4">
      <label className="text-sm font-medium">모델 선택</label>
      <div className="space-y-2">
        {provider.availableModels.map((model) => {
          const isSelected = selectedModel === model

          return (
            <button
              key={model}
              onClick={() => onSelect(model)}
              className={cn(
                'w-full p-2 rounded-lg border text-left transition-all text-sm',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/50'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono">{model}</span>
                {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Compact Model Selector (for Swarm mode)
 */
export function CompactModelSelector({
  providers,
  selectedProvider,
  selectedModel,
  onSelect,
}: ModelSelectorProps) {
  const provider = providers.find(p => p.id === selectedProvider)

  if (!provider || provider.availableModels.length === 0) {
    return null
  }

  return (
    <div>
      <label className="text-sm font-medium mb-2 block">모델 선택</label>
      <div className="grid gap-1">
        {provider.availableModels.map((model) => {
          const isSelected = selectedModel === model

          return (
            <button
              key={model}
              onClick={() => onSelect(model)}
              className={cn(
                'w-full p-2 rounded border text-left text-sm transition-all',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/50'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">{model}</span>
                {isSelected && <CheckCircle2 className="h-3 w-3 text-primary" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
