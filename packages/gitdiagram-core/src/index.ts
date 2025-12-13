/**
 * @zyflow/gitdiagram-core
 *
 * AI-powered repository architecture diagram generator
 * Based on GitDiagram by Ahmed Khaleel
 *
 * @example
 * ```typescript
 * import { DiagramGenerator, ClaudeAdapter } from '@zyflow/gitdiagram-core';
 *
 * const llm = new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY });
 * const generator = new DiagramGenerator({ llm });
 *
 * const result = await generator.generate('/path/to/project', {
 *   onProgress: (stage, message) => console.log(`[${stage}] ${message}`),
 * });
 *
 * console.log(result.mermaidCode);
 * ```
 */

// Prompts
export {
  SYSTEM_FIRST_PROMPT,
  SYSTEM_SECOND_PROMPT,
  SYSTEM_THIRD_PROMPT,
  ADDITIONAL_SYSTEM_INSTRUCTIONS_PROMPT,
  SYSTEM_MODIFY_PROMPT,
  createFirstPromptUserMessage,
  createSecondPromptUserMessage,
  createThirdPromptUserMessage,
  createModifyPromptUserMessage,
  withAdditionalInstructions,
} from './prompts';

// File Tree
export {
  generateFileTree,
  readReadme,
  getProjectContext,
  type FileTreeOptions,
} from './file-tree';

// LLM Adapter
export {
  ClaudeAdapter,
  OpenAIAdapter,
  createLLMAdapter,
  getApiKeyFromEnv,
  type LLMAdapter,
  type LLMMessage,
  type LLMCompletionOptions,
} from './llm-adapter';

// Generator
export {
  generateDiagram,
  modifyDiagram,
  DiagramGenerator,
  type GeneratorOptions,
  type GenerationStage,
  type GenerationResult,
  type ModifyResult,
} from './generator';

// Mermaid Utilities
export {
  validateMermaidSyntax,
  extractClickEvents,
  updateClickEvents,
  pathsToGitHubUrls,
  extractNodeIds,
  ensureColorStyles,
  formatMermaidCode,
  type ClickEvent,
  type ValidationResult,
} from './mermaid-utils';
