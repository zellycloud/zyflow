/**
 * Provider Selector Component
 *
 * AI Provider 선택 UI
 */

import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ProviderSelectorProps } from './types'

export function ProviderSelector({
  providers,
  selectedProvider,
  onSelect,
  loading = false,
}: ProviderSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Provider 목록 로드 중...</span>
      </div>
    )
  }

  if (providers.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4">
        <AlertCircle className="h-4 w-4" />
        <span>사용 가능한 Provider가 없습니다</span>
      </div>
    )
  }

  const enabledProviders = providers.filter(p => p.enabled)

  return (
    <div className="grid gap-2">
      {enabledProviders.map((provider) => {
        const isSelected = selectedProvider === provider.id
        const isDisabled = !provider.available

        return (
          <button
            key={provider.id}
            onClick={() => !isDisabled && onSelect(provider.id)}
            disabled={isDisabled}
            className={cn(
              'w-full p-3 rounded-lg border-2 text-left transition-all',
              isDisabled && 'opacity-50 cursor-not-allowed',
              isSelected && !isDisabled
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-muted-foreground/50'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{provider.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {provider.name}
                  {!provider.available && (
                    <Badge variant="outline" className="text-[10px] py-0">미설치</Badge>
                  )}
                </div>
                {provider.availableModels.length > 0 && (
                  <div className="text-xs text-muted-foreground truncate">
                    {provider.availableModels.slice(0, 3).join(', ')}
                  </div>
                )}
              </div>
              {isSelected && provider.available && (
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Compact Provider Selector (for Swarm mode)
 */
export function CompactProviderSelector({
  providers,
  selectedProvider,
  onSelect,
  loading = false,
}: ProviderSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Provider 목록 로드 중...</span>
      </div>
    )
  }

  const enabledProviders = providers.filter(p => p.enabled)

  return (
    <div className="grid gap-2">
      {enabledProviders.map((provider) => {
        const isSelected = selectedProvider === provider.id
        const isDisabled = !provider.available

        return (
          <button
            key={provider.id}
            onClick={() => !isDisabled && onSelect(provider.id)}
            disabled={isDisabled}
            className={cn(
              'w-full p-2 rounded-lg border text-left transition-all',
              isDisabled && 'opacity-50 cursor-not-allowed',
              isSelected && !isDisabled
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-muted-foreground/50'
            )}
          >
            <div className="flex items-center gap-2">
              <span>{provider.icon}</span>
              <span className="flex-1 text-sm">{provider.name}</span>
              {!provider.available && (
                <Badge variant="outline" className="text-[10px] py-0">미설치</Badge>
              )}
              {isSelected && provider.available && (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
