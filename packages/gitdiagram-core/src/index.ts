/**
 * @zyflow/gitdiagram-core
 *
 * AI-powered repository architecture diagram generator
 * Based on GitDiagram by Ahmed Khaleel
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

// Types (to be added)
export interface DiagramGenerationOptions {
  /** Project root path */
  projectPath: string;
  /** Optional custom instructions */
  instructions?: string;
  /** Maximum file tree depth */
  maxDepth?: number;
  /** Patterns to exclude from file tree */
  excludePatterns?: string[];
}

export interface DiagramResult {
  /** Generated Mermaid.js code */
  mermaidCode: string;
  /** Architecture explanation */
  explanation: string;
  /** Component to file/directory mappings */
  componentMapping: Record<string, string>;
}

export interface ModifyDiagramOptions {
  /** Existing Mermaid.js diagram code */
  diagram: string;
  /** Original explanation */
  explanation: string;
  /** Modification instructions */
  instructions: string;
}
