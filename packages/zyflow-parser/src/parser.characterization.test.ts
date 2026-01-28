/**
 * Characterization Tests for @zyflow/parser - parseTasksFile()
 *
 * PURPOSE: Capture the CURRENT behavior of the parser before migration.
 * These tests document what the code actually does, not what it should do.
 * They serve as regression safeguards during the OpenSpec -> MoAI SPEC migration.
 *
 * TAG-001 of SPEC-MIGR-001
 */

import { describe, it, expect } from 'vitest'
import { TasksParser, parseTasksFile } from './parser.js'
import type { ParseResult, LegacyTasksFile } from './types.js'

describe('characterization: parseTasksFile (legacy API)', () => {
  // =========================================================================
  // Behavior: Output structure of LegacyTasksFile
  // =========================================================================
  describe('characterization: output structure matches LegacyTasksFile interface', () => {
    it('characterization: returns object with changeId and groups array', () => {
      const content = `## Tasks

- [ ] First task
- [x] Second task
`
      const result = parseTasksFile('test-change-001', content)

      // The function returns a LegacyTasksFile with exactly these top-level keys
      expect(result).toHaveProperty('changeId')
      expect(result).toHaveProperty('groups')
      expect(result.changeId).toBe('test-change-001')
      expect(Array.isArray(result.groups)).toBe(true)
    })

    it('characterization: each group has legacy fields (id, title, tasks, phaseIndex, groupIndex, majorOrder, etc.)', () => {
      const content = `## Phase 1: Setup

- [ ] Create project
`
      const result = parseTasksFile('struct-test', content)

      expect(result.groups.length).toBeGreaterThan(0)
      const group = result.groups[0]

      // Legacy group fields
      expect(group).toHaveProperty('id')
      expect(group).toHaveProperty('title')
      expect(group).toHaveProperty('tasks')
      expect(group).toHaveProperty('displayId')
      expect(group).toHaveProperty('phaseIndex')
      expect(group).toHaveProperty('groupIndex')
      expect(group).toHaveProperty('majorOrder')
      expect(group).toHaveProperty('majorTitle')
      expect(group).toHaveProperty('subOrder')
      expect(group).toHaveProperty('groupTitle')
      expect(group).toHaveProperty('groupOrder')
    })

    it('characterization: each task in legacy format has id, title, completed, groupId, lineNumber', () => {
      const content = `## Tasks

- [ ] A task
`
      const result = parseTasksFile('task-struct-test', content)
      const task = result.groups[0].tasks[0]

      expect(task).toHaveProperty('id')
      expect(task).toHaveProperty('title')
      expect(task).toHaveProperty('completed')
      expect(task).toHaveProperty('groupId')
      expect(task).toHaveProperty('lineNumber')
      expect(task).toHaveProperty('indent')
      expect(task).toHaveProperty('displayId')
    })
  })

  // =========================================================================
  // Behavior: Standard tasks.md with groups and tasks
  // =========================================================================
  describe('characterization: standard tasks.md with phases and sections', () => {
    const STANDARD_CONTENT = `## Phase 1: Foundation

### 1.1 Database Setup

- [ ] Create schema
- [x] Run migrations
- [ ] Seed test data

### 1.2 API Setup

- [ ] Create routes
- [x] Add middleware

## Phase 2: Features

### 2.1 Authentication

- [ ] Add login
- [x] Add logout
- [ ] Add session management
`

    it('characterization: correctly groups tasks under sections within phases', () => {
      const result = parseTasksFile('standard-test', STANDARD_CONTENT)

      // The parser should create groups for each section that has tasks
      const groupsWithTasks = result.groups.filter((g) => g.tasks.length > 0)
      expect(groupsWithTasks.length).toBe(3)
    })

    it('characterization: phase titles are extracted correctly from "Phase N: Title" format', () => {
      const result = parseTasksFile('phase-title-test', STANDARD_CONTENT)

      // majorTitle should contain the phase name
      const firstGroup = result.groups[0]
      expect(firstGroup.majorTitle).toBe('Foundation')
    })

    it('characterization: section titles are extracted from "N.N Title" format', () => {
      const result = parseTasksFile('section-title-test', STANDARD_CONTENT)

      // Group titles should include the section info
      expect(result.groups[0].title).toBeDefined()
      expect(typeof result.groups[0].title).toBe('string')
    })

    it('characterization: majorOrder is 1-based phase index', () => {
      const result = parseTasksFile('majororder-test', STANDARD_CONTENT)

      // Phase 1 groups should have majorOrder 1
      const phase1Groups = result.groups.filter((g) => g.majorOrder === 1)
      expect(phase1Groups.length).toBeGreaterThan(0)

      // Phase 2 groups should have majorOrder 2
      const phase2Groups = result.groups.filter((g) => g.majorOrder === 2)
      expect(phase2Groups.length).toBeGreaterThan(0)
    })

    it('characterization: groupOrder is sequential across all groups (1-based)', () => {
      const result = parseTasksFile('grouporder-test', STANDARD_CONTENT)

      // groupOrder should be sequential: 1, 2, 3, ...
      for (let i = 0; i < result.groups.length; i++) {
        expect(result.groups[i].groupOrder).toBe(i + 1)
      }
    })

    it('characterization: subOrder is the section index within phase (1-based)', () => {
      const result = parseTasksFile('suborder-test', STANDARD_CONTENT)

      // First section in phase 1 should have subOrder 1
      expect(result.groups[0].subOrder).toBe(1)
      // Second section in phase 1 should have subOrder 2
      expect(result.groups[1].subOrder).toBe(2)
      // First section in phase 2 should have subOrder 1
      expect(result.groups[2].subOrder).toBe(1)
    })
  })

  // =========================================================================
  // Behavior: Status extraction (pending, complete, in_progress patterns)
  // =========================================================================
  describe('characterization: task completion status extraction', () => {
    it('characterization: "[ ]" is parsed as completed=false (pending)', () => {
      const content = `## Tasks

- [ ] Pending task
`
      const result = parseTasksFile('pending-test', content)
      expect(result.groups[0].tasks[0].completed).toBe(false)
    })

    it('characterization: "[x]" is parsed as completed=true', () => {
      const content = `## Tasks

- [x] Completed task
`
      const result = parseTasksFile('complete-test', content)
      expect(result.groups[0].tasks[0].completed).toBe(true)
    })

    it('characterization: "[X]" (uppercase) is also parsed as completed=true', () => {
      const content = `## Tasks

- [X] Completed with uppercase
`
      const result = parseTasksFile('uppercase-test', content)
      expect(result.groups[0].tasks[0].completed).toBe(true)
    })

    it('characterization: parser only recognizes space and x/X as checkbox markers', () => {
      const content = `## Tasks

- [ ] Valid pending
- [x] Valid complete
- [?] Invalid checkbox
- [] Missing space in brackets
`
      const result = parseTasksFile('checkbox-test', content)

      // Only valid checkboxes should be parsed as tasks
      const tasks = result.groups[0]?.tasks || []
      // "[?]" and "[]" should NOT produce tasks
      expect(tasks.length).toBe(2)
      expect(tasks[0].title).toBe('Valid pending')
      expect(tasks[1].title).toBe('Valid complete')
    })
  })

  // =========================================================================
  // Behavior: Edge cases
  // =========================================================================
  describe('characterization: edge cases', () => {
    it('characterization: empty string returns empty groups array', () => {
      const result = parseTasksFile('empty-test', '')

      expect(result.changeId).toBe('empty-test')
      expect(result.groups).toHaveLength(0)
    })

    it('characterization: content with only headers (no tasks) returns empty groups', () => {
      const content = `## Section A

Some text here.

## Section B

More text.
`
      const result = parseTasksFile('no-tasks-test', content)
      expect(result.groups).toHaveLength(0)
    })

    it('characterization: title-only markdown (# header) is skipped', () => {
      const content = `# Main Title

## Phase 1: Tasks

- [ ] First task
`
      const result = parseTasksFile('title-skip-test', content)

      // The # header should be ignored, only ## and below are processed
      expect(result.groups.length).toBeGreaterThan(0)
    })

    it('characterization: tasks without a preceding group header are not captured', () => {
      // If there is no ## header before tasks, the parser has no group context
      const content = `- [ ] Orphan task 1
- [ ] Orphan task 2
`
      const result = parseTasksFile('orphan-test', content)

      // Without a ## header, no group is created, so tasks are lost
      expect(result.groups).toHaveLength(0)
    })

    it('characterization: groups with zero tasks are filtered out', () => {
      const content = `## Empty Section

## Section With Tasks

- [ ] Task 1

## Another Empty Section
`
      const result = parseTasksFile('filter-empty-test', content)

      // Only groups containing tasks should appear
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].tasks[0].title).toBe('Task 1')
    })

    it('characterization: task-N-N prefix in title is stripped', () => {
      const content = `## Tasks

- [ ] task-1-1: Create component
- [ ] task-1-2: Add tests
`
      const result = parseTasksFile('prefix-strip-test', content)

      // The parser strips "task-N-N:" prefixes from task titles
      expect(result.groups[0].tasks[0].title).toBe('Create component')
      expect(result.groups[0].tasks[1].title).toBe('Add tests')
    })

    it('characterization: whitespace-only lines are skipped', () => {
      const content = `## Tasks


- [ ] Task after whitespace

`
      const result = parseTasksFile('whitespace-test', content)

      expect(result.groups[0].tasks.length).toBe(1)
      expect(result.groups[0].tasks[0].title).toBe('Task after whitespace')
    })
  })

  // =========================================================================
  // Behavior: parseTasksFile is a wrapper around TasksParser.parseLegacy
  // =========================================================================
  describe('characterization: parseTasksFile wraps TasksParser.parseLegacy', () => {
    it('characterization: parseTasksFile output matches TasksParser.parseLegacy output', () => {
      const content = `## Phase 1: Test

- [ ] Task A
- [x] Task B
`
      const legacyResult = parseTasksFile('wrapper-test', content)
      const parser = new TasksParser()
      const directResult = parser.parseLegacy('wrapper-test', content)

      expect(legacyResult.changeId).toBe(directResult.changeId)
      expect(legacyResult.groups.length).toBe(directResult.groups.length)
      expect(legacyResult.groups[0].tasks.length).toBe(directResult.groups[0].tasks.length)
    })
  })
})

describe('characterization: TasksParser.parse (new API)', () => {
  const parser = new TasksParser()

  // =========================================================================
  // Behavior: ParseResult structure
  // =========================================================================
  describe('characterization: ParseResult output structure', () => {
    it('characterization: ParseResult has changeId, phases, groups, and metadata', () => {
      const content = `## Phase 1: Setup

- [ ] Task 1
`
      const result = parser.parse('struct-test', content)

      expect(result).toHaveProperty('changeId')
      expect(result).toHaveProperty('phases')
      expect(result).toHaveProperty('groups')
      expect(result).toHaveProperty('metadata')
      expect(Array.isArray(result.phases)).toBe(true)
      expect(Array.isArray(result.groups)).toBe(true)
    })

    it('characterization: metadata contains totalTasks, completedTasks, totalGroups, format, parseTime, warnings', () => {
      const content = `## Tasks

- [ ] A
- [x] B
- [ ] C
`
      const result = parser.parse('metadata-test', content)
      const { metadata } = result

      expect(metadata.totalTasks).toBe(3)
      expect(metadata.completedTasks).toBe(1)
      expect(metadata.totalGroups).toBe(1)
      expect(metadata.format).toBe('openspec-1.0')
      expect(typeof metadata.parseTime).toBe('number')
      expect(metadata.parseTime).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(metadata.warnings)).toBe(true)
    })
  })

  // =========================================================================
  // Behavior: toSyncTasks conversion
  // =========================================================================
  describe('characterization: toSyncTasks produces SyncTask array for DB sync', () => {
    it('characterization: SyncTask fields map correctly for DB columns', () => {
      const content = `## Phase 1: Foundation

### 1.1 Database

- [ ] Create schema
- [x] Run migrations
`
      const result = parser.parse('sync-test', content)
      const syncTasks = parser.toSyncTasks(result)

      expect(syncTasks.length).toBe(2)

      const firstTask = syncTasks[0]
      expect(firstTask).toHaveProperty('displayId')
      expect(firstTask).toHaveProperty('title')
      expect(firstTask).toHaveProperty('completed')
      expect(firstTask).toHaveProperty('lineNumber')
      expect(firstTask).toHaveProperty('groupTitle')
      expect(firstTask).toHaveProperty('groupOrder')
      expect(firstTask).toHaveProperty('taskOrder')
      expect(firstTask).toHaveProperty('majorTitle')
      expect(firstTask).toHaveProperty('majorOrder')
      expect(firstTask).toHaveProperty('subOrder')

      expect(firstTask.title).toBe('Create schema')
      expect(firstTask.completed).toBe(false)
      // groupOrder is 1-based globalIndex + 1
      expect(firstTask.groupOrder).toBeGreaterThanOrEqual(1)
      // taskOrder is 1-based index within group
      expect(firstTask.taskOrder).toBe(1)
      expect(syncTasks[1].taskOrder).toBe(2)
      // majorOrder is 1-based phaseIndex + 1
      expect(firstTask.majorOrder).toBe(1)
      // subOrder is 1-based sectionIndex + 1
      expect(firstTask.subOrder).toBe(1)
    })
  })

  // =========================================================================
  // Behavior: Content hash generation
  // =========================================================================
  describe('characterization: content hash for stable task identification', () => {
    it('characterization: contentHash is an 8-character hex string', () => {
      const content = `## Tasks

- [ ] Some task
`
      const result = parser.parse('hash-len-test', content)
      const hash = result.groups[0].tasks[0].contentHash

      expect(hash).toBeDefined()
      expect(hash.length).toBe(8)
      expect(/^[0-9a-f]{8}$/.test(hash)).toBe(true)
    })

    it('characterization: hash is derived from groupTitle::taskTitle', () => {
      const content = `## Tasks

- [ ] Same Task
`
      const result1 = parser.parse('hash-stable-1', content)
      const result2 = parser.parse('hash-stable-2', content)

      // Same group title + task title = same hash regardless of changeId
      expect(result1.groups[0].tasks[0].contentHash).toBe(
        result2.groups[0].tasks[0].contentHash
      )
    })

    it('characterization: different tasks in same group produce different hashes', () => {
      const content = `## Tasks

- [ ] Task A
- [ ] Task B
`
      const result = parser.parse('hash-diff-test', content)
      const hashA = result.groups[0].tasks[0].contentHash
      const hashB = result.groups[0].tasks[1].contentHash

      expect(hashA).not.toBe(hashB)
    })
  })

  // =========================================================================
  // Behavior: Subtask/indent handling
  // =========================================================================
  describe('characterization: subtask indent behavior', () => {
    it('characterization: indented tasks (2+ spaces) are recognized as subtasks', () => {
      const content = `## Tasks

- [ ] Parent task
  - [ ] Child task
`
      const result = parser.parse('subtask-test', content)

      // Both should be in the same group
      expect(result.groups[0].tasks.length).toBe(2)
      expect(result.groups[0].tasks[0].indent).toBe(0)
      expect(result.groups[0].tasks[1].indent).toBe(2)
    })

    it('characterization: subtask gets parentTaskIndex pointing to nearest parent', () => {
      const content = `## Tasks

- [ ] Parent
  - [ ] Child
    - [ ] Grandchild
`
      const result = parser.parse('parent-index-test', content)
      const tasks = result.groups[0].tasks

      // Parent has no parentTaskIndex
      expect(tasks[0].parentTaskIndex).toBeUndefined()
      // Child points to parent (index 0)
      expect(tasks[1].parentTaskIndex).toBe(0)
      // Grandchild points to child (index 1)
      expect(tasks[2].parentTaskIndex).toBe(1)
    })
  })

  // =========================================================================
  // Behavior: Implicit section creation
  // =========================================================================
  describe('characterization: implicit section when phase has no explicit section', () => {
    it('characterization: tasks directly under ## phase get an implicit section group', () => {
      const content = `## Phase 1: Direct Tasks

- [ ] Task without section
- [ ] Another task
`
      const result = parser.parse('implicit-test', content)

      // An implicit group should be created with the phase title
      expect(result.groups.length).toBe(1)
      expect(result.groups[0].level).toBe('phase')
      expect(result.groups[0].title).toBe('Direct Tasks')
    })
  })
})
