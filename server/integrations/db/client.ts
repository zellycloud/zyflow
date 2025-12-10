import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database.Database | null = null;

/**
 * Integration Hub DB 경로 반환
 * 글로벌 저장소: ~/.zyflow/integrations.db
 */
export function getIntegrationsDbPath(): string {
  return join(homedir(), '.zyflow', 'integrations.db');
}

/**
 * Integration Hub 디렉토리 경로 반환
 */
export function getIntegrationsDir(): string {
  return join(homedir(), '.zyflow');
}

/**
 * Integration Hub DB 초기화
 */
export function initIntegrationsDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (db) return db;

  const dbPath = getIntegrationsDbPath();
  const dbDir = dirname(dbPath);

  // ~/.zyflow 디렉토리 생성
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  sqlite = new Database(dbPath);

  // Enable WAL mode for better performance
  sqlite.pragma('journal_mode = WAL');

  // =============================================
  // Service Accounts 테이블
  // =============================================
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS service_accounts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('github', 'supabase', 'vercel', 'sentry', 'custom')),
      name TEXT NOT NULL,
      credentials TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_service_accounts_type ON service_accounts(type);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_service_accounts_name ON service_accounts(name);
  `);

  // =============================================
  // Environments 테이블
  // =============================================
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      variables TEXT NOT NULL,
      server_url TEXT,
      database_url TEXT,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_environments_project_id ON environments(project_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_environments_project_name ON environments(project_id, name);
  `);

  // =============================================
  // Test Accounts 테이블
  // =============================================
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS test_accounts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_test_accounts_project_id ON test_accounts(project_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_test_accounts_role ON test_accounts(role);
  `);

  // =============================================
  // Project Integrations 테이블
  // =============================================
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project_integrations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      integrations TEXT NOT NULL,
      default_environment TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_project_integrations_project_id ON project_integrations(project_id);
  `);

  db = drizzle(sqlite, { schema });
  return db;
}

/**
 * Integration Hub DB 인스턴스 반환
 */
export function getIntegrationsDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    return initIntegrationsDb();
  }
  return db;
}

/**
 * SQLite 인스턴스 직접 접근 (raw query 필요 시)
 */
export function getIntegrationsSqlite(): Database.Database {
  if (!sqlite) {
    initIntegrationsDb();
  }
  return sqlite!;
}

/**
 * Integration Hub DB 연결 종료
 */
export function closeIntegrationsDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
