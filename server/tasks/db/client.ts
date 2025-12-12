import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database.Database | null = null;
let currentDbPath: string | null = null;

/**
 * 중앙 DB 경로 반환
 * 모든 프로젝트가 ~/.zyflow/tasks.db를 공유
 * projectRoot 파라미터는 하위 호환성을 위해 유지하지만 무시됨
 */
export function getDbPath(_projectRoot?: string): string {
  return join(homedir(), '.zyflow', 'tasks.db');
}

export function initDb(_projectRoot?: string): ReturnType<typeof drizzle<typeof schema>> {
  const dbPath = getDbPath();

  if (db) return db;

  const dbDir = dirname(dbPath);

  // Ensure .zyflow directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  sqlite = new Database(dbPath);

  // Enable WAL mode for better performance
  sqlite.pragma('journal_mode = WAL');

  // Create sequences table for auto-increment IDs
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Initialize origin-based task sequences
  sqlite.exec(`
    INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_inbox', 0);
    INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_openspec', 0);
  `);

  // Sync sequence values with actual max task IDs per origin
  sqlite.exec(`
    UPDATE sequences
    SET value = COALESCE((SELECT MAX(id) FROM tasks WHERE origin = 'inbox'), 0)
    WHERE name = 'task_inbox' AND value < COALESCE((SELECT MAX(id) FROM tasks WHERE origin = 'inbox'), 0);
  `);
  sqlite.exec(`
    UPDATE sequences
    SET value = COALESCE((SELECT MAX(id) FROM tasks WHERE origin = 'openspec'), 0)
    WHERE name = 'task_openspec' AND value < COALESCE((SELECT MAX(id) FROM tasks WHERE origin = 'openspec'), 0);
  `);

  // Create changes table (Flow의 최상위 단위)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS changes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      spec_path TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
      current_stage TEXT NOT NULL DEFAULT 'spec' CHECK(current_stage IN ('spec', 'task', 'code', 'test', 'commit', 'docs')),
      progress INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Create tasks table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      change_id TEXT,
      stage TEXT NOT NULL DEFAULT 'task' CHECK(stage IN ('spec', 'task', 'code', 'test', 'commit', 'docs')),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in-progress', 'review', 'done', 'archived')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      tags TEXT,
      assignee TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER
    );
  `);

  // Migration: Add archived_at column if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN archived_at INTEGER`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add change_id column for Flow integration
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN change_id TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add stage column for Flow pipeline
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN stage TEXT NOT NULL DEFAULT 'task'`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add group_title for tasks.md section grouping
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN group_title TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add group_order for section ordering (1, 2, 3...)
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN group_order INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add task_order for task ordering within group (1, 2, 3...)
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN task_order INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add major_title for 3-level hierarchy (## 1. Section -> major_title)
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN major_title TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add sub_order for 3-level hierarchy (### 1.1 -> sub_order = 1)
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN sub_order INTEGER`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add origin column for task source tracking (openspec/inbox/imported)
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN origin TEXT NOT NULL DEFAULT 'inbox'`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Set origin based on existing data (change_id 유무로 판단)
  try {
    sqlite.exec(`
      UPDATE tasks
      SET origin = 'openspec'
      WHERE origin = 'inbox' AND change_id IS NOT NULL AND change_id != ''
    `);
  } catch (e) {
    console.error('Migration warning (origin update):', e);
  }

  // Migration: Add project_id column for project-based task isolation
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN project_id TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add display_id column for task numbering (e.g., "1.1", "1.2.3")
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN display_id TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Set default project_id for existing tasks
  try {
    sqlite.exec(`
      UPDATE tasks
      SET project_id = (SELECT project_id FROM changes WHERE changes.id = tasks.change_id)
      WHERE project_id IS NULL AND change_id IS NOT NULL
    `);
    sqlite.exec(`UPDATE tasks SET project_id = 'default' WHERE project_id IS NULL`);
  } catch (e) {
    console.error('Migration warning (project_id update):', e);
  }

  // Migration: Convert to composite primary key (origin, id)
  // This allows inbox and openspec tasks to have separate ID sequences
  try {
    const tableInfo = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
    // Check if already migrated (has composite key)
    if (tableInfo?.sql && !tableInfo.sql.includes('PRIMARY KEY (origin, id)')) {
      console.log('Migrating tasks table to composite primary key (origin, id)...');

      // Reassign inbox task IDs starting from 1
      const inboxTasks = sqlite.prepare(`
        SELECT id FROM tasks WHERE origin = 'inbox' ORDER BY created_at, id
      `).all() as Array<{ id: number }>;

      let newInboxId = 1;
      for (const task of inboxTasks) {
        sqlite.prepare(`UPDATE tasks SET id = ? WHERE id = ? AND origin = 'inbox'`).run(-task.id - 100000, task.id);
      }
      for (const task of inboxTasks) {
        sqlite.prepare(`UPDATE tasks SET id = ? WHERE id = ? AND origin = 'inbox'`).run(newInboxId++, -task.id - 100000);
      }

      // Update inbox sequence
      sqlite.prepare(`UPDATE sequences SET value = ? WHERE name = 'task_inbox'`).run(newInboxId - 1);

      // Update openspec sequence
      const maxOpenspecId = sqlite.prepare(`SELECT MAX(id) as max FROM tasks WHERE origin = 'openspec'`).get() as { max: number } | undefined;
      sqlite.prepare(`UPDATE sequences SET value = ? WHERE name = 'task_openspec'`).run(maxOpenspecId?.max ?? 0);

      console.log(`Migration completed: ${inboxTasks.length} inbox tasks renumbered (1-${newInboxId - 1})`);
    }
  } catch (e) {
    console.error('Migration warning (composite key):', e);
  }

  // Migration: Convert TEXT id to INTEGER id
  // This handles migration from TASK-1 format to pure numeric IDs
  try {
    const tableInfo = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
    if (tableInfo?.sql && tableInfo.sql.includes('id TEXT PRIMARY KEY')) {
      console.log('Migrating tasks table from TEXT id to INTEGER id...');

      // Get current max sequence value
      const seqResult = sqlite.prepare("SELECT value FROM sequences WHERE name = 'task'").get() as { value: number } | undefined;
      const currentSeq = seqResult?.value ?? 0;

      sqlite.exec(`
        BEGIN TRANSACTION;

        -- Create new table with INTEGER id
        CREATE TABLE tasks_new (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in-progress', 'review', 'done', 'archived')),
          priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
          tags TEXT,
          assignee TEXT,
          "order" INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );

        -- Copy data from old table, extracting numeric part from TASK-X format
        INSERT INTO tasks_new (id, title, description, status, priority, tags, assignee, "order", created_at, updated_at, archived_at)
        SELECT
          CAST(REPLACE(id, 'TASK-', '') AS INTEGER) as id,
          title, description, status, priority, tags, assignee, "order", created_at, updated_at, archived_at
        FROM tasks;

        -- Drop old table
        DROP TABLE tasks;

        -- Rename new table
        ALTER TABLE tasks_new RENAME TO tasks;

        -- Rebuild FTS table
        DROP TABLE IF EXISTS tasks_fts;

        COMMIT;
      `);

      // Recreate FTS triggers after table recreation
      sqlite.exec(`DROP TRIGGER IF EXISTS tasks_ai`);
      sqlite.exec(`DROP TRIGGER IF EXISTS tasks_ad`);
      sqlite.exec(`DROP TRIGGER IF EXISTS tasks_au`);

      console.log('Migration completed successfully.');
    }
  } catch (e) {
    // Migration failed or not needed, continue
    console.error('Migration warning:', e);
  }

  // Create FTS5 virtual table for full-text search
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
      id,
      title,
      description,
      group_title,
      content='tasks',
      content_rowid='rowid',
      tokenize='unicode61'
    );
  `);

  // Create triggers to keep FTS index in sync
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
      INSERT INTO tasks_fts(id, title, description, group_title) VALUES (new.id, new.title, new.description, new.group_title);
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, id, title, description, group_title) VALUES('delete', old.id, old.title, old.description, old.group_title);
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, id, title, description, group_title) VALUES('delete', old.id, old.title, old.description, old.group_title);
      INSERT INTO tasks_fts(id, title, description, group_title) VALUES (new.id, new.title, new.description, new.group_title);
    END;
  `);

  // Migration: Rebuild FTS table to include group_title
  try {
    // Check if group_title column exists in tasks_fts
    const ftsInfo = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks_fts'").get() as { sql: string } | undefined;
    if (ftsInfo?.sql && !ftsInfo.sql.includes('group_title')) {
      console.log('Rebuilding FTS table to include group_title...');
      
      sqlite.exec(`
        BEGIN TRANSACTION;
        
        -- Drop existing FTS table
        DROP TABLE IF EXISTS tasks_fts;
        
        -- Drop existing triggers
        DROP TRIGGER IF EXISTS tasks_ai;
        DROP TRIGGER IF EXISTS tasks_ad;
        DROP TRIGGER IF EXISTS tasks_au;
        
        COMMIT;
      `);
    }
  } catch (e) {
    console.error('Migration warning (FTS rebuild):', e);
  }

  // Create indexes for better performance
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_group_title ON tasks(group_title);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_group_task_order ON tasks(group_order, task_order);
  `);

  // Additional indexes for performance optimization
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_change_id ON tasks(change_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_project_stage ON tasks(project_id, stage);
  `);

  // Changes table indexes
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_changes_project_id ON changes(project_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(status);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_changes_project_status ON changes(project_id, status);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_changes_updated_at ON changes(updated_at);
  `);

  // =============================================
  // Change Log & Replay 시스템 테이블
  // =============================================

  // Change Events 테이블 (이벤트 로그)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS change_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('FILE_CHANGE', 'DB_CHANGE', 'SYNC_OPERATION', 'CONFLICT_DETECTED', 'CONFLICT_RESOLVED', 'RECOVERY_STARTED', 'RECOVERY_COMPLETED', 'BACKUP_CREATED', 'BACKUP_RESTORED', 'SYSTEM_EVENT')),
      severity TEXT NOT NULL DEFAULT 'INFO' CHECK(severity IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
      source TEXT NOT NULL CHECK(source IN ('FILE_WATCHER', 'SYNC_MANAGER', 'RECOVERY_MANAGER', 'BACKUP_MANAGER', 'MCP_SERVER', 'USER_ACTION', 'SYSTEM')),
      timestamp INTEGER NOT NULL,
      project_id TEXT,
      change_id TEXT,
      correlation_id TEXT,
      session_id TEXT,
      user_id TEXT,
      data_type TEXT NOT NULL,
      data TEXT NOT NULL,
      metadata TEXT NOT NULL,
      processing_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
      processed_at INTEGER,
      processing_error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      checksum TEXT,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Replay Sessions 테이블
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS replay_sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      filter TEXT NOT NULL,
      options TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
      total_events INTEGER NOT NULL DEFAULT 0,
      processed_events INTEGER NOT NULL DEFAULT 0,
      succeeded_events INTEGER NOT NULL DEFAULT 0,
      failed_events INTEGER NOT NULL DEFAULT 0,
      skipped_events INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      duration INTEGER,
      result TEXT,
      metadata TEXT
    );
  `);

  // Replay Results 테이블
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS replay_results (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES replay_sessions(id),
      event_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED', 'SKIPPED')),
      duration INTEGER NOT NULL,
      error TEXT,
      warnings TEXT,
      "order" INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Rollback Points 테이블
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS rollback_points (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES replay_sessions(id),
      timestamp INTEGER NOT NULL,
      description TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      metadata TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_expired INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Event Statistics 테이블 (성능 최적화용)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS event_statistics (
      id INTEGER PRIMARY KEY,
      project_id TEXT,
      event_type TEXT,
      severity TEXT,
      source TEXT,
      date TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      avg_duration REAL,
      error_count INTEGER NOT NULL DEFAULT 0,
      calculated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Event Indexes 테이블 (검색 성능 최적화용)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS event_indexes (
      id INTEGER PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES change_events(id),
      field_name TEXT NOT NULL,
      field_value TEXT NOT NULL,
      field_type TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL
    );
  `);

  // Change Events 인덱스
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_events_type ON change_events(type);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_events_severity ON change_events(severity);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_events_timestamp ON change_events(timestamp);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_events_project_id ON change_events(project_id);
  `);

  // Replay Sessions 인덱스
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_replay_sessions_status ON replay_sessions(status);
  `);

  // Replay Results 인덱스
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_replay_results_session_id ON replay_results(session_id);
  `);

  // Rollback Points 인덱스
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_rollback_points_session_id ON rollback_points(session_id);
  `);

  db = drizzle(sqlite, { schema });
  currentDbPath = dbPath;
  return db;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    return initDb();
  }
  return db;
}

export function getSqlite(): Database.Database {
  if (!sqlite) {
    initDb();
  }
  return sqlite!;
}

export function closeDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
    currentDbPath = null;
  }
}
