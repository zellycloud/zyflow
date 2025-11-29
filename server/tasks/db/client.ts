import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database.Database | null = null;

export function getDbPath(projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  return join(root, '.zyflow', 'tasks.db');
}

export function initDb(projectRoot?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (db) return db;

  const dbPath = getDbPath(projectRoot);
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

  // Initialize task sequence if not exists
  sqlite.exec(`
    INSERT OR IGNORE INTO sequences (name, value) VALUES ('task', 0);
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
      content='tasks',
      content_rowid='rowid',
      tokenize='unicode61'
    );
  `);

  // Create triggers to keep FTS index in sync
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
      INSERT INTO tasks_fts(id, title, description) VALUES (new.id, new.title, new.description);
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, id, title, description) VALUES('delete', old.id, old.title, old.description);
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, id, title, description) VALUES('delete', old.id, old.title, old.description);
      INSERT INTO tasks_fts(id, title, description) VALUES (new.id, new.title, new.description);
    END;
  `);

  db = drizzle(sqlite, { schema });
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
  }
}
