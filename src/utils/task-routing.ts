/**
 * 태스크 유형별 자동 라우팅 유틸리티
 * @module utils/task-routing
 *
 * 태스크 제목/설명을 분석하여 적절한 AI Provider와 Strategy를 추천
 */

import type { AIProvider, ConsensusStrategy, ConsensusRecommendation } from '@/types/ai'
import type { SwarmStrategy } from '@/hooks/useSwarm'

// =============================================
// 태스크 유형 정의
// =============================================

/** 태스크 유형 */
export type TaskType =
  | 'implementation'  // 코드 구현
  | 'bugfix'          // 버그 수정
  | 'refactor'        // 리팩토링
  | 'test'            // 테스트 작성
  | 'documentation'   // 문서 작성
  | 'research'        // 조사/분석
  | 'design'          // 설계
  | 'review'          // 코드 리뷰
  | 'config'          // 설정/구성
  | 'unknown'         // 분류 불가

/** 태스크 유형별 키워드 */
const TASK_KEYWORDS: Record<TaskType, string[]> = {
  implementation: [
    '구현', '추가', '생성', '만들기', 'implement', 'add', 'create', 'build',
    '개발', 'develop', '작성', 'write', '기능', 'feature', 'new', '신규',
    'API', 'endpoint', '컴포넌트', 'component', '모듈', 'module'
  ],
  bugfix: [
    '버그', 'bug', '수정', 'fix', '오류', 'error', '에러', '해결', 'resolve',
    '문제', 'issue', '패치', 'patch', 'hotfix', '실패', 'fail', '깨진', 'broken'
  ],
  refactor: [
    '리팩토링', 'refactor', '개선', 'improve', '최적화', 'optimize', '정리', 'cleanup',
    '재구성', 'restructure', '성능', 'performance', '간소화', 'simplify'
  ],
  test: [
    '테스트', 'test', '단위', 'unit', '통합', 'integration', 'e2e', '검증', 'verify',
    '커버리지', 'coverage', 'mock', 'stub', 'jest', 'vitest'
  ],
  documentation: [
    '문서', 'document', 'doc', 'readme', '주석', 'comment', '가이드', 'guide',
    '설명', 'description', 'api doc', 'jsdoc', 'tsdoc'
  ],
  research: [
    '조사', 'research', '분석', 'analyze', 'analysis', '탐색', 'explore',
    '비교', 'compare', '평가', 'evaluate', '검토', 'review', '학습', 'study'
  ],
  design: [
    '설계', 'design', '아키텍처', 'architecture', 'spec', '스펙', '명세',
    '인터페이스', 'interface', '타입', 'type', '스키마', 'schema'
  ],
  review: [
    '리뷰', 'review', '검수', '점검', 'check', '검사', 'inspection',
    'pr', 'pull request', '코드 리뷰', 'code review'
  ],
  config: [
    '설정', 'config', 'configuration', '환경', 'environment', 'env',
    '빌드', 'build', 'ci', 'cd', 'deploy', '배포', 'setup'
  ],
  unknown: []
}

/** 태스크 유형별 추천 설정 */
export interface TaskRecommendation {
  /** 추천 AI Provider */
  provider: AIProvider
  /** 추천 모델 */
  model: string
  /** 추천 실행 모드 */
  mode: 'single' | 'swarm'
  /** 추천 Swarm 전략 (Swarm 모드일 때) */
  strategy?: SwarmStrategy
  /** 추천 에이전트 수 (Swarm 모드일 때) */
  maxAgents?: number
  /** 추천 이유 */
  reason: string
}

/** 태스크 유형별 기본 추천 */
const TYPE_RECOMMENDATIONS: Record<TaskType, TaskRecommendation> = {
  implementation: {
    provider: 'claude',
    model: 'sonnet',
    mode: 'single',
    reason: '코드 구현은 Claude Sonnet이 균형 잡힌 성능을 제공합니다'
  },
  bugfix: {
    provider: 'claude',
    model: 'sonnet',
    mode: 'single',
    reason: '버그 수정은 정확한 분석이 필요하며 Claude가 적합합니다'
  },
  refactor: {
    provider: 'claude',
    model: 'opus',
    mode: 'single',
    reason: '리팩토링은 전체 구조 이해가 필요하여 Opus를 추천합니다'
  },
  test: {
    provider: 'claude',
    model: 'sonnet',
    mode: 'swarm',
    strategy: 'testing',
    maxAgents: 3,
    reason: '테스트 작성은 여러 케이스를 병렬로 처리하면 효율적입니다'
  },
  documentation: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    mode: 'single',
    reason: '문서 작성은 빠른 응답이 장점인 Gemini Flash가 적합합니다'
  },
  research: {
    provider: 'claude',
    model: 'sonnet',
    mode: 'swarm',
    strategy: 'research',
    maxAgents: 5,
    reason: '조사/분석은 여러 에이전트가 병렬로 탐색하면 효율적입니다'
  },
  design: {
    provider: 'claude',
    model: 'opus',
    mode: 'single',
    reason: '설계는 깊은 이해가 필요하여 Claude Opus를 추천합니다'
  },
  review: {
    provider: 'claude',
    model: 'sonnet',
    mode: 'single',
    reason: '코드 리뷰는 Claude Sonnet이 적합합니다'
  },
  config: {
    provider: 'claude',
    model: 'haiku',
    mode: 'single',
    reason: '설정 작업은 빠른 Haiku로도 충분합니다'
  },
  unknown: {
    provider: 'claude',
    model: 'sonnet',
    mode: 'single',
    reason: '기본 추천: Claude Sonnet (균형 잡힌 성능)'
  }
}

// =============================================
// 분류 함수
// =============================================

/**
 * 태스크 제목/설명에서 유형 분류
 */
export function classifyTask(title: string, description?: string): TaskType {
  const text = `${title} ${description || ''}`.toLowerCase()

  let bestMatch: TaskType = 'unknown'
  let bestScore = 0

  for (const [type, keywords] of Object.entries(TASK_KEYWORDS)) {
    if (type === 'unknown') continue

    let score = 0
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score++
        // 제목에 있으면 가중치 추가
        if (title.toLowerCase().includes(keyword.toLowerCase())) {
          score += 0.5
        }
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = type as TaskType
    }
  }

  return bestMatch
}

/**
 * 태스크에 대한 추천 설정 생성
 */
export function getTaskRecommendation(
  title: string,
  description?: string,
  availableProviders?: AIProvider[]
): TaskRecommendation {
  const taskType = classifyTask(title, description)
  const baseRecommendation = TYPE_RECOMMENDATIONS[taskType]

  // 사용 가능한 Provider 확인
  if (availableProviders && availableProviders.length > 0) {
    if (!availableProviders.includes(baseRecommendation.provider)) {
      // 추천 Provider가 사용 불가하면 사용 가능한 첫 번째 Provider로 변경
      const fallbackProvider = availableProviders.includes('claude')
        ? 'claude'
        : availableProviders[0]

      return {
        ...baseRecommendation,
        provider: fallbackProvider,
        model: fallbackProvider === 'claude' ? 'sonnet' : '',
        reason: `${baseRecommendation.reason} (${baseRecommendation.provider} 미설치로 ${fallbackProvider} 사용)`
      }
    }
  }

  return { ...baseRecommendation }
}

/**
 * 복잡도 기반 추천 조정
 */
export function adjustForComplexity(
  recommendation: TaskRecommendation,
  taskTitle: string,
  subTaskCount?: number
): TaskRecommendation {
  const adjusted = { ...recommendation }

  // 하위 태스크가 많으면 Swarm 모드 추천
  if (subTaskCount && subTaskCount > 3) {
    adjusted.mode = 'swarm'
    adjusted.strategy = 'development'
    adjusted.maxAgents = Math.min(subTaskCount, 8)
    adjusted.reason += ` (${subTaskCount}개 하위 태스크 → Swarm 모드 추천)`
  }

  // 복잡한 키워드가 있으면 더 강력한 모델 추천
  const complexityKeywords = ['복잡', 'complex', '대규모', 'large-scale', '전체', 'entire', '시스템', 'system']
  if (complexityKeywords.some(kw => taskTitle.toLowerCase().includes(kw))) {
    if (adjusted.provider === 'claude' && adjusted.model !== 'opus') {
      adjusted.model = 'opus'
      adjusted.reason += ' (복잡한 태스크 → Opus 모델 추천)'
    }
  }

  return adjusted
}

// =============================================
// UI 헬퍼
// =============================================

/** 태스크 유형 라벨 */
export const TASK_TYPE_LABELS: Record<TaskType, { label: string; emoji: string; color: string }> = {
  implementation: { label: '구현', emoji: '🔨', color: 'blue' },
  bugfix: { label: '버그 수정', emoji: '🐛', color: 'red' },
  refactor: { label: '리팩토링', emoji: '♻️', color: 'green' },
  test: { label: '테스트', emoji: '🧪', color: 'purple' },
  documentation: { label: '문서', emoji: '📝', color: 'yellow' },
  research: { label: '조사', emoji: '🔍', color: 'cyan' },
  design: { label: '설계', emoji: '📐', color: 'indigo' },
  review: { label: '리뷰', emoji: '👀', color: 'orange' },
  config: { label: '설정', emoji: '⚙️', color: 'gray' },
  unknown: { label: '기타', emoji: '❓', color: 'gray' }
}

/**
 * 태스크 유형 정보 가져오기
 */
export function getTaskTypeInfo(title: string, description?: string) {
  const taskType = classifyTask(title, description)
  return {
    type: taskType,
    ...TASK_TYPE_LABELS[taskType]
  }
}

// =============================================
// 복잡도 분석
// =============================================

export interface ComplexityAnalysis {
  score: number        // 0-100
  level: 'simple' | 'moderate' | 'complex' | 'very-complex'
  factors: {
    textLength: number
    keywordDensity: number
    subTaskCount: number
    technicalTerms: number
  }
  recommendation: {
    mode: 'single' | 'swarm'
    suggestedAgents?: number
    suggestedModel: string
  }
}

/**
 * 태스크 복잡도 분석
 */
export function analyzeComplexity(
  title: string,
  description?: string,
  subTaskCount?: number
): ComplexityAnalysis {
  const text = `${title} ${description || ''}`
  const wordCount = text.split(/\s+/).length

  // 기술 용어 감지
  const technicalTerms = [
    'api', 'database', 'authentication', 'authorization', 'migration',
    'integration', 'distributed', 'concurrent', 'async', 'websocket',
    'graphql', 'microservice', 'kubernetes', 'docker', 'ci/cd'
  ]
  const technicalCount = technicalTerms.filter(term =>
    text.toLowerCase().includes(term)
  ).length

  // 복잡도 점수 계산
  let score = 0

  // 텍스트 길이 (최대 25점)
  score += Math.min(wordCount / 4, 25)

  // 서브태스크 수 (최대 30점)
  score += Math.min((subTaskCount || 0) * 5, 30)

  // 기술 용어 (최대 25점)
  score += Math.min(technicalCount * 5, 25)

  // 키워드 밀도 - 복잡한 키워드가 많을수록 (최대 20점)
  const complexKeywords = ['복잡', 'complex', '전체', 'entire', '리팩토링', 'refactor', '최적화', 'optimize']
  const complexCount = complexKeywords.filter(kw => text.toLowerCase().includes(kw)).length
  score += complexCount * 5

  // 레벨 결정
  let level: ComplexityAnalysis['level']
  if (score < 20) level = 'simple'
  else if (score < 40) level = 'moderate'
  else if (score < 70) level = 'complex'
  else level = 'very-complex'

  // 추천 생성
  const recommendation = {
    mode: score >= 40 ? 'swarm' as const : 'single' as const,
    suggestedAgents: score >= 40 ? Math.min(Math.ceil(score / 15), 8) : undefined,
    suggestedModel: score >= 70 ? 'opus' : score >= 40 ? 'sonnet' : 'haiku'
  }

  return {
    score,
    level,
    factors: {
      textLength: wordCount,
      keywordDensity: complexCount,
      subTaskCount: subTaskCount || 0,
      technicalTerms: technicalCount
    },
    recommendation
  }
}

// =============================================
// 비용 인식 라우팅
// =============================================

/** Provider별 예상 비용 (토큰당 USD) */
export const PROVIDER_COSTS: Record<AIProvider, { input: number; output: number }> = {
  claude: { input: 0.003, output: 0.015 },    // Sonnet 기준
  gemini: { input: 0.001, output: 0.002 },    // Flash 기준
  codex: { input: 0.002, output: 0.008 },
  qwen: { input: 0.0005, output: 0.001 },
  kilo: { input: 0.001, output: 0.003 },
  opencode: { input: 0.001, output: 0.004 },
  custom: { input: 0, output: 0 }
}

export interface CostEstimate {
  provider: AIProvider
  model: string
  estimatedTokens: number
  estimatedCost: number
}

/**
 * 비용 추정
 */
export function estimateCost(
  provider: AIProvider,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): number {
  const costs = PROVIDER_COSTS[provider]
  return (estimatedInputTokens * costs.input + estimatedOutputTokens * costs.output) / 1000
}

/**
 * 비용 제한을 고려한 Provider 추천
 */
export function getProviderWithinBudget(
  maxBudget: number,
  estimatedTokens: number,
  availableProviders: AIProvider[]
): AIProvider | null {
  const estimates: CostEstimate[] = []

  for (const provider of availableProviders) {
    const cost = estimateCost(provider, estimatedTokens, estimatedTokens * 1.5)
    estimates.push({ provider, model: '', estimatedTokens, estimatedCost: cost })
  }

  // 비용 오름차순 정렬
  estimates.sort((a, b) => a.estimatedCost - b.estimatedCost)

  // 예산 내 첫 번째 Provider
  const affordable = estimates.find(e => e.estimatedCost <= maxBudget)
  return affordable?.provider || null
}

// =============================================
// 향상된 추천 함수
// =============================================

export interface EnhancedRecommendation extends TaskRecommendation {
  complexity: ComplexityAnalysis
  estimatedCost?: number
  alternativeProviders?: Array<{
    provider: AIProvider
    reason: string
  }>
}

/**
 * 향상된 태스크 추천 (복잡도 + 비용 고려)
 */
export function getEnhancedRecommendation(
  title: string,
  description?: string,
  options?: {
    subTaskCount?: number
    maxBudget?: number
    availableProviders?: AIProvider[]
    preferQuality?: boolean  // true: 품질 우선, false: 비용 우선
  }
): EnhancedRecommendation {
  const complexity = analyzeComplexity(title, description, options?.subTaskCount)
  const baseRec = getTaskRecommendation(title, description, options?.availableProviders)

  // 복잡도 기반 조정
  let adjustedRec = { ...baseRec }

  if (complexity.level === 'very-complex') {
    adjustedRec.mode = 'swarm'
    adjustedRec.maxAgents = complexity.recommendation.suggestedAgents
    adjustedRec.model = 'opus'
    adjustedRec.reason += ` (복잡도 ${complexity.score.toFixed(0)}점 → ${complexity.level})`
  } else if (complexity.level === 'complex') {
    adjustedRec.model = 'sonnet'
  } else if (complexity.level === 'simple' && !options?.preferQuality) {
    adjustedRec.model = 'haiku'
    adjustedRec.provider = 'gemini' // 비용 효율적
  }

  // 비용 추정
  const estimatedTokens = complexity.factors.textLength * 100 // 대략적 추정
  const estimatedCost = estimateCost(adjustedRec.provider, estimatedTokens, estimatedTokens * 1.5)

  // 대안 Provider
  const alternativeProviders: EnhancedRecommendation['alternativeProviders'] = []

  if (adjustedRec.provider === 'claude' && options?.availableProviders?.includes('gemini')) {
    alternativeProviders.push({
      provider: 'gemini',
      reason: `더 저렴한 대안 (예상 비용: $${estimateCost('gemini', estimatedTokens, estimatedTokens * 1.5).toFixed(4)})`
    })
  }

  return {
    ...adjustedRec,
    complexity,
    estimatedCost,
    alternativeProviders
  }
}

// =============================================
// Consensus 자동 라우팅
// =============================================

/** Consensus가 추천되는 태스크 유형 */
const CONSENSUS_RECOMMENDED_TYPES: TaskType[] = [
  'review',       // 코드 리뷰 - 다양한 관점 필요
  'design',       // 설계 - 다중 검증 필요
  'research',     // 조사 - 다양한 소스 검토
  'refactor',     // 리팩토링 - 접근 방식 비교
]

/** Consensus 필수 키워드 */
const CONSENSUS_KEYWORDS = [
  '검증', 'verify', 'validate',
  '비교', 'compare', 'comparison',
  '다양한', 'multiple', 'various',
  '확인', 'confirm', 'check',
  '합의', 'consensus', 'agree',
  '검토', 'review',
  '중요', 'critical', 'important',
  '보안', 'security', 'secure',
]

/**
 * Consensus 사용 여부 판단
 */
export function shouldUseConsensus(
  title: string,
  description?: string,
  options?: {
    taskType?: TaskType
    complexity?: ComplexityAnalysis
    availableProviders?: AIProvider[]
    preferQuality?: boolean
  }
): boolean {
  // 사용 가능한 Provider가 2개 미만이면 Consensus 불가
  if (options?.availableProviders && options.availableProviders.length < 2) {
    return false
  }

  const taskType = options?.taskType ?? classifyTask(title, description)
  const complexity = options?.complexity ?? analyzeComplexity(title, description)

  // 1. 태스크 유형 기반 체크
  if (CONSENSUS_RECOMMENDED_TYPES.includes(taskType)) {
    return true
  }

  // 2. 복잡도 기반 체크 (매우 복잡한 태스크)
  if (complexity.level === 'very-complex' && options?.preferQuality) {
    return true
  }

  // 3. 키워드 기반 체크
  const text = `${title} ${description || ''}`.toLowerCase()
  const hasConsensusKeyword = CONSENSUS_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))

  if (hasConsensusKeyword && complexity.level !== 'simple') {
    return true
  }

  return false
}

/**
 * Consensus 전략 선택
 */
export function selectConsensusStrategy(
  title: string,
  description?: string,
  options?: {
    taskType?: TaskType
    availableProviders?: AIProvider[]
    preferSpeed?: boolean
  }
): ConsensusStrategy {
  const taskType = options?.taskType ?? classifyTask(title, description)
  const text = `${title} ${description || ''}`.toLowerCase()

  // 보안/중요 태스크: 만장일치
  if (text.includes('보안') || text.includes('security') ||
      text.includes('critical') || text.includes('중요')) {
    return 'unanimous'
  }

  // 코드 리뷰/검증: 다수결
  if (taskType === 'review' || text.includes('검토') || text.includes('review')) {
    return 'majority'
  }

  // 조사/비교: 가중 투표 (전문 Provider 우선)
  if (taskType === 'research' || text.includes('비교') || text.includes('compare')) {
    return 'weighted'
  }

  // 설계/리팩토링: 최선 선택
  if (taskType === 'design' || taskType === 'refactor') {
    return 'best-of-n'
  }

  // 속도 우선: 다수결 (가장 빠름)
  if (options?.preferSpeed) {
    return 'majority'
  }

  // 기본: 가중 투표
  return 'weighted'
}

/**
 * Consensus 추천 정보 생성
 */
export function getConsensusRecommendation(
  title: string,
  description?: string,
  options?: {
    subTaskCount?: number
    availableProviders?: AIProvider[]
    preferQuality?: boolean
    preferSpeed?: boolean
  }
): ConsensusRecommendation {
  const taskType = classifyTask(title, description)
  const complexity = analyzeComplexity(title, description, options?.subTaskCount)
  const availableProviders = options?.availableProviders ?? ['claude', 'gemini'] as AIProvider[]

  const useConsensus = shouldUseConsensus(title, description, {
    taskType,
    complexity,
    availableProviders,
    preferQuality: options?.preferQuality
  })

  if (!useConsensus) {
    return {
      shouldUseConsensus: false,
      strategy: 'majority',
      providers: [],
      reason: 'Consensus가 필요하지 않은 단순 태스크입니다'
    }
  }

  const strategy = selectConsensusStrategy(title, description, {
    taskType,
    availableProviders,
    preferSpeed: options?.preferSpeed
  })

  // 전략에 따른 Provider 선택
  let selectedProviders: AIProvider[]

  switch (strategy) {
    case 'unanimous':
      // 만장일치: 최소 3개 Provider 권장
      selectedProviders = availableProviders.slice(0, Math.min(3, availableProviders.length))
      break

    case 'weighted':
      // 가중 투표: Claude 포함 필수
      selectedProviders = availableProviders.includes('claude')
        ? ['claude' as AIProvider, ...availableProviders.filter(p => p !== 'claude').slice(0, 2)]
        : availableProviders.slice(0, 3)
      break

    case 'best-of-n':
      // 최선 선택: 2-3개 Provider
      selectedProviders = availableProviders.slice(0, 3)
      break

    case 'majority':
    default:
      // 다수결: 홀수개 Provider (3개 권장)
      selectedProviders = availableProviders.slice(0, Math.min(3, availableProviders.length))
      break
  }

  // 추천 이유 생성
  const reasons: string[] = []

  if (CONSENSUS_RECOMMENDED_TYPES.includes(taskType)) {
    reasons.push(`${TASK_TYPE_LABELS[taskType].label} 태스크는 다중 검증이 효과적입니다`)
  }

  if (complexity.level === 'very-complex') {
    reasons.push(`복잡도 ${complexity.score.toFixed(0)}점으로 다중 AI 합의 권장`)
  }

  const text = `${title} ${description || ''}`.toLowerCase()
  const matchedKeyword = CONSENSUS_KEYWORDS.find(kw => text.includes(kw.toLowerCase()))
  if (matchedKeyword) {
    reasons.push(`"${matchedKeyword}" 키워드 감지`)
  }

  return {
    shouldUseConsensus: true,
    strategy,
    providers: selectedProviders,
    reason: reasons.join('. ') || `${strategy} 전략으로 ${selectedProviders.length}개 Provider 합의 실행`
  }
}

/**
 * 자동 라우팅 - 태스크에 가장 적합한 실행 방법 결정
 */
export interface AutoRoutingResult {
  mode: 'single' | 'swarm' | 'consensus'
  provider: AIProvider
  model: string
  consensus?: ConsensusRecommendation
  swarm?: {
    strategy: SwarmStrategy
    maxAgents: number
  }
  reason: string
}

export function getAutoRouting(
  title: string,
  description?: string,
  options?: {
    subTaskCount?: number
    availableProviders?: AIProvider[]
    preferQuality?: boolean
    preferSpeed?: boolean
    maxBudget?: number
  }
): AutoRoutingResult {
  const taskType = classifyTask(title, description)
  const complexity = analyzeComplexity(title, description, options?.subTaskCount)
  const availableProviders = options?.availableProviders ?? ['claude'] as AIProvider[]

  // 1. Consensus 체크 (품질 우선 & 복잡/중요 태스크)
  if (options?.preferQuality && availableProviders.length >= 2) {
    const consensusRec = getConsensusRecommendation(title, description, {
      subTaskCount: options?.subTaskCount,
      availableProviders,
      preferQuality: true,
      preferSpeed: options?.preferSpeed
    })

    if (consensusRec.shouldUseConsensus) {
      return {
        mode: 'consensus',
        provider: consensusRec.providers[0] ?? 'claude',
        model: 'sonnet',
        consensus: consensusRec,
        reason: consensusRec.reason
      }
    }
  }

  // 2. Swarm 체크 (복잡한 태스크 또는 다수 하위 태스크)
  if (complexity.level === 'very-complex' ||
      (options?.subTaskCount && options.subTaskCount > 3) ||
      taskType === 'test' || taskType === 'research') {

    const baseRec = getTaskRecommendation(title, description, availableProviders)

    return {
      mode: 'swarm',
      provider: baseRec.provider,
      model: baseRec.model,
      swarm: {
        strategy: baseRec.strategy ?? 'development',
        maxAgents: baseRec.maxAgents ?? Math.min(5, (options?.subTaskCount ?? 3) + 2)
      },
      reason: `${TASK_TYPE_LABELS[taskType].label} 태스크 - Swarm 모드로 병렬 처리 권장`
    }
  }

  // 3. 단일 실행 (간단한 태스크)
  const baseRec = getTaskRecommendation(title, description, availableProviders)

  // 비용 제한 체크
  if (options?.maxBudget !== undefined) {
    const estimatedTokens = complexity.factors.textLength * 100
    const estimatedCost = estimateCost(baseRec.provider, estimatedTokens, estimatedTokens * 1.5)

    if (estimatedCost > options.maxBudget) {
      const cheaperProvider = getProviderWithinBudget(options.maxBudget, estimatedTokens, availableProviders)
      if (cheaperProvider) {
        return {
          mode: 'single',
          provider: cheaperProvider,
          model: DEFAULT_MODELS_BY_PROVIDER[cheaperProvider] ?? '',
          reason: `예산 제한으로 ${cheaperProvider} 사용 (예상 비용: $${estimateCost(cheaperProvider, estimatedTokens, estimatedTokens * 1.5).toFixed(4)})`
        }
      }
    }
  }

  return {
    mode: 'single',
    provider: baseRec.provider,
    model: baseRec.model,
    reason: baseRec.reason
  }
}

/** Provider별 기본 모델 매핑 */
const DEFAULT_MODELS_BY_PROVIDER: Partial<Record<AIProvider, string>> = {
  claude: 'sonnet',
  gemini: 'gemini-2.5-flash',
  codex: 'gpt-5.1-codex',
  qwen: 'qwen-coder-plus'
}
