/**
 * CLI Model Mappings
 *
 * 각 CLI별 모델 매핑 및 작업별 기본 모델 설정
 */

import type { CLIType, ModelTier, TaskType } from './post-task-types.js';
import { TASK_DEFAULT_MODEL_TIER } from './post-task-types.js';

// ============================================================================
// CLI별 모델 매핑
// ============================================================================

/**
 * CLI별 모델 티어 매핑
 */
export const CLI_MODELS: Record<CLIType, Record<ModelTier, string>> = {
  claude: {
    fast: 'claude-haiku',
    balanced: 'claude-sonnet',
    powerful: 'claude-opus',
  },
  gemini: {
    fast: 'gemini-2.0-flash',
    balanced: 'gemini-2.0-flash',
    powerful: 'gemini-2.5-pro',
  },
  qwen: {
    fast: 'qwen-turbo',
    balanced: 'qwen-plus',
    powerful: 'qwen-max',
  },
  openai: {
    fast: 'gpt-4o-mini',
    balanced: 'gpt-4o',
    powerful: 'o1',
  },
};

/**
 * CLI별 실행 명령어 템플릿
 */
export const CLI_COMMANDS: Record<CLIType, string> = {
  claude: 'claude',
  gemini: 'gemini',
  qwen: 'qwen',
  openai: 'openai',
};

/**
 * CLI별 모델 플래그
 */
export const CLI_MODEL_FLAGS: Record<CLIType, string> = {
  claude: '--model',
  gemini: '--model',
  qwen: '--model',
  openai: '--model',
};

// ============================================================================
// Model Selection Functions
// ============================================================================

/**
 * 작업에 대한 기본 모델 가져오기
 */
export function getDefaultModelForTask(task: TaskType): ModelTier {
  return TASK_DEFAULT_MODEL_TIER[task] || 'balanced';
}

/**
 * CLI와 모델 티어로 실제 모델 이름 가져오기
 */
export function getModelName(cli: CLIType, tier: ModelTier): string {
  return CLI_MODELS[cli]?.[tier] || CLI_MODELS.claude[tier];
}

/**
 * 작업에 대한 최적 모델 결정
 */
export function selectModelForTask(
  task: TaskType,
  options?: { cli?: CLIType; modelOverride?: ModelTier }
): { cli: CLIType; model: string; tier: ModelTier } {
  const cli = options?.cli || 'claude';
  const tier = options?.modelOverride || getDefaultModelForTask(task);
  const model = getModelName(cli, tier);

  return { cli, model, tier };
}

/**
 * CLI 명령어 생성
 */
export function buildCLICommand(
  cli: CLIType,
  model: string,
  prompt: string,
  additionalArgs?: string[]
): string {
  const baseCmd = CLI_COMMANDS[cli];
  const modelFlag = CLI_MODEL_FLAGS[cli];
  const args = additionalArgs?.join(' ') || '';

  // 프롬프트는 stdin으로 전달하거나 파일로 전달
  return `${baseCmd} ${modelFlag} ${model} ${args}`.trim();
}

// ============================================================================
// CLI Availability Check
// ============================================================================

/**
 * CLI 사용 가능 여부 확인을 위한 명령어
 */
export const CLI_VERSION_COMMANDS: Record<CLIType, string> = {
  claude: 'claude --version',
  gemini: 'gemini --version',
  qwen: 'qwen --version',
  openai: 'openai --version',
};

/**
 * 기본 CLI 순서 (fallback용)
 */
export const CLI_PRIORITY: CLIType[] = ['claude', 'gemini', 'qwen', 'openai'];

// ============================================================================
// Model Cost Estimation (상대적 비용)
// ============================================================================

/**
 * 모델 티어별 상대적 비용 (1~10 스케일)
 */
export const MODEL_TIER_COST: Record<ModelTier, number> = {
  fast: 1,
  balanced: 5,
  powerful: 10,
};

/**
 * 예상 비용 계산 (작업 목록 기준)
 */
export function estimateCost(tasks: TaskType[], modelOverride?: ModelTier): number {
  return tasks.reduce((total, task) => {
    const tier = modelOverride || getDefaultModelForTask(task);
    return total + MODEL_TIER_COST[tier];
  }, 0);
}

// ============================================================================
// Model Descriptions (UI/문서용)
// ============================================================================

/**
 * 모델 티어 설명
 */
export const MODEL_TIER_DESCRIPTIONS: Record<ModelTier, { name: string; description: string }> = {
  fast: {
    name: 'Fast',
    description: '빠른 처리, 낮은 비용. 단순 패턴 수정에 적합',
  },
  balanced: {
    name: 'Balanced',
    description: '균형 잡힌 성능. 대부분의 작업에 적합',
  },
  powerful: {
    name: 'Powerful',
    description: '최고 성능. 복잡한 분석 및 보안 관련 작업에 적합',
  },
};

/**
 * CLI 설명
 */
export const CLI_DESCRIPTIONS: Record<CLIType, { name: string; description: string }> = {
  claude: {
    name: 'Claude (Anthropic)',
    description: 'Anthropic의 Claude 모델. 기본 CLI',
  },
  gemini: {
    name: 'Gemini (Google)',
    description: 'Google의 Gemini 모델',
  },
  qwen: {
    name: 'Qwen (Alibaba)',
    description: 'Alibaba의 Qwen 모델',
  },
  openai: {
    name: 'OpenAI',
    description: 'OpenAI의 GPT 모델',
  },
};
