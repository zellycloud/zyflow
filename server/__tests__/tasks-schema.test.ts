import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../tasks/db/schema.js';
import { tasks, Task } from '../tasks/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test database setup
let testDbPath: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

describe('Database Schema - Dual Origin Support (TAG-003)', () => {
  beforeAll(() => {
    // Create temporary test database
    testDbPath = join(tmpdir(), `test-tasks-${Date.now()}.db`);

    // Initialize SQLite
    sqlite = new Database(testDbPath);
    sqlite.pragma('journal_mode = WAL');

    // Create sequences table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sequences (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Initialize sequences for all origins
    sqlite.exec(`
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_inbox', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_openspec', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_moai', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_backlog', 0);
    `);

    // Create tasks table with all fields
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
    `);

    // Create changes table with specPath support
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS changes (
        id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        spec_path TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        current_stage TEXT NOT NULL DEFAULT 'spec',
        progress INTEGER NOT NULL DEFAULT 0,
        artifact_status TEXT,
        artifact_status_updated_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        archived_at INTEGER,
        PRIMARY KEY (id, project_id)
      );
    `);

    // Create indexes
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_origin ON tasks(origin);
      CREATE INDEX IF NOT EXISTS idx_tasks_tag_id ON tasks(tag_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_changes_project_id ON changes(project_id);
    `);

    // Initialize Drizzle ORM
    db = drizzle(sqlite, { schema });
  });

  afterAll(() => {
    sqlite.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    // Clean up WAL files
    const walPath = testDbPath + '-wal';
    const shmPath = testDbPath + '-shm';
    if (existsSync(walPath)) unlinkSync(walPath);
    if (existsSync(shmPath)) unlinkSync(shmPath);
  });

  describe('Origin field - Dual origin support', () => {
    it('should characterize: origin column exists with openspec value', () => {
      const now = Date.now();
      db.insert(tasks).values({
        id: 1,
        projectId: 'test-project',
        title: 'Test OpenSpec Task',
        origin: 'openspec',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, 1)).get();
      expect(result).toBeDefined();
      expect(result?.origin).toBe('openspec');
    });

    it('should characterize: origin column exists with moai value', () => {
      const now = Date.now();
      db.insert(tasks).values({
        id: 2,
        projectId: 'test-project',
        title: 'Test MoAI Task',
        origin: 'moai',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, 2)).get();
      expect(result).toBeDefined();
      expect(result?.origin).toBe('moai');
    });

    it('should characterize: origin defaults to inbox when not specified', () => {
      const now = Date.now();
      db.insert(tasks).values({
        id: 3,
        projectId: 'test-project',
        title: 'Test Default Origin Task',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, 3)).get();
      expect(result).toBeDefined();
      expect(result?.origin).toBe('inbox');
    });

    it('should characterize: supports all origin values (openspec, moai, inbox, imported, backlog)', () => {
      const now = Date.now();
      const origins = ['openspec', 'moai', 'inbox', 'imported', 'backlog'] as const;

      origins.forEach((origin, idx) => {
        db.insert(tasks).values({
          id: 10 + idx,
          projectId: 'test-project',
          title: `Test ${origin} Task`,
          origin,
          status: 'todo',
          priority: 'medium',
          createdAt: new Date(now),
          updatedAt: new Date(now),
        }).run();
      });

      origins.forEach((origin, idx) => {
        const result = db.select().from(tasks).where(eq(tasks.id, 10 + idx)).get();
        expect(result?.origin).toBe(origin);
      });
    });

    it('should characterize: can filter tasks by origin', () => {
      const moaiTasks = db.select().from(tasks).where(eq(tasks.origin, 'moai')).all();
      expect(moaiTasks.length).toBeGreaterThanOrEqual(1);
      moaiTasks.forEach(task => {
        expect(task.origin).toBe('moai');
      });
    });
  });

  describe('MoAI TAG fields - Tag support', () => {
    it('should characterize: tag_id field exists and is nullable', () => {
      const now = Date.now();
      const taskId = 20;
      db.insert(tasks).values({
        id: taskId,
        projectId: 'test-project',
        title: 'Task with TAG-001',
        origin: 'moai',
        tagId: 'TAG-001',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      expect(result).toBeDefined();
      expect(result?.tagId).toBe('TAG-001');
    });

    it('should characterize: tag_scope field exists and stores comma-separated file paths', () => {
      const now = Date.now();
      const taskId = 21;
      const scope = 'server/tasks/db/schema.ts,server/tasks/core/task.ts';

      db.insert(tasks).values({
        id: taskId,
        projectId: 'test-project',
        title: 'Task with scope',
        origin: 'moai',
        tagId: 'TAG-002',
        tagScope: scope,
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      expect(result).toBeDefined();
      expect(result?.tagScope).toBe(scope);
      expect(result?.tagScope?.includes('server/tasks')).toBe(true);
    });

    it('should characterize: tag_dependencies field stores JSON array', () => {
      const now = Date.now();
      const taskId = 22;
      const deps = JSON.stringify(['TAG-001', 'TAG-002']);

      db.insert(tasks).values({
        id: taskId,
        projectId: 'test-project',
        title: 'Task with dependencies',
        origin: 'moai',
        tagId: 'TAG-003',
        tagDependencies: deps,
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      expect(result).toBeDefined();
      const parsedDeps = JSON.parse(result?.tagDependencies || '[]');
      expect(parsedDeps).toEqual(['TAG-001', 'TAG-002']);
    });

    it('should characterize: TAG fields are nullable (optional)', () => {
      const now = Date.now();
      const taskId = 23;

      db.insert(tasks).values({
        id: taskId,
        projectId: 'test-project',
        title: 'Task without TAG fields',
        origin: 'moai',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      expect(result).toBeDefined();
      expect(result?.tagId).toBeNull();
      expect(result?.tagScope).toBeNull();
      expect(result?.tagDependencies).toBeNull();
    });

    it('should characterize: can find tasks by tag_id', () => {
      const results = db.select().from(tasks).where(eq(tasks.tagId, 'TAG-001')).all();
      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach(task => {
        expect(task.tagId).toBe('TAG-001');
      });
    });
  });

  describe('specPath field - Dual origin path support', () => {
    it('should characterize: specPath field exists in changes table', () => {
      const now = Date.now();
      db.insert(schema.changes).values({
        id: 'change-001',
        projectId: 'test-project',
        title: 'OpenSpec Change',
        specPath: 'openspec/changes/change-001/proposal.md',
        status: 'active',
        currentStage: 'spec',
        progress: 0,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(schema.changes)
        .where(and(
          eq(schema.changes.id, 'change-001'),
          eq(schema.changes.projectId, 'test-project')
        ))
        .get();

      expect(result).toBeDefined();
      expect(result?.specPath).toBe('openspec/changes/change-001/proposal.md');
    });

    it('should characterize: specPath supports .moai/specs/ path format', () => {
      const now = Date.now();
      db.insert(schema.changes).values({
        id: 'SPEC-001',
        projectId: 'test-project',
        title: 'MoAI Spec',
        specPath: '.moai/specs/SPEC-001/spec.md',
        status: 'active',
        currentStage: 'spec',
        progress: 0,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(schema.changes)
        .where(and(
          eq(schema.changes.id, 'SPEC-001'),
          eq(schema.changes.projectId, 'test-project')
        ))
        .get();

      expect(result).toBeDefined();
      expect(result?.specPath).toBe('.moai/specs/SPEC-001/spec.md');
      expect(result?.specPath?.includes('.moai/specs')).toBe(true);
    });

    it('should characterize: specPath is nullable (optional)', () => {
      const now = Date.now();
      db.insert(schema.changes).values({
        id: 'change-002',
        projectId: 'test-project',
        title: 'Change without specPath',
        status: 'active',
        currentStage: 'spec',
        progress: 0,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(schema.changes)
        .where(and(
          eq(schema.changes.id, 'change-002'),
          eq(schema.changes.projectId, 'test-project')
        ))
        .get();

      expect(result).toBeDefined();
      expect(result?.specPath).toBeNull();
    });
  });

  describe('Dual origin compatibility - Existing queries work unchanged', () => {
    it('should characterize: createTask operation works with all origins', () => {
      const now = Date.now();
      const testCases = [
        { origin: 'openspec' as const, title: 'OpenSpec Task' },
        { origin: 'moai' as const, title: 'MoAI Task' },
        { origin: 'inbox' as const, title: 'Inbox Task' },
      ];

      testCases.forEach((testCase, idx) => {
        db.insert(tasks).values({
          id: 30 + idx,
          projectId: 'test-project',
          title: testCase.title,
          origin: testCase.origin,
          status: 'todo',
          priority: 'medium',
          createdAt: new Date(now),
          updatedAt: new Date(now),
        }).run();
      });

      testCases.forEach((testCase, idx) => {
        const result = db.select().from(tasks).where(eq(tasks.id, 30 + idx)).get();
        expect(result).toBeDefined();
        expect(result?.origin).toBe(testCase.origin);
        expect(result?.title).toBe(testCase.title);
      });
    });

    it('should characterize: listTasks filtering by origin works', () => {
      const moaiTasks = db.select().from(tasks).where(eq(tasks.origin, 'moai')).all();
      expect(moaiTasks.length).toBeGreaterThan(0);

      const openspecTasks = db.select().from(tasks).where(eq(tasks.origin, 'openspec')).all();
      expect(openspecTasks.length).toBeGreaterThan(0);
    });

    it('should characterize: updateTask preserves origin', () => {
      const now = Date.now();
      const taskId = 40;

      // Create task with moai origin
      db.insert(tasks).values({
        id: taskId,
        projectId: 'test-project',
        title: 'Original Title',
        origin: 'moai',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      // Update task
      db.update(tasks)
        .set({ title: 'Updated Title', updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
        .run();

      const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      expect(result).toBeDefined();
      expect(result?.origin).toBe('moai'); // Origin preserved
      expect(result?.title).toBe('Updated Title');
    });
  });

  describe('Sequence management - Origin-based IDs', () => {
    it('should characterize: sequences table maintains separate counters per origin', () => {
      const seqs = sqlite.prepare('SELECT name, value FROM sequences ORDER BY name').all() as Array<{ name: string; value: number }>;
      expect(seqs.length).toBeGreaterThanOrEqual(4);

      const names = seqs.map(s => s.name);
      expect(names).toContain('task_inbox');
      expect(names).toContain('task_openspec');
      expect(names).toContain('task_moai');
      expect(names).toContain('task_backlog');
    });

    it('should characterize: can increment sequences per origin', () => {
      const before = sqlite.prepare('SELECT value FROM sequences WHERE name = ?').get('task_moai') as { value: number };

      sqlite.prepare('UPDATE sequences SET value = value + 1 WHERE name = ?').run('task_moai');

      const after = sqlite.prepare('SELECT value FROM sequences WHERE name = ?').get('task_moai') as { value: number };
      expect(after.value).toBe(before.value + 1);
    });
  });
});
