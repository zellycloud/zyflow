/**
 * Swarm Summary Component
 *
 * Swarm 설정 요약 표시
 */

import { Settings2 } from 'lucide-react'
import type { AIProviderConfig } from '@/hooks/useAI'
import type { SwarmStrategy } from '@/hooks/useSwarm'
import type { ConsensusStrategy } from '@/types/ai'

export interface SwarmSummaryProps {
  providers: AIProviderConfig[]
  swarmProvider: string
  swarmModel: string
  strategy: SwarmStrategy
  maxAgents: number
  consensusEnabled?: boolean
  consensusStrategy?: ConsensusStrategy
  consensusProviders?: Set<string>
}

export function SwarmSummary({
  providers,
  swarmProvider,
  swarmModel,
  strategy,
  maxAgents,
  consensusEnabled,
  consensusStrategy,
  consensusProviders,
}: SwarmSummaryProps) {
  const providerName = providers.find(p => p.id === swarmProvider)?.name || swarmProvider

  return (
    <div className="bg-muted/50 rounded-lg p-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Settings2 className="h-4 w-4" />
        <span className="font-medium">Swarm 설정 요약</span>
      </div>
      <ul className="text-xs space-y-1 text-muted-foreground">
        <li>Provider: <span className="text-foreground">{providerName}</span></li>
        <li>Model: <span className="text-foreground">{swarmModel}</span></li>
        <li>Strategy: <span className="text-foreground">{strategy}</span></li>
        <li>Max Agents: <span className="text-foreground">{maxAgents}</span></li>
        <li>Mode: <span className="text-foreground">single task</span></li>
        {consensusEnabled && consensusProviders && consensusProviders.size >= 2 && (
          <li className="text-purple-600 dark:text-purple-400">
            Consensus: <span className="text-foreground">{consensusStrategy} ({consensusProviders.size} providers)</span>
          </li>
        )}
      </ul>
    </div>
  )
}
