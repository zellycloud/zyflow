import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../tasks/db/schema.js';
import { tasks, type TaskOrigin } from '../tasks/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Integration tests for TAG-003: Database Schema Dual Support
 * Validates that OpenSpec and MoAI origins can coexist with tag support
 */

let testDbPath: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

describe('TAG-003: Database Schema Dual Origin Support', () => {
  beforeAll(() => {
    // Create temporary test database
    testDbPath = join(tmpdir(), `test-dual-origin-${Date.now()}.db`);

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

    // Initialize sequences
    sqlite.exec(`
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_inbox', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_openspec', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_moai', 0);
      INSERT OR IGNORE INTO sequences (name, value) VALUES ('task_backlog', 0);
    `);

    // Create tasks table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY,
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
        archived_at INTEGER
      );
    `);

    // Create changes table
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
    const walPath = testDbPath + '-wal';
    const shmPath = testDbPath + '-shm';
    if (existsSync(walPath)) unlinkSync(walPath);
    if (existsSync(shmPath)) unlinkSync(shmPath);
  });

  describe('OpenSpec Origin Support', () => {
    it('should characterize: create and retrieve openspec origin task', () => {
      const now = Date.now();
      const taskId = 100;

      db.insert(tasks).values({
        id: taskId,
        projectId: 'test-project',
        title: 'OpenSpec Feature Implementation',
        origin: 'openspec',
        status: 'todo',
        priority: 'high',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      expect(result).toBeDefined();
      expect(result?.origin).toBe('openspec');
      expect(result?.title).toBe('OpenSpec Feature Implementation');
      expect(result?.projectId).toBe('test-project');
    });

    it('should characterize: list all openspec tasks', () => {
      // Create multiple openspec tasks
      for (let i = 101; i <= 103; i++) {
        db.insert(tasks).values({
          id: i,
          projectId: 'test-project',
          title: `OpenSpec Task ${i}`,
          origin: 'openspec',
          status: 'todo',
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).run();
      }

      const openspecTasks = db.select().from(tasks)
        .where(and(
          eq(tasks.projectId, 'test-project'),
          eq(tasks.origin, 'openspec')
        ))
        .all();

      expect(openspecTasks.length).toBeGreaterThanOrEqual(4); // Including first one
      openspecTasks.forEach(task => {
        expect(task.origin).toBe('openspec');
      });
    });
  });

  describe('MoAI Origin Support with TAG Fields', () => {
    it('should characterize: create moai origin task', () => {
      const now = Date.now();
      const taskId = 200;

      db.insert(tasks).values({
        id: taskId,
        projectId: 'test-project',
        title: 'MoAI SPEC Implementation',
        origin: 'moai',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      expect(result).toBeDefined();
      expect(result?.origin).toBe('moai');
    });

    it('should characterize: tag_id field stores TAG identifier', () => {
      const now = Date.now();
      const taskId = 201;

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
      expect(result?.tagId).toBe('TAG-001');
    });

    it('should characterize: tag_scope field stores file paths', () => {
      const now = Date.now();
      const taskId = 202;
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
      expect(result?.tagScope).toBe(scope);
      expect(result?.tagScope?.includes('server/tasks')).toBe(true);
    });

    it('should characterize: tag_dependencies field stores JSON array', () => {
      const now = Date.now();
      const taskId = 203;
      const deps = JSON.stringify(['TAG-001', 'TAG-002', 'TAG-003']);

      db.insert(tasks).values({
        id: taskId,
        projectId: 'test-project',
        title: 'Task with dependencies',
        origin: 'moai',
        tagId: 'TAG-004',
        tagDependencies: deps,
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }).run();

      const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      const parsedDeps = JSON.parse(result?.tagDependencies || '[]');
      expect(parsedDeps).toEqual(['TAG-001', 'TAG-002', 'TAG-003']);
    });

    it('should characterize: TAG fields are optional (nullable)', () => {
      const now = Date.now();
      const taskId = 204;

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
      expect(result?.tagId).toBeNull();
      expect(result?.tagScope).toBeNull();
      expect(result?.tagDependencies).toBeNull();
    });

    it('should characterize: find tasks by tag_id', () => {
      const results = db.select().from(tasks)
        .where(eq(tasks.tagId, 'TAG-001'))
        .all();

      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach(task => {
        expect(task.tagId).toBe('TAG-001');
      });
    });

    it('should characterize: list all moai tasks', () => {
      const moaiTasks = db.select().from(tasks)
        .where(and(
          eq(tasks.projectId, 'test-project'),
          eq(tasks.origin, 'moai')
        ))
        .all();

      expect(moaiTasks.length).toBeGreaterThanOrEqual(5); // Multiple moai tasks created
      moaiTasks.forEach(task => {
        expect(task.origin).toBe('moai');
      });
    });
  });

  describe('specPath Field Support (Changes Table)', () => {
    it('should characterize: specPath supports openspec paths', () => {
      const now = Date.now();

      db.insert(schema.changes).values({
        id: 'change-openspec-001',
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
          eq(schema.changes.id, 'change-openspec-001'),
          eq(schema.changes.projectId, 'test-project')
        ))
        .get();

      expect(result?.specPath).toBe('openspec/changes/change-001/proposal.md');
    });

    it('should characterize: specPath supports .moai/specs/ paths', () => {
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

      expect(result?.specPath).toBe('.moai/specs/SPEC-001/spec.md');
      expect(result?.specPath?.includes('.moai/specs')).toBe(true);
    });

    it('should characterize: specPath is optional', () => {
      const now = Date.now();

      db.insert(schema.changes).values({
        id: 'change-no-path',
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
          eq(schema.changes.id, 'change-no-path'),
          eq(schema.changes.projectId, 'test-project')
        ))
        .get();

      expect(result?.specPath).toBeNull();
    });
  });

  describe('Dual Origin Coexistence', () => {
    it('should characterize: openspec and moai tasks coexist in same project', () => {
      const allTasks = db.select().from(tasks)
        .where(eq(tasks.projectId, 'test-project'))
        .all();

      const openspecTasks = allTasks.filter(t => t.origin === 'openspec');
      const moaiTasks = allTasks.filter(t => t.origin === 'moai');

      expect(openspecTasks.length).toBeGreaterThan(0);
      expect(moaiTasks.length).toBeGreaterThan(0);
    });

    it('should characterize: all origin types supported and coexist', () => {
      const origins = ['inbox', 'openspec', 'moai', 'imported', 'backlog'];

      origins.forEach((origin, idx) => {
        db.insert(tasks).values({
          id: 300 + idx,
          projectId: 'multi-origin-test',
          title: `Test ${origin}`,
          origin: origin as TaskOrigin,
          status: 'todo',
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).run();
      });

      const multiOriginTasks = db.select().from(tasks)
        .where(eq(tasks.projectId, 'multi-origin-test'))
        .all();

      expect(multiOriginTasks.length).toBe(5);

      const foundOrigins = new Set(multiOriginTasks.map(t => t.origin));
      origins.forEach(origin => {
        expect(foundOrigins.has(origin)).toBe(true);
      });
    });
  });

  describe('Type Definitions', () => {
    it('should characterize: TaskOrigin type supports all values', () => {
      const validOrigins = ['openspec', 'moai', 'inbox', 'imported', 'backlog'];

      validOrigins.forEach((origin, idx) => {
        db.insert(tasks).values({
          id: 400 + idx,
          projectId: 'type-test',
          title: `Type test ${origin}`,
          origin: origin as TaskOrigin,
          status: 'todo',
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).run();
      });

      const created = db.select().from(tasks)
        .where(eq(tasks.projectId, 'type-test'))
        .all();

      expect(created.length).toBe(5);
      created.forEach((task, idx) => {
        expect(task.origin).toBe(validOrigins[idx]);
      });
    });
  });
});
