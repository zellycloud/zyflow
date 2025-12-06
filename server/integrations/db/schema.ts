import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// =============================================
// Integration Hub 타입 정의
// =============================================

// 지원되는 서비스 타입
export type ServiceType = 'github' | 'supabase' | 'vercel' | 'sentry' | 'custom';

// 환경 타입
export type EnvironmentName = 'local' | 'staging' | 'production' | string;

// =============================================
// Service Accounts 테이블
// =============================================

// 계정에 지정 가능한 환경 타입
export type AccountEnvironment = 'staging' | 'production' | null;

export const serviceAccounts = sqliteTable('service_accounts', {
  id: text('id').primaryKey(), // UUID
  type: text('type', {
    enum: ['github', 'supabase', 'vercel', 'sentry', 'custom'],
  }).notNull(),
  name: text('name').notNull(), // 사용자 지정 이름 (예: "hansooha", "zellycloud")
  environment: text('environment', {
    enum: ['staging', 'production'],
  }), // 환경 (nullable = 모든 환경)
  credentials: text('credentials').notNull(), // 암호화된 JSON (서비스별 credential 구조)
  metadata: text('metadata'), // JSON (org, team 등 추가 정보)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  typeIdx: index('idx_service_accounts_type').on(table.type),
  nameIdx: index('idx_service_accounts_name').on(table.name),
  envIdx: index('idx_service_accounts_environment').on(table.environment),
}));

export type ServiceAccount = typeof serviceAccounts.$inferSelect;
export type NewServiceAccount = typeof serviceAccounts.$inferInsert;

// =============================================
// Environments 테이블 (환경별 설정)
// =============================================
export const environments = sqliteTable('environments', {
  id: text('id').primaryKey(), // UUID
  projectId: text('project_id').notNull(), // 프로젝트 경로 또는 ID
  name: text('name').notNull(), // 'local' | 'staging' | 'production' | custom
  variables: text('variables').notNull(), // 암호화된 JSON (환경 변수)
  serverUrl: text('server_url'),
  databaseUrl: text('database_url'), // 암호화됨
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  projectIdIdx: index('idx_environments_project_id').on(table.projectId),
  projectNameIdx: index('idx_environments_project_name').on(table.projectId, table.name),
}));

export type Environment = typeof environments.$inferSelect;
export type NewEnvironment = typeof environments.$inferInsert;

// =============================================
// Test Accounts 테이블 (테스트 계정)
// =============================================
export const testAccounts = sqliteTable('test_accounts', {
  id: text('id').primaryKey(), // UUID
  projectId: text('project_id').notNull(),
  role: text('role').notNull(), // 'admin' | 'user' | custom
  email: text('email').notNull(),
  password: text('password').notNull(), // 암호화됨
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  projectIdIdx: index('idx_test_accounts_project_id').on(table.projectId),
  roleIdx: index('idx_test_accounts_role').on(table.role),
}));

export type TestAccount = typeof testAccounts.$inferSelect;
export type NewTestAccount = typeof testAccounts.$inferInsert;

// =============================================
// Project Integrations 테이블 (프로젝트-서비스 매핑)
// =============================================
export const projectIntegrations = sqliteTable('project_integrations', {
  id: text('id').primaryKey(), // UUID
  projectId: text('project_id').notNull().unique(), // 프로젝트 경로 또는 ID
  integrations: text('integrations').notNull(), // JSON: { github: "account-id", supabase: "account-id", ... }
  defaultEnvironment: text('default_environment'), // 기본 환경 이름
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  projectIdIdx: index('idx_project_integrations_project_id').on(table.projectId),
}));

export type ProjectIntegration = typeof projectIntegrations.$inferSelect;
export type NewProjectIntegration = typeof projectIntegrations.$inferInsert;

// =============================================
// Credential 타입 정의 (암호화 전 JSON 구조)
// =============================================

export interface GitHubCredentials {
  username: string;
  token: string; // PAT
  email?: string;
  sshKeyPath?: string;
}

export interface SupabaseCredentials {
  projectUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export interface VercelCredentials {
  token: string;
  teamId?: string;
}

export interface SentryCredentials {
  dsn: string;
  authToken?: string;
  orgSlug: string;
  projectSlug: string;
}

export interface CustomCredentials {
  [key: string]: string;
}

export type Credentials =
  | GitHubCredentials
  | SupabaseCredentials
  | VercelCredentials
  | SentryCredentials
  | CustomCredentials;

// =============================================
// 프로젝트 컨텍스트 타입 (AI용)
// =============================================

export interface ProjectContext {
  projectId: string;
  github?: {
    username: string;
    email?: string;
  };
  supabase?: {
    projectUrl: string;
  };
  vercel?: {
    teamId?: string;
  };
  sentry?: {
    orgSlug: string;
    projectSlug: string;
  };
  environments: string[];
  currentEnvironment?: string;
  testAccounts: Array<{
    role: string;
    email: string;
  }>;
}
