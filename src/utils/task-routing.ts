/**
 * 태스크 유형별 자동 라우팅 유틸리티
 * @module utils/task-routing
 *
 * 태스크 제목/설명을 분석하여 적절한 AI Provider와 Strategy를 추천
 */

import type { AIProvider } from '@/types/ai'
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
