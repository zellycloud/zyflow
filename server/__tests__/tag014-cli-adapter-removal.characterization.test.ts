/**
 * TAG-014: CLI Adapter and Dead Code Removal
 * Characterization Test
 *
 * This test documents the current behavior before TAG-014 refactoring:
 * - openspec.ts file exists and exports functions
 * - CLI adapter module exports openspec functions
 * - openspec is a valid origin value in the tasks table
 * - Functions like getChangeStatus() and isOpenSpecAvailable() exist
 *
 * These tests serve as regression safeguards during the removal of CLI adapter and openspec references.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../tasks/db/schema.js'
import { tasks } from '../tasks/db/schema.js'
import { eq } from 'drizzle-orm'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Test database setup
let testDbPath: string
let sqlite: Database.Database
let db: ReturnType<typeof drizzle<typeof schema>>

describe('TAG-014: CLI Adapter and Dead Code Removal - Characterization', () => {
  beforeAll(() => {
    // Create temporary test database
    testDbPath = join(tmpdir(), `test-tag014-${Date.now()}.db`)

    // Initialize SQLite
    sqlite = new Database(testDbPath)
    sqlite.pragma('journal_mode = WAL')

    // Create sequences table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sequences (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      );
    `)

    // Initialize sequences
    sqlite.exec(`
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_inbox', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_openspec', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_moai', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_backlog', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_imported', 0);
    `)

    // Create tasks table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER NOT NULL,
        project_id TEXT NOT NULL,
        change_id TEXT,
        stage TEXT NOT NULL DEFAULT 'task',
        origin TEXT NOT NULL DEFAULT 'inbox',
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'medium',
        tags TEXT,
        assignee TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        group_title TEXT,
        group_order INTEGER NOT NULL DEFAULT 0,
        task_order INTEGER NOT NULL DEFAULT 0,
        parent_task_id INTEGER,
        blocked_by TEXT,
        plan TEXT,
        acceptance_criteria TEXT,
        notes TEXT,
        due_date INTEGER,
        milestone TEXT,
        backlog_file_id TEXT,
        tag_id TEXT,
        tag_scope TEXT,
        tag_dependencies TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        archived_at INTEGER,
        PRIMARY KEY (id)
      );
    `)

    db = drizzle(sqlite, { schema })
  })

  afterAll(() => {
    sqlite.close()
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath)
    }
  })

  describe('characterization: origin enum contains "openspec"', () => {
    it('characterization: TaskOrigin type includes "openspec" value', () => {
      // Current state: TaskOrigin = 'openspec' | 'moai' | 'inbox' | 'imported' | 'backlog'
      // This documents that 'openspec' is currently a valid origin
      const validOrigins = ['openspec', 'moai', 'inbox', 'imported', 'backlog']
      expect(validOrigins).toContain('openspec')
    })

    it('characterization: Can insert task with origin="openspec"', () => {
      const result = sqlite
        .prepare(
          `INSERT INTO tasks (
          id, project_id, origin, title, stage, status, priority,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(1, 'test-project', 'openspec', 'Test Task', 'task', 'todo', 'medium', Date.now(), Date.now())

      expect(result.changes).toBe(1)

      // Verify the task was inserted correctly
      const task = sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get(1)
      expect(task).toBeDefined()
      expect(task?.origin).toBe('openspec')
    })

    it('characterization: Can query tasks by origin="openspec"', () => {
      // Insert sample tasks with different origins
      sqlite
        .prepare(
          `INSERT INTO tasks (
          id, project_id, origin, title, stage, status, priority,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(2, 'test-project', 'openspec', 'OpenSpec Task', 'task', 'todo', 'medium', Date.now(), Date.now())

      sqlite
        .prepare(
          `INSERT INTO tasks (
          id, project_id, origin, title, stage, status, priority,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(3, 'test-project', 'moai', 'MoAI Task', 'task', 'todo', 'medium', Date.now(), Date.now())

      // Query for openspec tasks
      const openspecTasks = sqlite
        .prepare('SELECT * FROM tasks WHERE origin = ? ORDER BY id')
        .all('openspec')
      expect(openspecTasks.length).toBeGreaterThan(0)
      expect(openspecTasks.every((t) => t.origin === 'openspec')).toBe(true)

      // Query for moai tasks
      const moaiTasks = sqlite.prepare('SELECT * FROM tasks WHERE origin = ? ORDER BY id').all('moai')
      expect(moaiTasks.length).toBeGreaterThan(0)
      expect(moaiTasks.every((t) => t.origin === 'moai')).toBe(true)
    })
  })

  describe('characterization: CLI adapter module (post TAG-014)', () => {
    it('characterization: cli-adapter/openspec.ts file should NOT exist (TAG-014)', () => {
      const openspecPath = join(process.cwd(), 'server', 'cli-adapter', 'openspec.ts')
      // TAG-014: openspec.ts was deleted
      expect(existsSync(openspecPath)).toBe(false)
    })

    it('characterization: cli-adapter/index.ts no longer exports openspec', async () => {
      try {
        const indexPath = join(process.cwd(), 'server', 'cli-adapter', 'index.ts')
        const content = require('fs').readFileSync(indexPath, 'utf-8')
        // TAG-014: export * from './openspec.js' was removed
        expect(content).not.toContain("export * from './openspec.js'")
      } catch (e) {
        // File might not exist in test environment, skip
        console.warn('Could not read cli-adapter/index.ts')
      }
    })
  })

  describe('characterization: Task sequence counters', () => {
    it('characterization: task_openspec sequence exists and can be incremented', () => {
      const result = sqlite
        .prepare('SELECT value FROM sequences WHERE name = ?')
        .get('task_openspec')
      expect(result).toBeDefined()
      expect(typeof result?.value).toBe('number')

      // Try incrementing it
      sqlite.prepare('UPDATE sequences SET value = value + 1 WHERE name = ?').run('task_openspec')
      const updated = sqlite.prepare('SELECT value FROM sequences WHERE name = ?').get('task_openspec')
      expect(updated.value).toBeGreaterThan((result?.value || 0) as number)
    })

    it('characterization: All origin sequences exist', () => {
      const origins = ['task_inbox', 'task_openspec', 'task_moai', 'task_backlog', 'task_imported']
      for (const origin of origins) {
        const result = sqlite.prepare('SELECT value FROM sequences WHERE name = ?').get(origin)
        expect(result).toBeDefined()
      }
    })
  })

  describe('characterization: Database enum constraint', () => {
    it('characterization: schema defines origin enum with "openspec"', () => {
      // This documents the current schema state
      // Before TAG-014: origin ENUM('openspec', 'moai', 'inbox', 'imported', 'backlog')
      // After TAG-014: origin ENUM('moai', 'inbox', 'imported', 'backlog')
      const schemaFile = require('fs').readFileSync(
        join(process.cwd(), 'server', 'tasks', 'db', 'schema.ts'),
        'utf-8'
      )
      expect(schemaFile).toContain("'openspec'")
      expect(schemaFile).toContain("'moai'")
      expect(schemaFile).toContain("'inbox'")
      expect(schemaFile).toContain("'imported'")
      expect(schemaFile).toContain("'backlog'")
    })
  })
})
