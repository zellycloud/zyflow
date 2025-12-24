/**
 * Strategy Selector Component
 *
 * Swarm Strategy 선택 UI
 */

import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SwarmStrategy } from '@/hooks/useSwarm'
import { STRATEGY_OPTIONS } from './types'

export interface StrategySelectorProps {
  strategy: SwarmStrategy
  onSelect: (strategy: SwarmStrategy) => void
}

export function StrategySelector({ strategy, onSelect }: StrategySelectorProps) {
  return (
    <div>
      <label className="text-sm font-medium mb-2 block">Strategy 선택</label>
      <div className="grid gap-2">
        {STRATEGY_OPTIONS.map((option) => {
          const isSelected = strategy === option.value
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
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
                {isSelected && <CheckCircle2 className="h-5 w-5 text-primary" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
