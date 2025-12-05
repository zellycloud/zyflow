/**
 * Settings Resolver
 * 로컬 → 전역 fallback 로직으로 설정을 통합 조회
 */

import type {
  LocalSettings,
  LocalIntegrationMapping,
  EnvironmentVariables,
  SettingsSource,
  WithSource,
  LocalTestAccount,
} from './types.js';
import type {
  ProjectContext,
  ServiceType,
} from '../db/schema.js';
import {
  hasLocalSettings,
  loadLocalSettings,
  loadLocalEnvironment,
  loadLocalTestAccounts,
  listLocalEnvironments,
  decryptTestAccountPassword,
} from './file-utils.js';
import {
  getProjectIntegration,
  listEnvironments,
  listTestAccounts,
  getEnvironmentVariables,
  getTestAccountPassword,
} from '../services/projects.js';
import { getServiceAccount } from '../services/accounts.js';

// =============================================
// 타입 정의
// =============================================

/**
 * 해석된 프로젝트 컨텍스트 (소스 정보 포함)
 */
export interface ResolvedProjectContext extends ProjectContext {
  source: SettingsSource;
  sources?: {
    integrations: SettingsSource;
    environments: SettingsSource;
    testAccounts: SettingsSource;
  };
}

/**
 * 해석된 환경 변수
 */
export interface ResolvedEnvironment {
  name: string;
  variables: EnvironmentVariables;
  source: SettingsSource;
  isActive: boolean;
}

/**
 * 해석된 테스트 계정
 */
export interface ResolvedTestAccount {
  id: string;
  role: string;
  email: string;
  password: string;
  description?: string;
  source: SettingsSource;
}

// =============================================
// Settings Resolver 클래스
// =============================================

export class SettingsResolver {
  private projectPath: string;
  private projectId: string;

  constructor(projectPath: string, projectId?: string) {
    this.projectPath = projectPath;
    // projectId가 없으면 projectPath를 ID로 사용 (기존 동작 호환)
    this.projectId = projectId || projectPath;
  }

  // =============================================
  // 통합 컨텍스트 조회
  // =============================================

  /**
   * 프로젝트 컨텍스트 조회 (로컬 우선, 전역 fallback)
   */
  async getContext(): Promise<ResolvedProjectContext> {
    // 1. 로컬 설정 확인
    const localSettings = await loadLocalSettings(this.projectPath);

    if (localSettings) {
      // 로컬 설정이 있으면 로컬 기반으로 컨텍스트 구성
      return this.resolveLocalContext(localSettings);
    }

    // 2. 전역 DB에서 조회 (fallback)
    return this.resolveGlobalContext();
  }

  /**
   * 로컬 설정 기반 컨텍스트 구성
   */
  private async resolveLocalContext(localSettings: LocalSettings): Promise<ResolvedProjectContext> {
    const context: ResolvedProjectContext = {
      projectId: this.projectId,
      environments: [],
      testAccounts: [],
      source: 'local',
      sources: {
        integrations: 'local',
        environments: 'local',
        testAccounts: 'local',
      },
    };

    // 계정 정보 해석 (로컬 settings.json의 UUID를 전역 DB에서 조회)
    const integrations = localSettings.integrations;
    await this.resolveAccountInfo(context, integrations);

    // 환경 목록 (로컬 파일 기반)
    const localEnvs = await listLocalEnvironments(this.projectPath);
    if (localEnvs.length > 0) {
      context.environments = localEnvs;
      context.currentEnvironment = localSettings.defaultEnvironment || localEnvs[0];
    } else {
      // 로컬 환경 파일이 없으면 전역에서 조회
      const globalEnvs = await listEnvironments(this.projectId);
      if (globalEnvs.length > 0) {
        context.environments = globalEnvs.map((e) => e.name);
        context.currentEnvironment = globalEnvs.find((e) => e.isActive)?.name;
        context.sources!.environments = 'global';
      }
    }

    // 테스트 계정 (로컬 파일 기반)
    const localAccounts = await loadLocalTestAccounts(this.projectPath);
    if (localAccounts && localAccounts.length > 0) {
      context.testAccounts = localAccounts.map((a) => ({
        role: a.role,
        email: a.email,
      }));
    } else {
      // 로컬 테스트 계정이 없으면 전역에서 조회
      const globalAccounts = await listTestAccounts(this.projectId);
      if (globalAccounts.length > 0) {
        context.testAccounts = globalAccounts.map((a) => ({
          role: a.role,
          email: a.email,
        }));
        context.sources!.testAccounts = 'global';
      }
    }

    return context;
  }

  /**
   * 전역 DB 기반 컨텍스트 구성
   */
  private async resolveGlobalContext(): Promise<ResolvedProjectContext> {
    const integration = await getProjectIntegration(this.projectId);
    const envList = await listEnvironments(this.projectId);
    const testAccountList = await listTestAccounts(this.projectId);

    const context: ResolvedProjectContext = {
      projectId: this.projectId,
      environments: envList.map((e) => e.name),
      currentEnvironment: envList.find((e) => e.isActive)?.name,
      testAccounts: testAccountList.map((a) => ({ role: a.role, email: a.email })),
      source: 'global',
    };

    if (integration?.integrations) {
      await this.resolveAccountInfo(context, integration.integrations);
    }

    return context;
  }

  /**
   * 계정 UUID를 실제 계정 정보로 해석
   */
  private async resolveAccountInfo(
    context: ResolvedProjectContext,
    integrations: LocalIntegrationMapping
  ): Promise<void> {
    // GitHub
    if (integrations.github) {
      const account = await getServiceAccount(integrations.github);
      if (account) {
        context.github = {
          username: account.credentials.username as string,
          email: account.credentials.email as string | undefined,
        };
      }
    }

    // Supabase
    if (integrations.supabase) {
      const account = await getServiceAccount(integrations.supabase);
      if (account) {
        context.supabase = {
          projectUrl: account.credentials.projectUrl as string,
        };
      }
    }

    // Vercel
    if (integrations.vercel) {
      const account = await getServiceAccount(integrations.vercel);
      if (account) {
        context.vercel = {
          teamId: account.credentials.teamId as string | undefined,
        };
      }
    }

    // Sentry
    if (integrations.sentry) {
      const account = await getServiceAccount(integrations.sentry);
      if (account) {
        context.sentry = {
          orgSlug: account.credentials.orgSlug as string,
          projectSlug: account.credentials.projectSlug as string,
        };
      }
    }
  }

  // =============================================
  // 환경 변수 조회
  // =============================================

  /**
   * 환경 변수 조회 (로컬 우선, 전역 fallback)
   */
  async getEnvironment(envName?: string): Promise<ResolvedEnvironment | null> {
    // 로컬 설정 확인
    const localSettings = await loadLocalSettings(this.projectPath);
    const targetEnvName = envName || localSettings?.defaultEnvironment || 'local';

    // 1. 로컬 환경 파일 확인
    const localVars = await loadLocalEnvironment(this.projectPath, targetEnvName);
    if (localVars) {
      return {
        name: targetEnvName,
        variables: localVars,
        source: 'local',
        isActive: targetEnvName === localSettings?.defaultEnvironment,
      };
    }

    // 2. 전역 DB에서 조회 (fallback)
    const globalEnvs = await listEnvironments(this.projectId);
    const targetEnv = envName
      ? globalEnvs.find((e) => e.name === envName)
      : globalEnvs.find((e) => e.isActive) || globalEnvs[0];

    if (!targetEnv) {
      return null;
    }

    const variables = await getEnvironmentVariables(targetEnv.id);
    if (!variables) {
      return null;
    }

    return {
      name: targetEnv.name,
      variables,
      source: 'global',
      isActive: targetEnv.isActive,
    };
  }

  /**
   * 모든 환경 목록 조회 (로컬 우선, 전역 병합)
   */
  async listEnvironments(): Promise<Array<{ name: string; source: SettingsSource; isActive: boolean }>> {
    const result: Array<{ name: string; source: SettingsSource; isActive: boolean }> = [];
    const localSettings = await loadLocalSettings(this.projectPath);
    const seenNames = new Set<string>();

    // 1. 로컬 환경 파일
    const localEnvs = await listLocalEnvironments(this.projectPath);
    for (const envName of localEnvs) {
      result.push({
        name: envName,
        source: 'local',
        isActive: envName === localSettings?.defaultEnvironment,
      });
      seenNames.add(envName);
    }

    // 2. 전역 환경 (로컬에 없는 것만)
    const globalEnvs = await listEnvironments(this.projectId);
    for (const env of globalEnvs) {
      if (!seenNames.has(env.name)) {
        result.push({
          name: env.name,
          source: 'global',
          isActive: env.isActive,
        });
      }
    }

    return result;
  }

  // =============================================
  // 테스트 계정 조회
  // =============================================

  /**
   * 테스트 계정 목록 조회 (로컬 우선, 전역 fallback)
   */
  async getTestAccounts(role?: string): Promise<ResolvedTestAccount[]> {
    const result: ResolvedTestAccount[] = [];

    // 1. 로컬 테스트 계정
    const localAccounts = await loadLocalTestAccounts(this.projectPath);
    if (localAccounts && localAccounts.length > 0) {
      for (const account of localAccounts) {
        if (!role || account.role.toLowerCase().includes(role.toLowerCase())) {
          const password = await decryptTestAccountPassword(account.password);
          result.push({
            id: account.id,
            role: account.role,
            email: account.email,
            password,
            description: account.description,
            source: 'local',
          });
        }
      }

      if (result.length > 0) {
        return result;
      }
    }

    // 2. 전역 DB에서 조회 (fallback)
    const globalAccounts = await listTestAccounts(this.projectId);
    let filteredAccounts = globalAccounts;
    if (role) {
      filteredAccounts = globalAccounts.filter((a) =>
        a.role.toLowerCase().includes(role.toLowerCase())
      );
    }

    for (const account of filteredAccounts) {
      const password = await getTestAccountPassword(account.id);
      result.push({
        id: account.id,
        role: account.role,
        email: account.email,
        password: password || '(failed to decrypt)',
        description: account.description ?? undefined,
        source: 'global',
      });
    }

    return result;
  }

  // =============================================
  // 설정 소스 확인
  // =============================================

  /**
   * 로컬 설정 사용 여부 확인
   */
  async hasLocalSettings(): Promise<boolean> {
    return hasLocalSettings(this.projectPath);
  }

  /**
   * 설정 소스 요약
   */
  async getSettingsSources(): Promise<{
    hasLocal: boolean;
    hasGlobal: boolean;
    primary: SettingsSource;
  }> {
    const hasLocal = await this.hasLocalSettings();
    const hasGlobal = !!(await getProjectIntegration(this.projectId));

    return {
      hasLocal,
      hasGlobal,
      primary: hasLocal ? 'local' : 'global',
    };
  }
}

// =============================================
// 편의 함수
// =============================================

/**
 * 프로젝트 컨텍스트 조회 (단축 함수)
 */
export async function resolveProjectContext(
  projectPath: string,
  projectId?: string
): Promise<ResolvedProjectContext> {
  const resolver = new SettingsResolver(projectPath, projectId);
  return resolver.getContext();
}

/**
 * 환경 변수 조회 (단축 함수)
 */
export async function resolveEnvironment(
  projectPath: string,
  envName?: string,
  projectId?: string
): Promise<ResolvedEnvironment | null> {
  const resolver = new SettingsResolver(projectPath, projectId);
  return resolver.getEnvironment(envName);
}

/**
 * 테스트 계정 조회 (단축 함수)
 */
export async function resolveTestAccounts(
  projectPath: string,
  role?: string,
  projectId?: string
): Promise<ResolvedTestAccount[]> {
  const resolver = new SettingsResolver(projectPath, projectId);
  return resolver.getTestAccounts(role);
}
