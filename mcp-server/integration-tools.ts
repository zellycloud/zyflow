/**
 * Integration Hub MCP Tools
 * 프로젝트별 서비스 계정, 환경 설정, 테스트 계정 조회 도구
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js'

// Integration Hub 서버 API 기본 URL
const API_BASE = 'http://localhost:3001/api/integrations'

// =============================================
// Tool Definitions
// =============================================

export const integrationToolDefinitions: Tool[] = [
  {
    name: 'integration_context',
    description:
      '현재 프로젝트의 Integration 컨텍스트를 조회합니다. 연결된 GitHub/Supabase/Vercel/Sentry 계정 정보, 환경 목록, 테스트 계정 목록을 반환합니다. 민감한 정보(토큰, 비밀번호)는 포함되지 않습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: {
          type: 'string',
          description: '프로젝트 ID (경로 또는 식별자)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'integration_list_accounts',
    description:
      '등록된 서비스 계정 목록을 조회합니다. 타입별로 필터링할 수 있습니다. 민감한 정보는 마스킹되어 반환됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['github', 'supabase', 'vercel', 'sentry', 'custom'],
          description: '서비스 타입 (선택사항, 미지정 시 모든 타입 반환)',
        },
      },
      required: [],
    },
  },
  {
    name: 'integration_get_env',
    description:
      '프로젝트의 환경 설정 및 환경 변수를 조회합니다. 활성 환경 또는 지정한 환경의 변수를 반환합니다. DB URL 등 민감 정보 포함.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: {
          type: 'string',
          description: '프로젝트 ID',
        },
        envId: {
          type: 'string',
          description: '환경 ID (선택사항, 미지정 시 활성 환경 반환)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'integration_apply_git',
    description:
      '프로젝트에 연결된 GitHub 계정의 git config를 현재 디렉토리에 적용합니다. user.name, user.email을 설정합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: {
          type: 'string',
          description: '프로젝트 ID',
        },
        scope: {
          type: 'string',
          enum: ['local', 'global'],
          description: 'git config 범위 (기본: local)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'integration_get_test_account',
    description:
      '프로젝트의 테스트 계정 정보를 조회합니다. 역할별로 필터링할 수 있습니다. 비밀번호는 원본으로 반환됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: {
          type: 'string',
          description: '프로젝트 ID',
        },
        role: {
          type: 'string',
          description: '역할 필터 (선택사항, 예: admin, user)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'integration_scan_env',
    description:
      '프로젝트의 .env 파일을 스캔하여 감지된 서비스 목록을 반환합니다. GitHub, Supabase, Stripe, OpenAI 등 30+ 서비스를 자동으로 인식합니다. 민감한 정보는 마스킹되어 반환됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (절대 경로)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'integration_import_env',
    description:
      '프로젝트의 .env 파일에서 감지된 서비스를 Integration Hub에 등록합니다. 먼저 integration_scan_env로 스캔한 후 사용하세요.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: {
          type: 'string',
          description: '프로젝트 경로 (절대 경로)',
        },
        services: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: '서비스 타입 (예: github, supabase, openai)',
              },
              name: {
                type: 'string',
                description: '계정 이름 (표시용)',
              },
            },
            required: ['type', 'name'],
          },
          description: '임포트할 서비스 목록',
        },
      },
      required: ['projectPath', 'services'],
    },
  },
]

// =============================================
// Tool Handlers
// =============================================

interface IntegrationContextArgs {
  projectId: string
}

interface ListAccountsArgs {
  type?: 'github' | 'supabase' | 'vercel' | 'sentry' | 'custom'
}

interface GetEnvArgs {
  projectId: string
  envId?: string
}

interface ApplyGitArgs {
  projectId: string
  scope?: 'local' | 'global'
}

interface GetTestAccountArgs {
  projectId: string
  role?: string
}

interface ScanEnvArgs {
  projectPath: string
}

interface ImportEnvArgs {
  projectPath: string
  services: Array<{
    type: string
    name: string
  }>
}

// API 응답 타입
interface ApiErrorResponse {
  message?: string
}

interface ContextResponse {
  context: {
    github?: { username: string; email?: string }
    supabase?: unknown
    vercel?: unknown
    sentry?: unknown
  }
}

interface AccountsResponse {
  accounts: Array<{
    id: string
    type: string
    name: string
    credentials: Record<string, string>
  }>
}

interface EnvironmentsResponse {
  environments: Array<{
    id: string
    name: string
    description?: string
    serverUrl?: string
    isActive: boolean
  }>
}

interface VariablesResponse {
  variables: Record<string, string>
}

interface TestAccountsResponse {
  accounts: Array<{
    id: string
    role: string
    email: string
    description?: string
  }>
}

interface PasswordResponse {
  password: string
}

interface ScanEnvResponse {
  files: string[]
  services: Array<{
    type: string
    displayName: string
    credentials: Record<string, string>
    isComplete: boolean
    missingRequired: string[]
    sources: string[]
    existingAccount?: {
      id: string
      name: string
    }
  }>
  unmatchedCount: number
}

interface ImportEnvResponse {
  created: number
  updated: number
  skipped: number
  errors: Array<{
    type: string
    error: string
  }>
  accounts: Array<{
    id: string
    type: string
    name: string
  }>
}

export async function handleIntegrationContext(args: IntegrationContextArgs) {
  try {
    const res = await fetch(`${API_BASE}/projects/${args.projectId}/context`)
    if (!res.ok) {
      const error = (await res.json()) as ApiErrorResponse
      return {
        success: false,
        error: error.message || 'Failed to fetch project context',
      }
    }
    const data = (await res.json()) as ContextResponse
    return {
      success: true,
      context: data.context,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Integration Hub',
    }
  }
}

export async function handleListAccounts(args: ListAccountsArgs) {
  try {
    const url = args.type ? `${API_BASE}/accounts?type=${args.type}` : `${API_BASE}/accounts`
    const res = await fetch(url)
    if (!res.ok) {
      const error = (await res.json()) as ApiErrorResponse
      return {
        success: false,
        error: error.message || 'Failed to fetch accounts',
      }
    }
    const data = (await res.json()) as AccountsResponse
    return {
      success: true,
      accounts: data.accounts,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Integration Hub',
    }
  }
}

export async function handleGetEnv(args: GetEnvArgs) {
  try {
    // 환경 목록 조회
    const listRes = await fetch(`${API_BASE}/projects/${args.projectId}/environments`)
    if (!listRes.ok) {
      const error = (await listRes.json()) as ApiErrorResponse
      return {
        success: false,
        error: error.message || 'Failed to fetch environments',
      }
    }
    const listData = (await listRes.json()) as EnvironmentsResponse
    const environments = listData.environments

    if (!environments || environments.length === 0) {
      return {
        success: false,
        error: 'No environments configured for this project',
      }
    }

    // 환경 ID가 지정되지 않은 경우 활성 환경 사용
    let targetEnv = args.envId
      ? environments.find((e) => e.id === args.envId)
      : environments.find((e) => e.isActive)

    if (!targetEnv) {
      targetEnv = environments[0]
    }

    // 환경 변수 조회 (복호화된 원본)
    const varsRes = await fetch(
      `${API_BASE}/projects/${args.projectId}/environments/${targetEnv.id}/variables`
    )
    if (!varsRes.ok) {
      return {
        success: true,
        environment: targetEnv,
        variables: {},
        note: 'Failed to decrypt environment variables',
      }
    }
    const varsData = (await varsRes.json()) as VariablesResponse

    return {
      success: true,
      environment: {
        id: targetEnv.id,
        name: targetEnv.name,
        description: targetEnv.description,
        serverUrl: targetEnv.serverUrl,
        isActive: targetEnv.isActive,
      },
      variables: varsData.variables,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Integration Hub',
    }
  }
}

export async function handleApplyGit(args: ApplyGitArgs, projectPath: string) {
  try {
    // 프로젝트 컨텍스트에서 GitHub 정보 가져오기
    const res = await fetch(`${API_BASE}/projects/${args.projectId}/context`)
    if (!res.ok) {
      const error = (await res.json()) as ApiErrorResponse
      return {
        success: false,
        error: error.message || 'Failed to fetch project context',
      }
    }
    const data = (await res.json()) as ContextResponse
    const github = data.context?.github

    if (!github || !github.username) {
      return {
        success: false,
        error: 'No GitHub account connected to this project',
      }
    }

    const { execSync } = await import('child_process')
    const scope = args.scope === 'global' ? '--global' : '--local'

    // Git config 설정
    execSync(`git config ${scope} user.name "${github.username}"`, {
      cwd: projectPath,
      encoding: 'utf-8',
    })

    if (github.email) {
      execSync(`git config ${scope} user.email "${github.email}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
      })
    }

    return {
      success: true,
      applied: {
        'user.name': github.username,
        'user.email': github.email || '(not set)',
      },
      scope: args.scope || 'local',
      message: `Git config applied: user.name="${github.username}"${github.email ? `, user.email="${github.email}"` : ''}`,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply git config',
    }
  }
}

export async function handleGetTestAccount(args: GetTestAccountArgs) {
  try {
    const res = await fetch(`${API_BASE}/projects/${args.projectId}/test-accounts`)
    if (!res.ok) {
      const error = (await res.json()) as ApiErrorResponse
      return {
        success: false,
        error: error.message || 'Failed to fetch test accounts',
      }
    }
    const data = (await res.json()) as TestAccountsResponse
    let accounts = data.accounts

    // 역할 필터링
    if (args.role) {
      accounts = accounts.filter((a) =>
        a.role.toLowerCase().includes(args.role!.toLowerCase())
      )
    }

    if (accounts.length === 0) {
      return {
        success: false,
        error: args.role
          ? `No test accounts found with role: ${args.role}`
          : 'No test accounts configured for this project',
      }
    }

    // 각 계정의 비밀번호 조회 (복호화된 원본)
    const accountsWithPasswords = await Promise.all(
      accounts.map(async (account) => {
        const passRes = await fetch(
          `${API_BASE}/projects/${args.projectId}/test-accounts/${account.id}/password`
        )
        let password = '(failed to decrypt)'
        if (passRes.ok) {
          const passData = (await passRes.json()) as PasswordResponse
          password = passData.password
        }
        return {
          role: account.role,
          email: account.email,
          password,
          description: account.description,
        }
      })
    )

    return {
      success: true,
      accounts: accountsWithPasswords,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Integration Hub',
    }
  }
}

export async function handleScanEnv(args: ScanEnvArgs) {
  try {
    const url = `${API_BASE}/env/scan?projectPath=${encodeURIComponent(args.projectPath)}`
    const res = await fetch(url)
    if (!res.ok) {
      const error = (await res.json()) as ApiErrorResponse
      return {
        success: false,
        error: error.message || 'Failed to scan env files',
      }
    }
    const data = (await res.json()) as ScanEnvResponse

    if (data.services.length === 0) {
      return {
        success: true,
        files: data.files,
        services: [],
        message: data.files.length === 0
          ? 'No .env files found in the project'
          : 'No known services detected in .env files',
      }
    }

    return {
      success: true,
      files: data.files,
      services: data.services.map((s) => ({
        type: s.type,
        displayName: s.displayName,
        credentials: s.credentials,
        isComplete: s.isComplete,
        missingRequired: s.missingRequired,
        sources: s.sources,
        existingAccount: s.existingAccount,
      })),
      unmatchedCount: data.unmatchedCount,
      message: `Found ${data.services.length} service(s) in ${data.files.length} file(s)`,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Integration Hub',
    }
  }
}

export async function handleImportEnv(args: ImportEnvArgs) {
  try {
    const res = await fetch(`${API_BASE}/env/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectPath: args.projectPath,
        services: args.services,
      }),
    })

    if (!res.ok) {
      const error = (await res.json()) as ApiErrorResponse
      return {
        success: false,
        error: error.message || 'Failed to import services',
      }
    }

    const data = (await res.json()) as ImportEnvResponse

    return {
      success: true,
      created: data.created,
      updated: data.updated,
      skipped: data.skipped,
      errors: data.errors,
      accounts: data.accounts,
      message: `Imported ${data.created} service(s), ${data.updated} updated, ${data.skipped} skipped`,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Integration Hub',
    }
  }
}
