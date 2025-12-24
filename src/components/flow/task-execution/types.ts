/**
 * Task Execution Dialog 공용 타입
 */

import type { ClaudeModel } from '@/hooks/useClaude'
import type { SwarmStrategy } from '@/hooks/useSwarm'
import type { AIProviderConfig } from '@/hooks/useAI'
import type { ConsensusStrategy } from '@/types/ai'
import { Zap, Sparkles, Crown } from 'lucide-react'

export type ExecutionMode = 'single' | 'swarm'

export const MODEL_OPTIONS: { value: ClaudeModel; label: string; description: string; icon: typeof Zap }[] = [
  { value: 'haiku', label: 'Haiku', description: '빠르고 저렴 (단순 태스크)', icon: Zap },
  { value: 'sonnet', label: 'Sonnet', description: '균형 잡힌 성능 (권장)', icon: Sparkles },
  { value: 'opus', label: 'Opus', description: '최고 품질 (복잡한 태스크)', icon: Crown },
]

export const STRATEGY_OPTIONS: { value: SwarmStrategy; label: string; description: string }[] = [
  { value: 'development', label: 'Development', description: '코드 구현 중심 (권장)' },
  { value: 'research', label: 'Research', description: '분석 및 조사 중심' },
  { value: 'testing', label: 'Testing', description: '테스트 및 검증 중심' },
]

export const CONSENSUS_STRATEGY_OPTIONS: { value: ConsensusStrategy; label: string; description: string; icon: string }[] = [
  { value: 'majority', label: '다수결', description: '가장 많이 선택된 결과 채택', icon: '🗳️' },
  { value: 'weighted', label: '가중 투표', description: 'Provider별 신뢰도 기반', icon: '⚖️' },
  { value: 'best-of-n', label: 'Best-of-N', description: 'N개 중 최고 품질 선택', icon: '🏆' },
  { value: 'unanimous', label: '만장일치', description: '모든 AI가 동의해야 함', icon: '🤝' },
]

export interface ProviderSelectorProps {
  providers: AIProviderConfig[]
  selectedProvider: string
  onSelect: (providerId: string) => void
  loading?: boolean
}

export interface ModelSelectorProps {
  providers: AIProviderConfig[]
  selectedProvider: string
  selectedModel: string
  onSelect: (model: string) => void
}

export interface ConsensusSettingsProps {
  providers: AIProviderConfig[]
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  strategy: ConsensusStrategy
  onStrategyChange: (strategy: ConsensusStrategy) => void
  selectedProviders: Set<string>
  onToggleProvider: (providerId: string) => void
  threshold: number
  onThresholdChange: (threshold: number) => void
}
