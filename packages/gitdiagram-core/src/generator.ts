/**
 * Diagram Generator
 *
 * Implements the 3-stage AI generation process:
 * 1. Analyze project and create explanation
 * 2. Map components to files/directories
 * 3. Generate Mermaid.js diagram
 */

import type { LLMAdapter, LLMMessage } from './llm-adapter.js';
import {
  SYSTEM_FIRST_PROMPT,
  SYSTEM_SECOND_PROMPT,
  SYSTEM_THIRD_PROMPT,
  SYSTEM_MODIFY_PROMPT,
  ADDITIONAL_SYSTEM_INSTRUCTIONS_PROMPT,
  createFirstPromptUserMessage,
  createSecondPromptUserMessage,
  createThirdPromptUserMessage,
  createModifyPromptUserMessage,
} from './prompts.js';
import { getProjectContext, type FileTreeOptions } from './file-tree.js';

export interface GeneratorOptions {
  /** LLM adapter to use */
  llm: LLMAdapter;
  /** File tree options */
  fileTreeOptions?: FileTreeOptions;
  /** Custom instructions for generation */
  instructions?: string;
  /** Callback for progress updates */
  onProgress?: (stage: GenerationStage, message: string) => void;
}

export type GenerationStage =
  | 'analyzing'
  | 'mapping'
  | 'generating'
  | 'complete'
  | 'error';

export interface GenerationResult {
  /** Generated Mermaid.js code */
  mermaidCode: string;
  /** Architecture explanation */
  explanation: string;
  /** Component to file/directory mappings */
  componentMapping: Record<string, string>;
  /** Raw component mapping text */
  rawComponentMapping: string;
  /** File tree used for generation */
  fileTree: string;
  /** README content if found */
  readme: string | null;
}

export interface ModifyResult {
  /** Modified Mermaid.js code */
  mermaidCode: string;
}

/**
 * Parse component mapping from LLM response
 */
function parseComponentMapping(text: string): Record<string, string> {
  const mapping: Record<string, string> = {};

  // Extract content between <component_mapping> tags
  const match = text.match(
    /<component_mapping>([\s\S]*?)<\/component_mapping>/
  );
  const content = match ? match[1] : text;

  // Parse numbered list format: "1. [Component]: [Path]"
  const lines = content.split('\n');
  for (const line of lines) {
    const lineMatch = line.match(/^\d+\.\s*(.+?):\s*(.+)$/);
    if (lineMatch) {
      const [, component, path] = lineMatch;
      mapping[component.trim()] = path.trim();
    }
  }

  return mapping;
}

/**
 * Extract explanation from LLM response
 */
function extractExplanation(text: string): string {
  const match = text.match(/<explanation>([\s\S]*?)<\/explanation>/);
  return match ? match[1].trim() : text.trim();
}

/**
 * Clean Mermaid code (remove markdown fences if present)
 */
function cleanMermaidCode(code: string): string {
  let cleaned = code.trim();

  // Remove markdown code fences
  if (cleaned.startsWith('```mermaid')) {
    cleaned = cleaned.slice(10);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned.trim();
}

/**
 * Generate a diagram for a project
 */
export async function generateDiagram(
  projectPath: string,
  options: GeneratorOptions
): Promise<GenerationResult> {
  const { llm, fileTreeOptions, instructions, onProgress } = options;

  // Stage 1: Get project context
  onProgress?.('analyzing', 'Reading project structure...');
  const { fileTree, readme } = await getProjectContext(
    projectPath,
    fileTreeOptions
  );

  // Stage 1: Generate explanation
  onProgress?.('analyzing', 'Analyzing architecture...');
  const firstPromptMessages: LLMMessage[] = [
    {
      role: 'system',
      content: instructions
        ? `${SYSTEM_FIRST_PROMPT}\n\n${ADDITIONAL_SYSTEM_INSTRUCTIONS_PROMPT}`
        : SYSTEM_FIRST_PROMPT,
    },
    {
      role: 'user',
      content: instructions
        ? `${createFirstPromptUserMessage(fileTree, readme ?? 'No README found.')}\n\n<instructions>\n${instructions}\n</instructions>`
        : createFirstPromptUserMessage(fileTree, readme ?? 'No README found.'),
    },
  ];

  const explanationResponse = await llm.complete(firstPromptMessages, {
    maxTokens: 4096,
    temperature: 0.7,
  });

  // Check for BAD_INSTRUCTIONS
  if (explanationResponse.trim() === 'BAD_INSTRUCTIONS') {
    throw new Error(
      'Custom instructions were unclear or unrelated to the task'
    );
  }

  const explanation = extractExplanation(explanationResponse);

  // Stage 2: Map components to files
  onProgress?.('mapping', 'Mapping components to files...');
  const secondPromptMessages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_SECOND_PROMPT },
    {
      role: 'user',
      content: createSecondPromptUserMessage(explanation, fileTree),
    },
  ];

  const mappingResponse = await llm.complete(secondPromptMessages, {
    maxTokens: 2048,
    temperature: 0.5,
  });

  const componentMapping = parseComponentMapping(mappingResponse);
  const rawComponentMapping = mappingResponse;

  // Stage 3: Generate Mermaid diagram
  onProgress?.('generating', 'Generating diagram...');
  const thirdPromptMessages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_THIRD_PROMPT },
    {
      role: 'user',
      content: createThirdPromptUserMessage(explanation, mappingResponse),
    },
  ];

  const diagramResponse = await llm.complete(thirdPromptMessages, {
    maxTokens: 8192,
    temperature: 0.7,
  });

  const mermaidCode = cleanMermaidCode(diagramResponse);

  onProgress?.('complete', 'Diagram generated successfully');

  return {
    mermaidCode,
    explanation,
    componentMapping,
    rawComponentMapping,
    fileTree,
    readme,
  };
}

/**
 * Modify an existing diagram based on instructions
 */
export async function modifyDiagram(
  diagram: string,
  explanation: string,
  instructions: string,
  llm: LLMAdapter
): Promise<ModifyResult> {
  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_MODIFY_PROMPT },
    {
      role: 'user',
      content: createModifyPromptUserMessage(diagram, explanation, instructions),
    },
  ];

  const response = await llm.complete(messages, {
    maxTokens: 8192,
    temperature: 0.7,
  });

  // Check for BAD_INSTRUCTIONS
  if (response.trim() === 'BAD_INSTRUCTIONS') {
    throw new Error(
      'Modification instructions were unclear or unrelated to the task'
    );
  }

  return {
    mermaidCode: cleanMermaidCode(response),
  };
}

/**
 * DiagramGenerator class for stateful generation
 */
export class DiagramGenerator {
  private llm: LLMAdapter;
  private fileTreeOptions: FileTreeOptions;

  constructor(options: { llm: LLMAdapter; fileTreeOptions?: FileTreeOptions }) {
    this.llm = options.llm;
    this.fileTreeOptions = options.fileTreeOptions ?? {};
  }

  /**
   * Generate a diagram for a project
   */
  async generate(
    projectPath: string,
    options?: {
      instructions?: string;
      onProgress?: (stage: GenerationStage, message: string) => void;
    }
  ): Promise<GenerationResult> {
    return generateDiagram(projectPath, {
      llm: this.llm,
      fileTreeOptions: this.fileTreeOptions,
      instructions: options?.instructions,
      onProgress: options?.onProgress,
    });
  }

  /**
   * Modify an existing diagram
   */
  async modify(
    diagram: string,
    explanation: string,
    instructions: string
  ): Promise<ModifyResult> {
    return modifyDiagram(diagram, explanation, instructions, this.llm);
  }
}
