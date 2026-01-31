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
 * 틸드(~)를 홈 디렉토리로 확장
 * Node.js는 셸과 달리 ~를 자동으로 확장하지 않음
 */
function expandTilde(path: string): string {
  if (path.startsWith('~')) {
    return path.replace(/^~/, homedir())
  }
  return path
}

/**
 * 중앙 DB 경로 반환
 * - Docker: DATA_DIR 환경변수 사용 (예: /app/data)
 * - Local: ~/.zyflow/tasks.db
 * projectRoot 파라미터는 하위 호환성을 위해 유지하지만 무시됨
 */
export function getDbPath(_projectRoot?: string): string {
  const dataDir = process.env.DATA_DIR
  if (dataDir) {
    return join(expandTilde(dataDir), 'tasks.db')
  }
  return join(homedir(), '.zyflow', 'tasks.db')
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
  // TAG-014: Removed 'task_openspec' sequence
  sqlite.exec(`
    INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_inbox', 0);
    INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_moai', 0);
  `);

  // Create tasks table FIRST (before sequences sync that references it)
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

  // NOTE: Sequence sync with origin column is moved after the origin column migration
  // See the sync logic after "Migration: Add origin column" section below

  // Create changes table (Flow의 최상위 단위)
  // 복합 기본키: (id, project_id) - 같은 change id가 다른 프로젝트에서 사용 가능
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS changes (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      spec_path TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
      current_stage TEXT NOT NULL DEFAULT 'spec' CHECK(current_stage IN ('spec', 'task', 'code', 'test', 'commit', 'docs')),
      progress INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER,
      PRIMARY KEY (id, project_id)
    );
  `);

  // Migration: Add archived_at column to changes if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE changes ADD COLUMN archived_at INTEGER`);
  } catch {
    // Column already exists
  }

  // Migration: Add artifact_status column for OpenSpec 1.0 artifact caching (JSON)
  try {
    sqlite.exec(`ALTER TABLE changes ADD COLUMN artifact_status TEXT`);
  } catch {
    // Column already exists
  }

  // Migration: Add artifact_status_updated_at for cache invalidation
  try {
    sqlite.exec(`ALTER TABLE changes ADD COLUMN artifact_status_updated_at INTEGER`);
  } catch {
    // Column already exists
  }

  // Migration: Convert changes table from single id PK to composite (id, project_id) PK
  try {
    // Check if current table has single id primary key
    const tableInfo = sqlite.prepare("PRAGMA table_info(changes)").all() as Array<{ name: string; pk: number }>;
    const pkColumns = tableInfo.filter(col => col.pk > 0);

    if (pkColumns.length === 1 && pkColumns[0].name === 'id') {
      console.log('[Migration] Converting changes table to composite primary key (id, project_id)...');

      sqlite.exec(`
        -- Create new table with composite primary key
        CREATE TABLE changes_new (
          id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          spec_path TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
          current_stage TEXT NOT NULL DEFAULT 'spec' CHECK(current_stage IN ('spec', 'task', 'code', 'test', 'commit', 'docs')),
          progress INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER,
          PRIMARY KEY (id, project_id)
        );

        -- Copy data from old table
        INSERT OR IGNORE INTO changes_new SELECT id, project_id, title, spec_path, status, current_stage, progress, created_at, updated_at, archived_at FROM changes;

        -- Drop old table
        DROP TABLE changes;

        -- Rename new table
        ALTER TABLE changes_new RENAME TO changes;

        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_changes_project_id ON changes(project_id);
        CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(status);
        CREATE INDEX IF NOT EXISTS idx_changes_project_status ON changes(project_id, status);
        CREATE INDEX IF NOT EXISTS idx_changes_updated_at ON changes(updated_at);
      `);

      console.log('[Migration] Changes table migration complete');
    }
  } catch (err) {
    console.error('[Migration] Error migrating changes table:', err);
  }

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
  // TAG-014: Changed from 'openspec' to 'moai' origin
  try {
    sqlite.exec(`
      UPDATE tasks
      SET origin = 'moai'
      WHERE origin = 'inbox' AND change_id IS NOT NULL AND change_id != ''
    `);
  } catch (e) {
    console.error('Migration warning (origin update):', e);
  }

  // Sync sequence values with actual max task IDs per origin
  // This runs AFTER the origin column is added to avoid SQL errors
  try {
    sqlite.exec(`
      UPDATE sequences
      SET value = COALESCE((SELECT MAX(id) FROM tasks WHERE origin = 'inbox'), 0)
      WHERE name = 'task_inbox' AND value < COALESCE((SELECT MAX(id) FROM tasks WHERE origin = 'inbox'), 0);
    `);
    sqlite.exec(`
      UPDATE sequences
      SET value = COALESCE((SELECT MAX(id) FROM tasks WHERE origin = 'moai'), 0)
      WHERE name = 'task_moai' AND value < COALESCE((SELECT MAX(id) FROM tasks WHERE origin = 'moai'), 0);
    `);
  } catch (e) {
    console.error('Migration warning (sequence sync):', e);
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

  // =============================================
  // Backlog.md 관련 컬럼 마이그레이션 (snake_case)
  // =============================================

  // Migration: Add backlog_file_id column (task-007 형식)
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN backlog_file_id TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add parent_task_id column for subtask relationship
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add blocked_by column for dependencies (JSON array)
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN blocked_by TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add plan column for plan section content
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN plan TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add acceptance_criteria column for AC section
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN acceptance_criteria TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add notes column for notes section
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN notes TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add due_date column for deadline
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN due_date INTEGER`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add milestone column for sprint/milestone grouping
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN milestone TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // =============================================
  // MoAI SPEC TAG column migrations
  // =============================================

  // Migration: Add tag_id column for MoAI TAG identifier
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN tag_id TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add tag_scope column for TAG scope (file paths)
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN tag_scope TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add tag_dependencies column for TAG dependencies (JSON array)
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN tag_dependencies TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Backlog indexes for performance
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_backlog_file_id ON tasks(backlog_file_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone);`);

  // MoAI TAG index
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_tag_id ON tasks(tag_id);`);

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
  // TAG-014: Updated to handle 'moai' instead of 'openspec'
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

      // TAG-014: Update moai sequence (previously openspec)
      const maxMoaiId = sqlite.prepare(`SELECT MAX(id) as max FROM tasks WHERE origin = 'moai'`).get() as { max: number } | undefined;
      sqlite.prepare(`UPDATE sequences SET value = ? WHERE name = 'task_moai'`).run(maxMoaiId?.max ?? 0);

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

  // =============================================
  // Alert System 테이블
  // =============================================

  // Alerts 테이블
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK(source IN ('github', 'vercel', 'sentry', 'supabase', 'custom')),
      type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'info')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'resolved', 'ignored')),
      title TEXT NOT NULL,
      summary TEXT,
      external_url TEXT,
      payload TEXT NOT NULL,
      metadata TEXT,
      analysis TEXT,
      resolution TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      resolved_at INTEGER,
      expires_at INTEGER NOT NULL
    );
  `);

  // Alerts 인덱스
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_expires_at ON alerts(expires_at);`);

  // Activity Logs 테이블
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      alert_id TEXT REFERENCES alerts(id) ON DELETE CASCADE,
      actor TEXT NOT NULL CHECK(actor IN ('system', 'agent', 'user')),
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Activity Logs 인덱스
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_activity_logs_alert_id ON activity_logs(alert_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);`);

  // Webhook Configs 테이블
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS webhook_configs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK(source IN ('github', 'vercel', 'sentry', 'supabase', 'custom')),
      name TEXT NOT NULL,
      endpoint_path TEXT NOT NULL,
      secret TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      project_filter TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Webhook Configs 인덱스
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_configs_source ON webhook_configs(source);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_configs_enabled ON webhook_configs(enabled);`);

  // Notification Config 테이블 (싱글톤)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notification_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      slack_webhook_url TEXT,
      slack_channel TEXT,
      slack_enabled INTEGER NOT NULL DEFAULT 0,
      rule_on_critical INTEGER NOT NULL DEFAULT 1,
      rule_on_autofix INTEGER NOT NULL DEFAULT 1,
      rule_on_all INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 기본 notification config 생성
  sqlite.exec(`
    INSERT OR IGNORE INTO notification_config (id, created_at, updated_at)
    VALUES ('default', ${Date.now()}, ${Date.now()});
  `);

  // Migration: Add risk_assessment column to alerts
  try {
    sqlite.exec(`ALTER TABLE alerts ADD COLUMN risk_assessment TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add GitHub Actions poller columns to notification_config
  try {
    sqlite.exec(`ALTER TABLE notification_config ADD COLUMN poller_enabled INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists, ignore
  }
  try {
    sqlite.exec(`ALTER TABLE notification_config ADD COLUMN poller_interval_ms INTEGER NOT NULL DEFAULT 300000`);
  } catch {
    // Column already exists, ignore
  }
  try {
    sqlite.exec(`ALTER TABLE notification_config ADD COLUMN poller_repos TEXT`);
  } catch {
    // Column already exists, ignore
  }
  try {
    sqlite.exec(`ALTER TABLE notification_config ADD COLUMN poller_last_polled_at INTEGER`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add project_id column to alerts table for project-based filtering
  try {
    sqlite.exec(`ALTER TABLE alerts ADD COLUMN project_id TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Create index for project_id on alerts
  try {
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_project_id ON alerts(project_id);`);
  } catch {
    // Index already exists, ignore
  }

  // Migration: Recreate webhook_configs with correct schema (endpoint_path, project_filter)
  try {
    // Check if old schema exists by checking for 'endpoint' column
    const tableInfo = sqlite.prepare(`PRAGMA table_info(webhook_configs)`).all() as Array<{ name: string }>
    const hasOldSchema = tableInfo.some((col) => col.name === 'endpoint')
    if (hasOldSchema) {
      // Drop old table and let CREATE TABLE IF NOT EXISTS recreate it
      sqlite.exec(`DROP TABLE IF EXISTS webhook_configs`)
      sqlite.exec(`
        CREATE TABLE webhook_configs (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL CHECK(source IN ('github', 'vercel', 'sentry', 'supabase', 'custom')),
          name TEXT NOT NULL,
          endpoint_path TEXT NOT NULL,
          secret TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          project_filter TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)
      sqlite.exec(`CREATE INDEX idx_webhook_configs_source ON webhook_configs(source);`)
      sqlite.exec(`CREATE INDEX idx_webhook_configs_enabled ON webhook_configs(enabled);`)
    }
  } catch {
    // Ignore migration errors
  }

  // =============================================
  // Alert Patterns 테이블 (Phase 3: 유사 Alert 매칭)
  // =============================================
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS alert_patterns (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK(source IN ('github', 'vercel', 'sentry', 'supabase', 'custom')),
      type TEXT NOT NULL,
      pattern_signature TEXT NOT NULL,
      pattern_keywords TEXT,
      resolution_count INTEGER NOT NULL DEFAULT 0,
      auto_fix_count INTEGER NOT NULL DEFAULT 0,
      manual_fix_count INTEGER NOT NULL DEFAULT 0,
      avg_resolution_time INTEGER,
      recommended_action TEXT,
      recommended_fix TEXT,
      success_rate REAL,
      alert_ids TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Alert Patterns 인덱스
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_alert_patterns_source_type ON alert_patterns(source, type);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_alert_patterns_signature ON alert_patterns(pattern_signature);`);

  // =============================================
  // Alert Trends 테이블 (Phase 3: 통계 대시보드)
  // =============================================
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS alert_trends (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('github', 'vercel', 'sentry', 'supabase', 'custom', 'all')),
      total_count INTEGER NOT NULL DEFAULT 0,
      critical_count INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      info_count INTEGER NOT NULL DEFAULT 0,
      resolved_count INTEGER NOT NULL DEFAULT 0,
      ignored_count INTEGER NOT NULL DEFAULT 0,
      auto_fixed_count INTEGER NOT NULL DEFAULT 0,
      avg_resolution_time INTEGER,
      min_resolution_time INTEGER,
      max_resolution_time INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Alert Trends 인덱스
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_alert_trends_date_source ON alert_trends(date, source);`);

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

/**
 * Get next task ID for a specific origin type
 * Uses sequences table to track and increment IDs
 * TAG-014: Removed 'openspec' from origin options
 */
export function getNextTaskId(origin: 'inbox' | 'moai' | 'backlog' = 'backlog'): number {
  const db = getSqlite();
  const sequenceName = `task_${origin}`;

  // Ensure sequence exists
  db.prepare(`
    INSERT OR IGNORE INTO sequences (name, value) VALUES (?, 0)
  `).run(sequenceName);

  // Increment and get next value
  db.prepare(`
    UPDATE sequences SET value = value + 1 WHERE name = ?
  `).run(sequenceName);

  const result = db.prepare(`
    SELECT value FROM sequences WHERE name = ?
  `).get(sequenceName) as { value: number };

  return result.value;
}
