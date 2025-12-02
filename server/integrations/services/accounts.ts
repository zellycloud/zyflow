import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getIntegrationsDb } from '../db/client.js';
import {
  serviceAccounts,
  type ServiceAccount,
  type ServiceType,
  type Credentials,
  type GitHubCredentials,
  type SupabaseCredentials,
  type VercelCredentials,
  type SentryCredentials,
  type CustomCredentials,
} from '../db/schema.js';
import { encryptObject, decryptObject, maskSensitive } from '../crypto.js';
import { getMasterKey } from '../keychain.js';

// =============================================
// 서비스별 Credential 검증
// =============================================

function validateGitHubCredentials(creds: GitHubCredentials): void {
  if (!creds.username?.trim()) {
    throw new Error('GitHub username is required');
  }
  if (!creds.token?.trim()) {
    throw new Error('GitHub token is required');
  }
}

function validateSupabaseCredentials(creds: SupabaseCredentials): void {
  if (!creds.projectUrl?.trim()) {
    throw new Error('Supabase project URL is required');
  }
  if (!creds.anonKey?.trim()) {
    throw new Error('Supabase anon key is required');
  }
}

function validateVercelCredentials(creds: VercelCredentials): void {
  if (!creds.token?.trim()) {
    throw new Error('Vercel token is required');
  }
}

function validateSentryCredentials(creds: SentryCredentials): void {
  if (!creds.dsn?.trim()) {
    throw new Error('Sentry DSN is required');
  }
  if (!creds.orgSlug?.trim()) {
    throw new Error('Sentry org slug is required');
  }
  if (!creds.projectSlug?.trim()) {
    throw new Error('Sentry project slug is required');
  }
}

function validateCredentials(type: ServiceType, credentials: Credentials): void {
  switch (type) {
    case 'github':
      validateGitHubCredentials(credentials as GitHubCredentials);
      break;
    case 'supabase':
      validateSupabaseCredentials(credentials as SupabaseCredentials);
      break;
    case 'vercel':
      validateVercelCredentials(credentials as VercelCredentials);
      break;
    case 'sentry':
      validateSentryCredentials(credentials as SentryCredentials);
      break;
    case 'custom':
      // Custom은 최소한 하나의 키-값 쌍이 필요
      if (Object.keys(credentials).length === 0) {
        throw new Error('Custom credentials must have at least one key-value pair');
      }
      break;
  }
}

// =============================================
// 마스킹된 Credential 반환 (UI 표시용)
// =============================================

interface MaskedServiceAccount {
  id: string;
  type: ServiceType;
  name: string;
  credentials: Record<string, string>; // 마스킹된 값
  metadata: Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
}

function maskCredentials(type: ServiceType, creds: Credentials): Record<string, string> {
  const masked: Record<string, string> = {};

  switch (type) {
    case 'github': {
      const gh = creds as GitHubCredentials;
      masked.username = gh.username;
      masked.token = maskSensitive(gh.token);
      if (gh.email) masked.email = gh.email;
      if (gh.sshKeyPath) masked.sshKeyPath = gh.sshKeyPath;
      break;
    }
    case 'supabase': {
      const sb = creds as SupabaseCredentials;
      masked.projectUrl = sb.projectUrl;
      masked.anonKey = maskSensitive(sb.anonKey);
      if (sb.serviceRoleKey) masked.serviceRoleKey = maskSensitive(sb.serviceRoleKey);
      break;
    }
    case 'vercel': {
      const vc = creds as VercelCredentials;
      masked.token = maskSensitive(vc.token);
      if (vc.teamId) masked.teamId = vc.teamId;
      break;
    }
    case 'sentry': {
      const st = creds as SentryCredentials;
      masked.dsn = maskSensitive(st.dsn);
      if (st.authToken) masked.authToken = maskSensitive(st.authToken);
      masked.orgSlug = st.orgSlug;
      masked.projectSlug = st.projectSlug;
      break;
    }
    case 'custom': {
      const custom = creds as CustomCredentials;
      for (const [key, value] of Object.entries(custom)) {
        // 민감해 보이는 키는 마스킹
        const sensitiveKeys = ['token', 'key', 'secret', 'password', 'apikey', 'api_key'];
        if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
          masked[key] = maskSensitive(value);
        } else {
          masked[key] = value;
        }
      }
      break;
    }
  }

  return masked;
}

// =============================================
// CRUD Operations
// =============================================

/**
 * 서비스 계정 생성
 */
export async function createServiceAccount(
  type: ServiceType,
  name: string,
  credentials: Credentials,
  metadata?: Record<string, string>
): Promise<ServiceAccount> {
  validateCredentials(type, credentials);

  const masterKey = await getMasterKey();
  const db = getIntegrationsDb();
  const now = new Date();

  const encryptedCredentials = await encryptObject(credentials, masterKey);

  const account: typeof serviceAccounts.$inferInsert = {
    id: nanoid(),
    type,
    name: name.trim(),
    credentials: encryptedCredentials,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(serviceAccounts).values(account);

  return {
    ...account,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 서비스 계정 목록 조회 (마스킹된 credentials)
 */
export async function listServiceAccounts(type?: ServiceType): Promise<MaskedServiceAccount[]> {
  const masterKey = await getMasterKey();
  const db = getIntegrationsDb();

  let query = db.select().from(serviceAccounts);
  if (type) {
    query = query.where(eq(serviceAccounts.type, type)) as typeof query;
  }

  const accounts = await query;
  const result: MaskedServiceAccount[] = [];

  for (const account of accounts) {
    const decryptedCreds = await decryptObject<Credentials>(account.credentials, masterKey);
    result.push({
      id: account.id,
      type: account.type as ServiceType,
      name: account.name,
      credentials: maskCredentials(account.type as ServiceType, decryptedCreds),
      metadata: account.metadata ? JSON.parse(account.metadata) : null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    });
  }

  return result;
}

/**
 * 서비스 계정 단일 조회 (마스킹된 credentials)
 */
export async function getServiceAccount(id: string): Promise<MaskedServiceAccount | null> {
  const masterKey = await getMasterKey();
  const db = getIntegrationsDb();

  const accounts = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, id));

  if (accounts.length === 0) {
    return null;
  }

  const account = accounts[0];
  const decryptedCreds = await decryptObject<Credentials>(account.credentials, masterKey);

  return {
    id: account.id,
    type: account.type as ServiceType,
    name: account.name,
    credentials: maskCredentials(account.type as ServiceType, decryptedCreds),
    metadata: account.metadata ? JSON.parse(account.metadata) : null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/**
 * 서비스 계정 credentials 조회 (복호화된 원본)
 * 주의: 민감 정보 노출 - 내부 사용 또는 복사 기능에서만 사용
 */
export async function getServiceAccountCredentials(id: string): Promise<Credentials | null> {
  const masterKey = await getMasterKey();
  const db = getIntegrationsDb();

  const accounts = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, id));

  if (accounts.length === 0) {
    return null;
  }

  return decryptObject<Credentials>(accounts[0].credentials, masterKey);
}

/**
 * 서비스 계정 수정
 */
export async function updateServiceAccount(
  id: string,
  updates: {
    name?: string;
    credentials?: Credentials;
    metadata?: Record<string, string>;
  }
): Promise<ServiceAccount | null> {
  const db = getIntegrationsDb();

  // 기존 계정 조회
  const existing = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, id));

  if (existing.length === 0) {
    return null;
  }

  const account = existing[0];
  const now = new Date();
  const masterKey = await getMasterKey();

  const updateData: Partial<typeof serviceAccounts.$inferInsert> = {
    updatedAt: now,
  };

  if (updates.name !== undefined) {
    updateData.name = updates.name.trim();
  }

  if (updates.credentials !== undefined) {
    validateCredentials(account.type as ServiceType, updates.credentials);
    updateData.credentials = await encryptObject(updates.credentials, masterKey);
  }

  if (updates.metadata !== undefined) {
    updateData.metadata = JSON.stringify(updates.metadata);
  }

  await db.update(serviceAccounts).set(updateData).where(eq(serviceAccounts.id, id));

  // 업데이트된 계정 반환
  const updated = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, id));
  return updated[0];
}

/**
 * 서비스 계정 삭제
 */
export async function deleteServiceAccount(id: string): Promise<boolean> {
  const db = getIntegrationsDb();

  const result = await db.delete(serviceAccounts).where(eq(serviceAccounts.id, id));

  // better-sqlite3는 changes 수를 반환하지 않으므로 삭제 전 존재 여부로 판단
  const remaining = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, id));
  return remaining.length === 0;
}

/**
 * 서비스 타입별 계정 목록 (드롭다운용)
 */
export async function getAccountsByType(type: ServiceType): Promise<Array<{ id: string; name: string }>> {
  const db = getIntegrationsDb();

  const accounts = await db
    .select({
      id: serviceAccounts.id,
      name: serviceAccounts.name,
    })
    .from(serviceAccounts)
    .where(eq(serviceAccounts.type, type));

  return accounts;
}
