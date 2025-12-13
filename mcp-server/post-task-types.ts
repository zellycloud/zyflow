/**
 * Post-Task Agent Type Definitions
 *
 * 작업 완료 후 자동으로 수행되는 점검/수정 작업을 위한 타입 정의
 */

// ============================================================================
// Task Categories & Types
// ============================================================================

/**
 * 작업 카테고리
 */
export type TaskCategory =
  | 'code-quality'   // 코드 품질 - 자동 수정 + 커밋
  | 'testing'        // 테스트 - 생성 + 확인 후 적용
  | 'ci-cd'          // CI/CD - 분석 + 수정 시도
  | 'production'     // 프로덕션 - 분석 + 보고만
  | 'maintenance';   // 유지보수 - 리마인드만

/**
 * 개별 작업 타입
 */
export type TaskType =
  // Code Quality
  | 'lint-fix'
  | 'type-check'
  | 'dead-code'
  | 'todo-cleanup'
  | 'refactor-suggest'
  // Testing
  | 'test-fix'
  | 'test-gen'
  | 'e2e-expand'
  | 'coverage-fix'
  | 'snapshot-update'
  | 'flaky-detect'
  // CI/CD
  | 'ci-fix'
  | 'dep-audit'
  | 'bundle-check'
  // Production
  | 'sentry-triage'
  | 'security-audit'
  | 'api-validate'
  // Maintenance
  | 'todo-remind'
  | 'coverage-check';

/**
 * 카테고리별 작업 매핑
 */
export const TASK_CATEGORIES: Record<TaskCategory, TaskType[]> = {
  'code-quality': ['lint-fix', 'type-check', 'dead-code', 'todo-cleanup', 'refactor-suggest'],
  'testing': ['test-fix', 'test-gen', 'e2e-expand', 'coverage-fix', 'snapshot-update', 'flaky-detect'],
  'ci-cd': ['ci-fix', 'dep-audit', 'bundle-check'],
  'production': ['sentry-triage', 'security-audit', 'api-validate'],
  'maintenance': ['todo-remind', 'coverage-check'],
};

/**
 * 작업별 자동화 수준
 */
export type AutomationLevel =
  | 'auto-fix'       // 자동 수정 + 커밋
  | 'suggest-apply'  // 생성 + 확인 후 적용
  | 'try-fix'        // 분석 + 수정 시도
  | 'report-only'    // 분석 + 보고만
  | 'remind';        // 리마인드만

export const TASK_AUTOMATION_LEVELS: Record<TaskType, AutomationLevel> = {
  // Code Quality - auto-fix
  'lint-fix': 'auto-fix',
  'type-check': 'auto-fix',
  'dead-code': 'auto-fix',
  'todo-cleanup': 'auto-fix',
  'refactor-suggest': 'report-only',
  // Testing - suggest-apply
  'test-fix': 'suggest-apply',
  'test-gen': 'suggest-apply',
  'e2e-expand': 'suggest-apply',
  'coverage-fix': 'suggest-apply',
  'snapshot-update': 'suggest-apply',
  'flaky-detect': 'suggest-apply',
  // CI/CD - try-fix
  'ci-fix': 'try-fix',
  'dep-audit': 'try-fix',
  'bundle-check': 'report-only',
  // Production - report-only
  'sentry-triage': 'report-only',
  'security-audit': 'report-only',
  'api-validate': 'report-only',
  // Maintenance - remind
  'todo-remind': 'remind',
  'coverage-check': 'remind',
};

// ============================================================================
// Model & CLI Types
// ============================================================================

/**
 * 모델 티어 (성능/비용 기준)
 */
export type ModelTier = 'fast' | 'balanced' | 'powerful';

/**
 * 지원하는 CLI 타입
 */
export type CLIType = 'claude' | 'gemini' | 'qwen' | 'openai';

/**
 * 작업별 기본 모델 티어
 */
export const TASK_DEFAULT_MODEL_TIER: Record<TaskType, ModelTier> = {
  // Fast - 단순 패턴 수정
  'lint-fix': 'fast',
  'type-check': 'fast',
  'todo-cleanup': 'fast',
  'dep-audit': 'fast',
  'snapshot-update': 'fast',
  // Balanced - 중간 복잡도
  'dead-code': 'balanced',
  'ci-fix': 'balanced',
  'test-fix': 'balanced',
  'test-gen': 'balanced',
  'e2e-expand': 'balanced',
  'coverage-fix': 'balanced',
  'flaky-detect': 'balanced',
  'refactor-suggest': 'balanced',
  'bundle-check': 'balanced',
  'api-validate': 'balanced',
  'todo-remind': 'fast',
  'coverage-check': 'fast',
  // Powerful - 복잡한 분석
  'sentry-triage': 'powerful',
  'security-audit': 'powerful',
};

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Post-Task 실행 설정
 */
export interface PostTaskConfig {
  /** 실행할 카테고리 (선택) */
  category?: TaskCategory | 'all';
  /** 실행할 개별 작업 목록 (선택) */
  tasks?: TaskType[];
  /** 사용할 CLI */
  cli?: CLIType;
  /** 모델 티어 오버라이드 */
  model?: ModelTier;
  /** 프로젝트 경로 */
  projectPath?: string;
  /** 드라이런 모드 (실제 변경 없이 리포트만) */
  dryRun?: boolean;
  /** 자동 커밋 비활성화 */
  noCommit?: boolean;
}

/**
 * 개별 작업 실행 결과
 */
export interface TaskResult {
  /** 작업 타입 */
  task: TaskType;
  /** 성공 여부 */
  success: boolean;
  /** 실행 시간 (ms) */
  duration: number;
  /** 발견된 문제 수 */
  issuesFound: number;
  /** 수정된 문제 수 */
  issuesFixed: number;
  /** 사용된 모델 */
  model: string;
  /** 사용된 CLI */
  cli: CLIType;
  /** 상세 결과 */
  details?: TaskResultDetails;
  /** 에러 메시지 (실패 시) */
  error?: string;
}

/**
 * 작업별 상세 결과
 */
export interface TaskResultDetails {
  /** 변경된 파일 목록 */
  modifiedFiles?: string[];
  /** 격리된 파일 목록 (dead-code) */
  quarantinedFiles?: string[];
  /** 생성된 파일 목록 (test-gen) */
  generatedFiles?: string[];
  /** 수정 제안 목록 */
  suggestions?: TaskSuggestion[];
  /** 원본 출력 로그 */
  rawOutput?: string;
}

/**
 * 수정 제안
 */
export interface TaskSuggestion {
  /** 파일 경로 */
  file: string;
  /** 라인 번호 */
  line?: number;
  /** 문제 설명 */
  issue: string;
  /** 수정 제안 */
  suggestion: string;
  /** 신뢰도 */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Post-Task 전체 실행 결과
 */
export interface PostTaskResult {
  /** 실행 ID */
  runId: string;
  /** 시작 시간 */
  startedAt: string;
  /** 종료 시간 */
  finishedAt: string;
  /** 전체 실행 시간 (ms) */
  totalDuration: number;
  /** 전체 성공 여부 */
  success: boolean;
  /** 실행된 작업 수 */
  tasksRun: number;
  /** 성공한 작업 수 */
  tasksSucceeded: number;
  /** 실패한 작업 수 */
  tasksFailed: number;
  /** 개별 작업 결과 */
  results: TaskResult[];
  /** 생성된 리포트 경로 */
  reportPath?: string;
}

// ============================================================================
// Trigger Types
// ============================================================================

/**
 * 트리거 타입
 */
export type TriggerType =
  | 'manual'      // 수동 실행
  | 'git-hook'    // Git hook
  | 'scheduled'   // 스케줄 (cron)
  | 'event';      // 이벤트 기반

/**
 * Git Hook 타입
 */
export type GitHookType =
  | 'pre-commit'
  | 'pre-push'
  | 'post-commit'
  | 'post-merge';

/**
 * 이벤트 타입
 */
export type EventTriggerType =
  | 'ci-failure'
  | 'pr-created'
  | 'pr-merged'
  | 'deploy-complete'
  | 'sentry-issue';

/**
 * 트리거 설정
 */
export interface TriggerConfig {
  /** Git Hook 설정 */
  hooks?: Partial<Record<GitHookType, TaskType[]>>;
  /** 스케줄 설정 */
  schedule?: ScheduleConfig[];
  /** 이벤트 설정 */
  events?: Partial<Record<EventTriggerType, TaskType[]>>;
  /** 폴링 설정 */
  polling?: {
    'github-ci'?: { interval: string; enabled: boolean };
    'sentry'?: { interval: string; enabled: boolean };
  };
}

/**
 * 스케줄 설정
 */
export interface ScheduleConfig {
  /** Cron 표현식 */
  cron: string;
  /** 실행할 작업 목록 */
  tasks: TaskType[];
  /** 설명 (선택) */
  description?: string;
}

/**
 * 기본 트리거 설정
 */
export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  hooks: {
    'pre-commit': ['lint-fix', 'type-check'],
    'pre-push': ['test-fix'],
    'post-commit': ['test-gen'],
    'post-merge': ['dep-audit', 'dead-code'],
  },
  schedule: [
    { cron: '0 9 * * *', tasks: ['sentry-triage', 'security-audit'], description: '매일 오전 9시' },
    { cron: '0 9 * * 1', tasks: ['dead-code', 'e2e-expand'], description: '매주 월요일 오전 9시' },
    { cron: '0 9 1 * *', tasks: ['refactor-suggest'], description: '매월 1일 오전 9시' },
  ],
  events: {
    'ci-failure': ['ci-fix', 'test-fix'],
    'pr-created': ['lint-fix', 'type-check', 'test-gen'],
    'pr-merged': ['dead-code', 'coverage-check'],
    'deploy-complete': ['e2e-expand', 'api-validate'],
    'sentry-issue': ['sentry-triage'],
  },
  polling: {
    'github-ci': { interval: '5m', enabled: true },
    'sentry': { interval: '15m', enabled: true },
  },
};

// ============================================================================
// Quarantine Types
// ============================================================================

/**
 * 격리 매니페스트
 */
export interface QuarantineManifest {
  /** 격리 날짜 */
  date: string;
  /** 격리 사유 */
  reason: string;
  /** 격리 항목 목록 */
  items: QuarantineItem[];
}

/**
 * 격리 항목
 */
export interface QuarantineItem {
  /** 고유 ID */
  id: string;
  /** 원본 파일 경로 */
  original: string;
  /** 격리된 파일 경로 */
  quarantined: string;
  /** 상세 사유 */
  reason: string;
  /** 감지 도구 */
  detectedBy: string;
  /** 신뢰도 */
  confidence: 'high' | 'medium' | 'low';
  /** 마지막 사용일 (git log 기반) */
  lastUsed?: string;
  /** 복구 날짜 (복구된 경우) */
  restoredAt?: string;
  /** 삭제 날짜 (삭제된 경우) */
  deletedAt?: string;
}

/**
 * 격리 상태
 */
export type QuarantineStatus =
  | 'quarantined'  // 격리됨 (0-14일)
  | 'pending'      // 삭제 대기 (14-30일)
  | 'expired';     // 만료 (30일+)

/**
 * 격리 정책
 */
export interface QuarantinePolicy {
  /** 삭제 대기로 전환되는 일 수 */
  pendingAfterDays: number;
  /** 만료되는 일 수 */
  expireAfterDays: number;
  /** 자동 삭제 활성화 */
  autoDelete: boolean;
}

export const DEFAULT_QUARANTINE_POLICY: QuarantinePolicy = {
  pendingAfterDays: 14,
  expireAfterDays: 30,
  autoDelete: false,
};

// ============================================================================
// Report Types
// ============================================================================

/**
 * 리포트 형식
 */
export type ReportFormat = 'json' | 'markdown';

/**
 * 리포트 메타데이터
 */
export interface ReportMetadata {
  /** 리포트 ID */
  id: string;
  /** 생성 시간 */
  createdAt: string;
  /** 작업 타입 (단일 또는 전체) */
  taskType: TaskType | 'all';
  /** 트리거 타입 */
  triggerType: TriggerType;
  /** 리포트 형식 */
  format: ReportFormat;
  /** 파일 경로 */
  filePath: string;
}
