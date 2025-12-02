import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getIntegrationsDb } from '../db/client.js';
import {
  projectIntegrations,
  environments,
  testAccounts,
  type ProjectIntegration,
  type Environment,
  type TestAccount,
  type ServiceType,
  type ProjectContext,
} from '../db/schema.js';
import { encryptObject, decryptObject, maskSensitive } from '../crypto.js';
import { getMasterKey } from '../keychain.js';
import { getServiceAccountCredentials, getServiceAccount } from './accounts.js';

// =============================================
// 프로젝트 연동 (Project Integration) 관리
// =============================================

interface IntegrationMapping {
  [key: string]: string | undefined;
  github?: string;
  supabase?: string;
  vercel?: string;
  sentry?: string;
}

/**
 * 프로젝트 연동 조회
 */
export async function getProjectIntegration(projectId: string): Promise<{
  id: string;
  projectId: string;
  integrations: IntegrationMapping;
  defaultEnvironment: string | null;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const db = getIntegrationsDb();

  const results = await db
    .select()
    .from(projectIntegrations)
    .where(eq(projectIntegrations.projectId, projectId));

  if (results.length === 0) {
    return null;
  }

  const row = results[0];
  return {
    id: row.id,
    projectId: row.projectId,
    integrations: JSON.parse(row.integrations) as IntegrationMapping,
    defaultEnvironment: row.defaultEnvironment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 프로젝트 연동 생성 또는 업데이트
 */
export async function upsertProjectIntegration(
  projectId: string,
  integrations: IntegrationMapping,
  defaultEnvironment?: string
): Promise<ProjectIntegration> {
  const db = getIntegrationsDb();
  const now = new Date();

  // 기존 연동 확인
  const existing = await db
    .select()
    .from(projectIntegrations)
    .where(eq(projectIntegrations.projectId, projectId));

  if (existing.length > 0) {
    // 업데이트
    const currentIntegrations = JSON.parse(existing[0].integrations) as IntegrationMapping;
    const mergedIntegrations = { ...currentIntegrations, ...integrations };

    await db
      .update(projectIntegrations)
      .set({
        integrations: JSON.stringify(mergedIntegrations),
        defaultEnvironment: defaultEnvironment ?? existing[0].defaultEnvironment,
        updatedAt: now,
      })
      .where(eq(projectIntegrations.projectId, projectId));

    const updated = await db
      .select()
      .from(projectIntegrations)
      .where(eq(projectIntegrations.projectId, projectId));
    return updated[0];
  }

  // 새로 생성
  const newIntegration: typeof projectIntegrations.$inferInsert = {
    id: nanoid(),
    projectId,
    integrations: JSON.stringify(integrations),
    defaultEnvironment: defaultEnvironment ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(projectIntegrations).values(newIntegration);

  const created = await db
    .select()
    .from(projectIntegrations)
    .where(eq(projectIntegrations.projectId, projectId));
  return created[0];
}

/**
 * 프로젝트 서비스 연결/연결 해제
 */
export async function setProjectService(
  projectId: string,
  serviceType: ServiceType,
  accountId: string | null
): Promise<ProjectIntegration> {
  const integration = await getProjectIntegration(projectId);
  const integrations: IntegrationMapping = integration?.integrations ?? {};

  if (accountId === null) {
    delete integrations[serviceType];
  } else {
    integrations[serviceType] = accountId;
  }

  return upsertProjectIntegration(projectId, integrations);
}

// =============================================
// 환경 설정 (Environment) 관리
// =============================================

interface EnvironmentVariables {
  [key: string]: string;
}

interface MaskedEnvironment {
  id: string;
  projectId: string;
  name: string;
  variables: Record<string, string>; // 마스킹됨
  serverUrl: string | null;
  databaseUrl: string | null; // 마스킹됨
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 프로젝트 환경 목록 조회
 */
export async function listEnvironments(projectId: string): Promise<MaskedEnvironment[]> {
  const db = getIntegrationsDb();
  const masterKey = await getMasterKey();

  const results = await db
    .select()
    .from(environments)
    .where(eq(environments.projectId, projectId));

  const masked: MaskedEnvironment[] = [];
  for (const env of results) {
    const decryptedVars = await decryptObject<EnvironmentVariables>(env.variables, masterKey);
    const maskedVars: Record<string, string> = {};

    for (const [key, value] of Object.entries(decryptedVars)) {
      const sensitiveKeys = ['key', 'secret', 'password', 'token', 'api'];
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        maskedVars[key] = maskSensitive(value);
      } else {
        maskedVars[key] = value;
      }
    }

    let maskedDbUrl: string | null = null;
    if (env.databaseUrl) {
      const decryptedDbUrl = await decryptObject<string>(env.databaseUrl, masterKey);
      maskedDbUrl = maskSensitive(decryptedDbUrl, 10);
    }

    masked.push({
      id: env.id,
      projectId: env.projectId,
      name: env.name,
      variables: maskedVars,
      serverUrl: env.serverUrl,
      databaseUrl: maskedDbUrl,
      description: env.description,
      isActive: env.isActive,
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
    });
  }

  return masked;
}

/**
 * 환경 생성
 */
export async function createEnvironment(
  projectId: string,
  name: string,
  variables: EnvironmentVariables,
  options?: {
    serverUrl?: string;
    databaseUrl?: string;
    description?: string;
    isActive?: boolean;
  }
): Promise<Environment> {
  const db = getIntegrationsDb();
  const masterKey = await getMasterKey();
  const now = new Date();

  const encryptedVars = await encryptObject(variables, masterKey);
  const encryptedDbUrl = options?.databaseUrl
    ? await encryptObject(options.databaseUrl, masterKey)
    : null;

  // 첫 환경이면 활성화
  const existing = await db
    .select()
    .from(environments)
    .where(eq(environments.projectId, projectId));

  const env: typeof environments.$inferInsert = {
    id: nanoid(),
    projectId,
    name,
    variables: encryptedVars,
    serverUrl: options?.serverUrl ?? null,
    databaseUrl: encryptedDbUrl,
    description: options?.description ?? null,
    isActive: options?.isActive ?? existing.length === 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(environments).values(env);

  const created = await db
    .select()
    .from(environments)
    .where(eq(environments.id, env.id));
  return created[0];
}

/**
 * 환경 업데이트
 */
export async function updateEnvironment(
  envId: string,
  updates: {
    name?: string;
    variables?: EnvironmentVariables;
    serverUrl?: string;
    databaseUrl?: string;
    description?: string;
  }
): Promise<Environment | null> {
  const db = getIntegrationsDb();
  const masterKey = await getMasterKey();

  const existing = await db.select().from(environments).where(eq(environments.id, envId));
  if (existing.length === 0) {
    return null;
  }

  const updateData: Partial<typeof environments.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.serverUrl !== undefined) updateData.serverUrl = updates.serverUrl;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.variables !== undefined) {
    updateData.variables = await encryptObject(updates.variables, masterKey);
  }
  if (updates.databaseUrl !== undefined) {
    updateData.databaseUrl = await encryptObject(updates.databaseUrl, masterKey);
  }

  await db.update(environments).set(updateData).where(eq(environments.id, envId));

  const updated = await db.select().from(environments).where(eq(environments.id, envId));
  return updated[0];
}

/**
 * 환경 삭제
 */
export async function deleteEnvironment(envId: string): Promise<boolean> {
  const db = getIntegrationsDb();
  await db.delete(environments).where(eq(environments.id, envId));
  const remaining = await db.select().from(environments).where(eq(environments.id, envId));
  return remaining.length === 0;
}

/**
 * 활성 환경 설정
 */
export async function setActiveEnvironment(projectId: string, envId: string): Promise<boolean> {
  const db = getIntegrationsDb();

  // 기존 활성 환경 비활성화
  await db
    .update(environments)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(environments.projectId, projectId));

  // 새 환경 활성화
  await db
    .update(environments)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(environments.id, envId));

  return true;
}

/**
 * 환경 변수 조회 (복호화된 원본)
 */
export async function getEnvironmentVariables(envId: string): Promise<EnvironmentVariables | null> {
  const db = getIntegrationsDb();
  const masterKey = await getMasterKey();

  const results = await db.select().from(environments).where(eq(environments.id, envId));
  if (results.length === 0) {
    return null;
  }

  return decryptObject<EnvironmentVariables>(results[0].variables, masterKey);
}

// =============================================
// 테스트 계정 (Test Account) 관리
// =============================================

interface MaskedTestAccount {
  id: string;
  projectId: string;
  role: string;
  email: string;
  password: string; // 마스킹됨
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 프로젝트 테스트 계정 목록 조회
 */
export async function listTestAccounts(projectId: string): Promise<MaskedTestAccount[]> {
  const db = getIntegrationsDb();
  const masterKey = await getMasterKey();

  const results = await db
    .select()
    .from(testAccounts)
    .where(eq(testAccounts.projectId, projectId));

  const masked: MaskedTestAccount[] = [];
  for (const account of results) {
    const decryptedPassword = await decryptObject<string>(account.password, masterKey);
    masked.push({
      id: account.id,
      projectId: account.projectId,
      role: account.role,
      email: account.email,
      password: maskSensitive(decryptedPassword),
      description: account.description,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    });
  }

  return masked;
}

/**
 * 테스트 계정 생성
 */
export async function createTestAccount(
  projectId: string,
  role: string,
  email: string,
  password: string,
  description?: string
): Promise<TestAccount> {
  const db = getIntegrationsDb();
  const masterKey = await getMasterKey();
  const now = new Date();

  const encryptedPassword = await encryptObject(password, masterKey);

  const account: typeof testAccounts.$inferInsert = {
    id: nanoid(),
    projectId,
    role,
    email,
    password: encryptedPassword,
    description: description ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(testAccounts).values(account);

  const created = await db.select().from(testAccounts).where(eq(testAccounts.id, account.id));
  return created[0];
}

/**
 * 테스트 계정 업데이트
 */
export async function updateTestAccount(
  accountId: string,
  updates: {
    role?: string;
    email?: string;
    password?: string;
    description?: string;
  }
): Promise<TestAccount | null> {
  const db = getIntegrationsDb();
  const masterKey = await getMasterKey();

  const existing = await db.select().from(testAccounts).where(eq(testAccounts.id, accountId));
  if (existing.length === 0) {
    return null;
  }

  const updateData: Partial<typeof testAccounts.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (updates.role !== undefined) updateData.role = updates.role;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.password !== undefined) {
    updateData.password = await encryptObject(updates.password, masterKey);
  }

  await db.update(testAccounts).set(updateData).where(eq(testAccounts.id, accountId));

  const updated = await db.select().from(testAccounts).where(eq(testAccounts.id, accountId));
  return updated[0];
}

/**
 * 테스트 계정 삭제
 */
export async function deleteTestAccount(accountId: string): Promise<boolean> {
  const db = getIntegrationsDb();
  await db.delete(testAccounts).where(eq(testAccounts.id, accountId));
  const remaining = await db.select().from(testAccounts).where(eq(testAccounts.id, accountId));
  return remaining.length === 0;
}

/**
 * 테스트 계정 비밀번호 조회 (복호화된 원본)
 */
export async function getTestAccountPassword(accountId: string): Promise<string | null> {
  const db = getIntegrationsDb();
  const masterKey = await getMasterKey();

  const results = await db.select().from(testAccounts).where(eq(testAccounts.id, accountId));
  if (results.length === 0) {
    return null;
  }

  return decryptObject<string>(results[0].password, masterKey);
}

// =============================================
// 프로젝트 컨텍스트 (AI용)
// =============================================

/**
 * AI용 프로젝트 컨텍스트 조회 (민감정보 제외)
 */
export async function getProjectContext(projectId: string): Promise<ProjectContext> {
  const integration = await getProjectIntegration(projectId);
  const envList = await listEnvironments(projectId);
  const testAccountList = await listTestAccounts(projectId);

  const context: ProjectContext = {
    projectId,
    environments: envList.map((e) => e.name),
    currentEnvironment: envList.find((e) => e.isActive)?.name,
    testAccounts: testAccountList.map((a) => ({ role: a.role, email: a.email })),
  };

  if (integration?.integrations) {
    // GitHub 정보 (민감정보 제외)
    if (integration.integrations.github) {
      const account = await getServiceAccount(integration.integrations.github);
      if (account) {
        context.github = {
          username: account.credentials.username as string,
          email: account.credentials.email as string | undefined,
        };
      }
    }

    // Supabase 정보 (민감정보 제외)
    if (integration.integrations.supabase) {
      const account = await getServiceAccount(integration.integrations.supabase);
      if (account) {
        context.supabase = {
          projectUrl: account.credentials.projectUrl as string,
        };
      }
    }

    // Vercel 정보
    if (integration.integrations.vercel) {
      const account = await getServiceAccount(integration.integrations.vercel);
      if (account) {
        context.vercel = {
          teamId: account.credentials.teamId as string | undefined,
        };
      }
    }

    // Sentry 정보
    if (integration.integrations.sentry) {
      const account = await getServiceAccount(integration.integrations.sentry);
      if (account) {
        context.sentry = {
          orgSlug: account.credentials.orgSlug as string,
          projectSlug: account.credentials.projectSlug as string,
        };
      }
    }
  }

  return context;
}
