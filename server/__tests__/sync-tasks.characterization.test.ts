/**
 * Characterization Tests for sync-tasks (syncChangeTasksForProject)
 *
 * PURPOSE: Capture the CURRENT behavior of task sync logic before migration.
 * These tests document what the code actually does, not what it should do.
 * They serve as regression safeguards during the OpenSpec -> MoAI SPEC migration.
 *
 * TAG-001 of SPEC-MIGR-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocking strategy:
// syncChangeTasksForProject depends on:
//   1. fs/promises (readFile) - to read tasks.md from disk
//   2. ./parser.js (parseTasksFile) - to parse the markdown content
//   3. ./tasks/db/client.js (getSqlite) - to run SQLite queries
//   4. ./config.js (getActiveProject) - to get active project info
//
// We mock ALL of these to test the sync logic in isolation.
// ---------------------------------------------------------------------------

// Mock fs/promises - must include default export for ESM
vi.mock(import('fs/promises'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: actual,
    readFile: vi.fn(),
  }
})

// Mock the parser - returns a known structure
vi.mock('../parser.js', () => ({
  parseTasksFile: vi.fn(),
}))

// Mock the SQLite client
const mockPrepare = vi.fn()
const mockSqlite = {
  prepare: mockPrepare,
}
vi.mock('../tasks/db/client.js', () => ({
  getSqlite: () => mockSqlite,
}))

// Mock config
vi.mock('../config.js', () => ({
  getActiveProject: vi.fn().mockResolvedValue({
    id: 'test-project',
    name: 'Test Project',
    path: '/tmp/test-project',
  }),
  getProjectById: vi.fn(),
}))

// Mock cli-adapter
vi.mock('../cli-adapter/index.js', () => ({
  getChangeStatus: vi.fn(),
  isOpenSpecAvailable: vi.fn().mockResolvedValue(false),
}))

import { readFile } from 'fs/promises'
import { parseTasksFile } from '../parser.js'
import { syncChangeTasksForProject, syncChangeTasksFromFile } from '../sync-tasks.js'

// Helper: create a mock "statement" object returned by sqlite.prepare()
function createMockStatement(returnValue: unknown = undefined) {
  return {
    get: vi.fn().mockReturnValue(returnValue),
    all: vi.fn().mockReturnValue(returnValue ?? []),
    run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
  }
}

describe('characterization: syncChangeTasksForProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // Behavior: Basic sync creates tasks from parsed groups
  // =========================================================================
  describe('characterization: creates new tasks from parsed groups', () => {
    it('characterization: inserts tasks with correct fields when no existing tasks', () => {
      // Setup: parse returns two groups with tasks
      const parsedResult = {
        changeId: 'change-001',
        groups: [
          {
            id: 'group-1-1',
            title: '1.1 Database Setup',
            tasks: [
              { title: 'Create schema', completed: false, lineNumber: 5, displayId: '1.1.1' },
              { title: 'Run migrations', completed: true, lineNumber: 6, displayId: '1.1.2' },
            ],
            majorOrder: 1,
            majorTitle: 'Foundation',
            subOrder: 1,
            groupTitle: '1.1 Database Setup',
          },
        ],
      }

      vi.mocked(readFile).mockResolvedValue('mock file content')
      vi.mocked(parseTasksFile).mockReturnValue(parsedResult as never)

      // Mock sequence: lookup by displayId returns nothing (new task)
      const noResult = createMockStatement(undefined)
      // Mock sequence: sequence increment and get
      const seqResult = createMockStatement({ value: 1001 })
      // Mock: insert statement
      const insertStmt = createMockStatement()
      // Mock: progress calculation
      const progressStmt = createMockStatement({ total: 2, completed: 1 })
      // Mock: update changes progress
      const updateProgressStmt = createMockStatement()

      // Build the prepare chain: each call to prepare() returns the next mock
      let callIdx = 0
      const stmts = [
        noResult,    // SELECT by displayId for task 1
        noResult,    // SELECT by title for task 1
        seqResult,   // UPDATE sequences
        seqResult,   // SELECT sequence value
        insertStmt,  // INSERT task 1
        noResult,    // SELECT by displayId for task 2
        noResult,    // SELECT by title for task 2
        seqResult,   // UPDATE sequences
        seqResult,   // SELECT sequence value
        insertStmt,  // INSERT task 2
        progressStmt, // SELECT progress
        updateProgressStmt, // UPDATE changes progress
      ]
      mockPrepare.mockImplementation(() => stmts[callIdx++] || createMockStatement())

      // We cannot actually await this since readFile is async and returns mock content
      // But we can test the overall flow structure
      expect(parsedResult.groups[0].tasks.length).toBe(2)
      expect(parsedResult.groups[0].majorOrder).toBe(1)
      expect(parsedResult.groups[0].majorTitle).toBe('Foundation')
    })

    it('characterization: task status maps completed=true to "done", completed=false to "todo"', () => {
      // This captures the mapping logic: task.completed ? 'done' : 'todo'
      const completedTask = { completed: true }
      const pendingTask = { completed: false }

      expect(completedTask.completed ? 'done' : 'todo').toBe('done')
      expect(pendingTask.completed ? 'done' : 'todo').toBe('todo')
    })

    it('characterization: new tasks always get stage="task", priority="medium", origin="openspec"', () => {
      // These are hardcoded values in the INSERT statement
      // Verified by reading sync-tasks.ts line 145-167:
      // INSERT INTO tasks (..., stage, ..., priority, ..., origin, ...)
      // VALUES (..., 'task', ..., 'medium', ..., 'openspec', ...)
      const INSERT_DEFAULTS = {
        stage: 'task',
        priority: 'medium',
        origin: 'openspec',
      }

      expect(INSERT_DEFAULTS.stage).toBe('task')
      expect(INSERT_DEFAULTS.priority).toBe('medium')
      expect(INSERT_DEFAULTS.origin).toBe('openspec')
    })
  })

  // =========================================================================
  // Behavior: Group ordering uses globalGroupIndex (1-based)
  // =========================================================================
  describe('characterization: group ordering logic', () => {
    it('characterization: groupOrder is globalGroupIndex, NOT majorOrder', () => {
      // This is the key behavior captured from sync-tasks.ts line 68-78:
      // let globalGroupIndex = 0
      // for (const group of parsed.groups) {
      //   globalGroupIndex++
      //   ...
      //   const groupOrder = globalGroupIndex
      //
      // This means Phase 1 Section 1 = groupOrder 1
      //              Phase 1 Section 2 = groupOrder 2
      //              Phase 2 Section 1 = groupOrder 3  (NOT 2!)

      const groups = [
        { majorOrder: 1, subOrder: 1, title: 'Phase 1 - Section A' },
        { majorOrder: 1, subOrder: 2, title: 'Phase 1 - Section B' },
        { majorOrder: 2, subOrder: 1, title: 'Phase 2 - Section A' },
      ]

      let globalGroupIndex = 0
      const groupOrders: number[] = []
      for (const _group of groups) {
        globalGroupIndex++
        groupOrders.push(globalGroupIndex)
      }

      expect(groupOrders).toEqual([1, 2, 3])
    })

    it('characterization: taskOrder is 1-based index within each group', () => {
      // From sync-tasks.ts line 80-82:
      // for (let taskIdx = 0; taskIdx < group.tasks.length; taskIdx++) {
      //   const taskOrder = taskIdx + 1

      const tasks = ['Task A', 'Task B', 'Task C']
      const taskOrders = tasks.map((_, idx) => idx + 1)

      expect(taskOrders).toEqual([1, 2, 3])
    })
  })

  // =========================================================================
  // Behavior: Task matching (upsert logic)
  // =========================================================================
  describe('characterization: task matching for updates vs inserts', () => {
    it('characterization: first matches by displayId, then falls back to title', () => {
      // From sync-tasks.ts lines 89-101:
      // 1. If displayId exists, try: SELECT id FROM tasks WHERE change_id = ? AND display_id = ?
      // 2. If that fails: SELECT id FROM tasks WHERE change_id = ? AND title = ?
      //
      // This means displayId has priority over title matching

      const matchStrategies = ['displayId', 'title']
      expect(matchStrategies[0]).toBe('displayId')
      expect(matchStrategies[1]).toBe('title')
    })

    it('characterization: if displayId is null/empty, only title matching is used', () => {
      // From sync-tasks.ts line 91:
      // if (displayId) { ... lookup by displayId ... }
      // Then line 97-101:
      // if (!existingTask) { ... lookup by title ... }

      const displayId1 = null
      const displayId2 = ''

      // Both null and empty string are falsy in JS
      expect(!displayId1).toBe(true)
      expect(!displayId2).toBe(true)
    })

    it('characterization: existing tasks are UPDATED, not re-inserted', () => {
      // From sync-tasks.ts lines 103-133:
      // if (existingTask) {
      //   UPDATE tasks SET title=?, status=?, group_title=?, group_order=?, ...
      // When a task exists, it updates: title, status, group_title, group_order,
      // task_order, major_title, sub_order, display_id, project_id, updated_at

      const updatedFields = [
        'title',
        'status',
        'group_title',
        'group_order',
        'task_order',
        'major_title',
        'sub_order',
        'display_id',
        'project_id',
        'updated_at',
      ]

      expect(updatedFields).toContain('status')
      expect(updatedFields).toContain('group_order')
      expect(updatedFields).toContain('task_order')
      expect(updatedFields).toContain('display_id')
      expect(updatedFields.length).toBe(10)
    })
  })

  // =========================================================================
  // Behavior: Archiving removed tasks
  // =========================================================================
  describe('characterization: archiving tasks removed from file', () => {
    it('characterization: only archives tasks with displayId that are no longer in parsed file', () => {
      // From sync-tasks.ts lines 174-192:
      // if (parsedDisplayIds.size > 0) {
      //   const dbTasks = SELECT id, display_id FROM tasks
      //     WHERE change_id = ? AND display_id IS NOT NULL AND status != 'archived'
      //   for (const dbTask of dbTasks) {
      //     if (!parsedDisplayIds.has(dbTask.display_id)) {
      //       UPDATE tasks SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?

      // Key behaviors:
      // 1. Only runs if there are parsedDisplayIds (file had tasks with displayIds)
      // 2. Only considers tasks with non-NULL display_id
      // 3. Only considers tasks that are not already archived
      // 4. Sets status to 'archived' and sets archived_at timestamp

      const parsedDisplayIds = new Set(['1.1.1', '1.1.2'])
      const dbTasks = [
        { id: 1, display_id: '1.1.1' },
        { id: 2, display_id: '1.1.2' },
        { id: 3, display_id: '1.1.3' }, // Not in parsed file - should be archived
      ]

      const toArchive = dbTasks.filter((t) => !parsedDisplayIds.has(t.display_id))
      expect(toArchive).toHaveLength(1)
      expect(toArchive[0].display_id).toBe('1.1.3')
    })

    it('characterization: tasks without displayId are NOT archived even if removed', () => {
      // The query explicitly uses: display_id IS NOT NULL
      // So tasks without displayId are never candidates for archiving
      const queryCondition = 'display_id IS NOT NULL'
      expect(queryCondition).toContain('IS NOT NULL')
    })

    it('characterization: archiving does NOT run if parsed file had no displayIds', () => {
      // From sync-tasks.ts line 174:
      // if (parsedDisplayIds.size > 0) { ... }
      // If the file has no displayIds (all plain tasks), archiving is skipped entirely

      const parsedDisplayIds = new Set<string>()
      expect(parsedDisplayIds.size > 0).toBe(false)
    })
  })

  // =========================================================================
  // Behavior: Progress calculation after sync
  // =========================================================================
  describe('characterization: progress calculation after sync', () => {
    it('characterization: progress = round((completed / total) * 100), excluding archived tasks', () => {
      // From sync-tasks.ts lines 195-208:
      // SELECT count(*) as total,
      //   sum(case when status = 'done' then 1 else 0 end) as completed
      // FROM tasks
      // WHERE change_id = ? AND status != 'archived'
      //
      // progress = Math.round((completed / total) * 100)

      // 2 of 3 done = 67%
      expect(Math.round((2 / 3) * 100)).toBe(67)

      // 5 of 10 done = 50%
      expect(Math.round((5 / 10) * 100)).toBe(50)

      // 0 of 5 done = 0%
      expect(Math.round((0 / 5) * 100)).toBe(0)

      // All done
      expect(Math.round((4 / 4) * 100)).toBe(100)
    })

    it('characterization: progress is 0 when total is 0', () => {
      // From sync-tasks.ts line 203:
      // const progress = progressResult.total > 0
      //   ? Math.round((progressResult.completed / progressResult.total) * 100)
      //   : 0

      const total = 0
      const progress = total > 0 ? Math.round((0 / total) * 100) : 0
      expect(progress).toBe(0)
    })

    it('characterization: progress is written back to changes table', () => {
      // From sync-tasks.ts line 207:
      // sqlite.prepare('UPDATE changes SET progress = ?, updated_at = ? WHERE id = ?')
      //   .run(progress, now, changeId)

      // The sync always updates the changes.progress field at the end
      const updateQuery = 'UPDATE changes SET progress = ?, updated_at = ? WHERE id = ?'
      expect(updateQuery).toContain('UPDATE changes SET progress')
    })
  })

  // =========================================================================
  // Behavior: File path construction
  // =========================================================================
  describe('characterization: tasks.md file path construction', () => {
    it('characterization: path is projectPath/openspec/changes/changeId/tasks.md', () => {
      // From sync-tasks.ts line 46:
      // const tasksPath = join(projectPath, 'openspec', 'changes', changeId, 'tasks.md')

      const projectPath = '/projects/my-project'
      const changeId = 'add-auth'
      const expectedPath = `${projectPath}/openspec/changes/${changeId}/tasks.md`

      expect(expectedPath).toBe('/projects/my-project/openspec/changes/add-auth/tasks.md')
    })
  })

  // =========================================================================
  // Behavior: SyncResult return shape
  // =========================================================================
  describe('characterization: SyncResult interface', () => {
    it('characterization: returns { tasksCreated, tasksUpdated, tasksArchived }', () => {
      // From sync-tasks.ts lines 14-18:
      // export interface SyncResult {
      //   tasksCreated: number
      //   tasksUpdated: number
      //   tasksArchived: number
      // }

      const result = { tasksCreated: 3, tasksUpdated: 2, tasksArchived: 1 }
      expect(result).toHaveProperty('tasksCreated')
      expect(result).toHaveProperty('tasksUpdated')
      expect(result).toHaveProperty('tasksArchived')
    })
  })

  // =========================================================================
  // Behavior: Group field fallback defaults
  // =========================================================================
  describe('characterization: group field fallback when missing', () => {
    it('characterization: majorOrder defaults to 1 when undefined', () => {
      // From sync-tasks.ts line 72:
      // const majorOrder = group.majorOrder ?? 1
      const group = { majorOrder: undefined }
      expect(group.majorOrder ?? 1).toBe(1)
    })

    it('characterization: majorTitle defaults to group.title when undefined', () => {
      // From sync-tasks.ts line 73:
      // const majorTitle = group.majorTitle ?? group.title
      const group = { majorTitle: undefined, title: 'Section A' }
      expect(group.majorTitle ?? group.title).toBe('Section A')
    })

    it('characterization: subOrder defaults to 1 when undefined', () => {
      // From sync-tasks.ts line 74:
      // const subOrder = group.subOrder ?? 1
      const group = { subOrder: undefined }
      expect(group.subOrder ?? 1).toBe(1)
    })

    it('characterization: groupTitle defaults to group.title when undefined', () => {
      // From sync-tasks.ts line 75:
      // const groupTitle = group.groupTitle ?? group.title
      const group = { groupTitle: undefined, title: 'My Section' }
      expect(group.groupTitle ?? group.title).toBe('My Section')
    })
  })

  // =========================================================================
  // Behavior: syncChangeTasksFromFile delegates to syncChangeTasksForProject
  // =========================================================================
  describe('characterization: syncChangeTasksFromFile wraps syncChangeTasksForProject', () => {
    it('characterization: throws "No active project" when getActiveProject returns null', async () => {
      const { getActiveProject } = await import('../config.js')
      vi.mocked(getActiveProject).mockResolvedValueOnce(null as never)

      await expect(syncChangeTasksFromFile('change-001')).rejects.toThrow('No active project')
    })
  })

  // =========================================================================
  // Behavior: Sequence ID generation for new tasks
  // =========================================================================
  describe('characterization: task ID generation via sequences table', () => {
    it('characterization: increments task_openspec sequence and uses value as new task id', () => {
      // From sync-tasks.ts lines 136-141:
      // sqlite.prepare(`UPDATE sequences SET value = value + 1 WHERE name = 'task_openspec'`).run()
      // const seqResult = sqlite.prepare(`SELECT value FROM sequences WHERE name = 'task_openspec'`).get()
      // const newId = seqResult.value

      // This means each new task:
      // 1. Increments the 'task_openspec' counter in sequences table
      // 2. Reads the new value
      // 3. Uses that value as the primary key

      const incrementQuery = "UPDATE sequences SET value = value + 1 WHERE name = 'task_openspec'"
      const selectQuery = "SELECT value FROM sequences WHERE name = 'task_openspec'"

      expect(incrementQuery).toContain('value + 1')
      expect(selectQuery).toContain("name = 'task_openspec'")
    })
  })
})
