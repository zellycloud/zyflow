/**
 * GitDiagram MCP Tools
 *
 * MCP tool definitions and handlers for diagram generation
 */

import { join } from 'path'
import { readFile } from 'fs/promises'
import {
  generateFileTree,
  readReadme,
  validateMermaidSyntax,
  extractClickEvents,
  pathsToGitHubUrls,
  SYSTEM_FIRST_PROMPT,
  SYSTEM_SECOND_PROMPT,
  SYSTEM_THIRD_PROMPT,
  createFirstPromptUserMessage,
  createSecondPromptUserMessage,
  createThirdPromptUserMessage,
} from '../packages/gitdiagram-core/src/index.js'

// Types
interface DiagramGenerateArgs {
  projectPath: string
  instructions?: string
  maxDepth?: number
  excludePatterns?: string[]
  repoUrl?: string
  branch?: string
}

interface DiagramFromChangeArgs {
  changeId: string
  projectPath?: string
  includeAffectedFiles?: boolean
}

interface DiagramValidateArgs {
  mermaidCode: string
}

interface DiagramResult {
  success: boolean
  mermaidCode?: string
  explanation?: string
  componentMapping?: Record<string, string>
  fileTree?: string
  validation?: {
    valid: boolean
    errors: string[]
    warnings: string[]
  }
  error?: string
}

// Tool definitions for MCP
export const diagramToolDefinitions = [
  {
    name: 'diagram_generate',
    description:
      '프로젝트의 아키텍처 다이어그램을 생성합니다. 저장소 경로를 입력받아 Mermaid.js 코드를 반환합니다. AI가 3단계로 분석하여 정확한 시스템 설계 다이어그램을 생성합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: {
          type: 'string',
          description: '분석할 프로젝트의 절대 경로',
        },
        instructions: {
          type: 'string',
          description: '다이어그램 생성에 대한 추가 지시사항 (선택)',
        },
        maxDepth: {
          type: 'number',
          description: '파일 트리 탐색 최대 깊이 (기본: 10)',
        },
        excludePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: '제외할 패턴 목록 (예: ["*.test.ts", "fixtures"])',
        },
        repoUrl: {
          type: 'string',
          description: 'GitHub 저장소 URL (클릭 이벤트 URL 변환용)',
        },
        branch: {
          type: 'string',
          description: 'Git 브랜치 (기본: main)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'diagram_from_change',
    description:
      'OpenSpec 변경 제안의 영향도를 다이어그램으로 시각화합니다. 변경되는 컴포넌트와 영향받는 파일을 하이라이트합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        changeId: {
          type: 'string',
          description: 'OpenSpec 변경 제안 ID',
        },
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (선택, 기본값: 현재 디렉토리)',
        },
        includeAffectedFiles: {
          type: 'boolean',
          description: '영향받는 파일 목록 포함 여부 (기본: true)',
        },
      },
      required: ['changeId'],
    },
  },
  {
    name: 'diagram_validate',
    description:
      'Mermaid.js 다이어그램 코드의 문법을 검증합니다. 에러와 경고를 반환합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mermaidCode: {
          type: 'string',
          description: '검증할 Mermaid.js 코드',
        },
      },
      required: ['mermaidCode'],
    },
  },
]

/**
 * Generate diagram prompts for external LLM call
 * (실제 LLM 호출은 Claude Code나 다른 AI가 수행)
 */
export async function handleDiagramGenerate(
  args: DiagramGenerateArgs,
  projectPath: string
): Promise<DiagramResult> {
  try {
    const targetPath = args.projectPath || projectPath

    // Generate file tree
    const fileTree = await generateFileTree(targetPath, {
      maxDepth: args.maxDepth ?? 10,
      excludePatterns: args.excludePatterns,
    })

    // Read README
    const readme = await readReadme(targetPath)

    // Create prompts for LLM
    const prompts = {
      stage1: {
        system: SYSTEM_FIRST_PROMPT,
        user: createFirstPromptUserMessage(
          fileTree,
          readme ?? 'No README found.'
        ),
      },
      stage2: {
        system: SYSTEM_SECOND_PROMPT,
        userTemplate:
          'After getting explanation from stage1, use: createSecondPromptUserMessage(explanation, fileTree)',
      },
      stage3: {
        system: SYSTEM_THIRD_PROMPT,
        userTemplate:
          'After getting mapping from stage2, use: createThirdPromptUserMessage(explanation, componentMapping)',
      },
    }

    return {
      success: true,
      fileTree,
      explanation: `
프로젝트 분석을 위한 프롬프트가 준비되었습니다.

다음 3단계로 다이어그램을 생성하세요:

**1단계: 아키텍처 분석**
System: ${SYSTEM_FIRST_PROMPT.slice(0, 200)}...
User: <file_tree>...</file_tree> <readme>...</readme>

**2단계: 컴포넌트 매핑**
1단계의 explanation을 받아 파일/디렉토리에 매핑합니다.

**3단계: Mermaid 생성**
1,2단계 결과를 받아 Mermaid.js 코드를 생성합니다.

파일 트리 (${fileTree.split('\n').length}줄):
${fileTree.slice(0, 1000)}...
`,
      componentMapping: {},
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Generate diagram showing OpenSpec change impact
 */
export async function handleDiagramFromChange(
  args: DiagramFromChangeArgs,
  projectPath: string
): Promise<DiagramResult> {
  try {
    const basePath = args.projectPath || projectPath
    const changeDir = join(basePath, 'openspec', 'changes', args.changeId)

    // Read proposal
    let proposal = ''
    try {
      proposal = await readFile(join(changeDir, 'proposal.md'), 'utf-8')
    } catch {
      // No proposal
    }

    // Read spec
    let spec = ''
    try {
      spec = await readFile(join(changeDir, 'spec.md'), 'utf-8')
    } catch {
      // No spec
    }

    // Read tasks
    let tasks = ''
    try {
      tasks = await readFile(join(changeDir, 'tasks.md'), 'utf-8')
    } catch {
      // No tasks
    }

    // Extract affected files from spec and tasks
    const affectedFiles: string[] = []
    const filePattern = /`([^`]+\.(ts|tsx|js|jsx|py|go|rs|java|md))`/g

    for (const content of [proposal, spec, tasks]) {
      let match
      while ((match = filePattern.exec(content)) !== null) {
        if (!affectedFiles.includes(match[1])) {
          affectedFiles.push(match[1])
        }
      }
    }

    // Generate file tree for context
    const fileTree = await generateFileTree(basePath, { maxDepth: 5 })

    return {
      success: true,
      fileTree,
      explanation: `
OpenSpec 변경 제안 분석: ${args.changeId}

**영향받는 파일** (${affectedFiles.length}개):
${affectedFiles.map((f) => `- ${f}`).join('\n')}

**Proposal 요약**:
${proposal.slice(0, 500)}...

**Tasks 개요**:
${tasks.slice(0, 500)}...

이 정보를 바탕으로 변경 영향도 다이어그램을 생성하세요.
변경되는 컴포넌트는 빨간색/주황색으로, 영향받는 컴포넌트는 노란색으로 표시하세요.
`,
      componentMapping: affectedFiles.reduce(
        (acc, file) => {
          const name = file.split('/').pop()?.replace(/\.[^.]+$/, '') || file
          acc[name] = file
          return acc
        },
        {} as Record<string, string>
      ),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Validate Mermaid diagram syntax
 */
export function handleDiagramValidate(
  args: DiagramValidateArgs
): DiagramResult {
  try {
    const validation = validateMermaidSyntax(args.mermaidCode)
    const clickEvents = extractClickEvents(args.mermaidCode)

    return {
      success: true,
      mermaidCode: args.mermaidCode,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
      explanation: `
검증 결과: ${validation.valid ? '통과' : '실패'}

에러 (${validation.errors.length}):
${validation.errors.map((e) => `- ${e}`).join('\n') || '없음'}

경고 (${validation.warnings.length}):
${validation.warnings.map((w) => `- ${w}`).join('\n') || '없음'}

클릭 이벤트 (${clickEvents.length}):
${clickEvents.map((c) => `- ${c.nodeId}: ${c.path}`).join('\n') || '없음'}
`,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Convert diagram paths to GitHub URLs
 */
export function convertToGitHubUrls(
  mermaidCode: string,
  repoUrl: string,
  branch: string = 'main'
): string {
  return pathsToGitHubUrls(mermaidCode, repoUrl, branch)
}
