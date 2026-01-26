import { describe, it, expect } from 'vitest'
import { TasksParser, parseTasksFile } from './parser.js'
import { LegacyIdResolver } from './id-resolver.js'
import { setTaskStatus, toggleTaskStatus, markTasksComplete, markTasksIncomplete } from './status.js'

describe('@zyflow/parser', () => {
  describe('TasksParser', () => {
    const parser = new TasksParser()

    describe('basic parsing', () => {
      it('parses simple tasks.md content', () => {
        const content = `## Phase 1: Setup

- [ ] Create project structure
- [x] Install dependencies
`
        const result = parser.parse('test-change', content)

        expect(result.changeId).toBe('test-change')
        expect(result.groups).toHaveLength(1)
        expect(result.groups[0].tasks).toHaveLength(2)
        expect(result.metadata.totalTasks).toBe(2)
        expect(result.metadata.completedTasks).toBe(1)
      })

      it('parses Phase N: format correctly', () => {
        const content = `## Phase 1: Planning

- [ ] Define requirements

## Phase 2: Development

- [ ] Build features
`
        const result = parser.parse('phase-test', content)

        expect(result.groups).toHaveLength(2)
        expect(result.groups[0].title).toBe('Planning')
        expect(result.groups[1].title).toBe('Development')
        expect(result.groups[0].phaseIndex).toBe(0)
        expect(result.groups[1].phaseIndex).toBe(1)
      })

      it('parses numbered section format', () => {
        const content = `## 1. Main Section

### 1.1 Subsection A

- [ ] Task A1
- [ ] Task A2

### 1.2 Subsection B

- [ ] Task B1
`
        const result = parser.parse('numbered-test', content)

        expect(result.groups.length).toBeGreaterThanOrEqual(2)
        // Should have tasks in subsections
        const tasksGroups = result.groups.filter(g => g.tasks.length > 0)
        expect(tasksGroups.length).toBeGreaterThanOrEqual(2)
      })

      it('parses plain section format', () => {
        const content = `## Setup Tasks

- [ ] Initialize project
- [ ] Configure tools

## Implementation Tasks

- [ ] Build API
`
        const result = parser.parse('plain-test', content)

        expect(result.groups).toHaveLength(2)
        expect(result.groups[0].title).toBe('Setup Tasks')
        expect(result.groups[1].title).toBe('Implementation Tasks')
      })
    })

    describe('task parsing', () => {
      it('correctly identifies completed tasks', () => {
        const content = `## Tasks

- [ ] Incomplete task
- [x] Completed task
- [X] Also completed
`
        const result = parser.parse('status-test', content)

        expect(result.groups[0].tasks[0].completed).toBe(false)
        expect(result.groups[0].tasks[1].completed).toBe(true)
        expect(result.groups[0].tasks[2].completed).toBe(true)
      })

      it('ignores task-N-N prefixes in titles', () => {
        const content = `## Tasks

- [ ] task-1-1: Create component
- [ ] task-1-2: Add tests
`
        const result = parser.parse('prefix-test', content)

        expect(result.groups[0].tasks[0].title).toBe('Create component')
        expect(result.groups[0].tasks[1].title).toBe('Add tests')
      })

      it('preserves titles with numeric prefixes', () => {
        const content = `## Tasks

- [ ] 1.1 First task
- [ ] 1.2 Second task
`
        const result = parser.parse('numeric-prefix-test', content)

        // Parser preserves numeric prefixes in titles (user's formatting choice)
        expect(result.groups[0].tasks[0].title).toBe('1.1 First task')
        expect(result.groups[0].tasks[1].title).toBe('1.2 Second task')
      })

      it('tracks line numbers correctly', () => {
        const content = `## Tasks

- [ ] Task on line 3
- [ ] Task on line 4
`
        const result = parser.parse('line-test', content)

        expect(result.groups[0].tasks[0].lineNumber).toBe(3)
        expect(result.groups[0].tasks[1].lineNumber).toBe(4)
      })
    })

    describe('displayId generation', () => {
      it('generates sequential displayIds', () => {
        const content = `## Phase 1: First

- [ ] Task 1
- [ ] Task 2

## Phase 2: Second

- [ ] Task 3
`
        const result = parser.parse('displayid-test', content)

        // Check group displayIds
        expect(result.groups[0].displayId).toBe('1.1')
        expect(result.groups[1].displayId).toBe('2.1')

        // Check task displayIds
        expect(result.groups[0].tasks[0].displayId).toBe('1.1.1')
        expect(result.groups[0].tasks[1].displayId).toBe('1.1.2')
        expect(result.groups[1].tasks[0].displayId).toBe('2.1.1')
      })
    })

    describe('contentHash generation', () => {
      it('generates unique content hashes', () => {
        const content = `## Tasks

- [ ] Task A
- [ ] Task B
`
        const result = parser.parse('hash-test', content)

        const hash1 = result.groups[0].tasks[0].contentHash
        const hash2 = result.groups[0].tasks[1].contentHash

        expect(hash1).toBeDefined()
        expect(hash2).toBeDefined()
        expect(hash1).not.toBe(hash2)
      })

      it('generates consistent hashes for same content', () => {
        const content = `## Tasks

- [ ] Same Task
`
        const result1 = parser.parse('hash-test-1', content)
        const result2 = parser.parse('hash-test-2', content)

        expect(result1.groups[0].tasks[0].contentHash)
          .toBe(result2.groups[0].tasks[0].contentHash)
      })
    })

    describe('metadata tracking', () => {
      it('tracks task statistics', () => {
        const content = `## Tasks

- [x] Done 1
- [x] Done 2
- [ ] Pending 1
- [ ] Pending 2
- [ ] Pending 3
`
        const result = parser.parse('stats-test', content)

        expect(result.metadata.totalTasks).toBe(5)
        expect(result.metadata.completedTasks).toBe(2)
      })

      it('records parse time', () => {
        const content = `## Tasks

- [ ] Single task
`
        const result = parser.parse('time-test', content)

        expect(result.metadata.parseTime).toBeDefined()
        expect(result.metadata.parseTime).toBeGreaterThanOrEqual(0)
      })

      it('detects format type', () => {
        const content = `## Phase 1: Test

- [ ] Task
`
        const result = parser.parse('format-test', content)

        expect(result.metadata.format).toBe('openspec-1.0')
      })
    })

    describe('edge cases', () => {
      it('handles empty content', () => {
        const result = parser.parse('empty-test', '')

        expect(result.groups).toHaveLength(0)
        expect(result.metadata.totalTasks).toBe(0)
      })

      it('handles content with no tasks', () => {
        const content = `## Section Without Tasks

Just some text here.

## Another Section

More text.
`
        const result = parser.parse('no-tasks-test', content)

        expect(result.groups).toHaveLength(0)
        expect(result.metadata.totalTasks).toBe(0)
      })

      it('handles malformed task lines', () => {
        const content = `## Tasks

- [ ] Valid task
- [?] Invalid checkbox
- [] Missing space
- [ ] Another valid task
`
        const result = parser.parse('malformed-test', content)

        // Should only parse valid tasks
        const validTasks = result.groups[0]?.tasks || []
        expect(validTasks.length).toBeGreaterThanOrEqual(2)
      })

      it('filters empty groups', () => {
        const content = `## Empty Section

## Section With Tasks

- [ ] Task 1

## Another Empty Section
`
        const result = parser.parse('filter-empty-test', content)

        // Only groups with tasks should be included
        expect(result.groups).toHaveLength(1)
        expect(result.groups[0].title).toBe('Section With Tasks')
      })
    })
  })

  describe('LegacyIdResolver', () => {
    const content = `## Phase 1: Tasks

- [ ] First task
- [ ] Second task

## Phase 2: More Tasks

- [ ] Third task
`
    const parser = new TasksParser()
    const result = parser.parse('legacy-test', content)
    const resolver = new LegacyIdResolver(result)

    describe('internal ID resolution', () => {
      it('resolves by internal task ID', () => {
        const resolved = resolver.resolve('task-1-1')
        expect(resolved).not.toBeNull()
        expect(resolved?.task.title).toBe('First task')
      })

      it('resolves task by internal ID', () => {
        // LegacyIdResolver focuses on task resolution, not group-only resolution
        const resolved = resolver.resolve('task-1-2')
        expect(resolved).not.toBeNull()
        expect(resolved?.task.title).toBe('Second task')
      })
    })

    describe('displayId resolution', () => {
      it('resolves by task displayId', () => {
        const resolved = resolver.resolve('1.1.1')
        expect(resolved).not.toBeNull()
        expect(resolved?.task.title).toBe('First task')
      })

      it('resolves task by full displayId', () => {
        // Resolver expects full task displayId (X.X.X), not group displayId
        const resolved = resolver.resolve('1.1.2')
        expect(resolved).not.toBeNull()
        expect(resolved?.task.title).toBe('Second task')
      })
    })

    describe('legacy format resolution', () => {
      it('resolves task-group-N-M format', () => {
        const resolved = resolver.resolve('task-group-1-2')
        expect(resolved).not.toBeNull()
        expect(resolved?.task.title).toBe('Second task')
      })

      it('resolves task-N-M legacy format', () => {
        const resolved = resolver.resolve('task-1-1')
        expect(resolved).not.toBeNull()
        expect(resolved?.task.title).toBe('First task')
      })
    })

    describe('title-based resolution', () => {
      it('resolves by exact title match', () => {
        const resolved = resolver.resolveByTitle('First task')
        expect(resolved).not.toBeNull()
        expect(resolved?.task.title).toBe('First task')
      })

      it('resolves by partial title match', () => {
        const resolved = resolver.resolveByTitle('Second')
        expect(resolved).not.toBeNull()
        expect(resolved?.task.title).toContain('Second')
      })

      it('returns null for non-existent title', () => {
        const resolved = resolver.resolveByTitle('Non-existent task')
        expect(resolved).toBeNull()
      })
    })

    describe('contentHash resolution', () => {
      it('resolves by content hash', () => {
        const firstTask = result.groups[0].tasks[0]
        const hash = firstTask.contentHash!

        const resolved = resolver.resolveByContentHash(hash)
        expect(resolved).not.toBeNull()
        expect(resolved?.task.title).toBe('First task')
      })
    })

    describe('fallback chain', () => {
      it('tries multiple resolution strategies', () => {
        // First try with displayId
        let resolved = resolver.resolveWithFallback('1.1.1')
        expect(resolved?.task.title).toBe('First task')

        // Then with internal ID
        resolved = resolver.resolveWithFallback('task-1-1')
        expect(resolved?.task.title).toBe('First task')

        // Then with title
        resolved = resolver.resolveWithFallback('First task')
        expect(resolved?.task.title).toBe('First task')
      })

      it('returns null when all strategies fail', () => {
        const resolved = resolver.resolveWithFallback('completely-invalid-id')
        expect(resolved).toBeNull()
      })
    })
  })

  describe('status functions', () => {
    const content = `## Tasks

- [ ] Task 1
- [ ] Task 2
- [x] Task 3
`

    describe('setTaskStatus', () => {
      it('marks task as complete', () => {
        const { newContent, task } = setTaskStatus(content, '1.1.1', true)

        expect(task.completed).toBe(true)
        expect(newContent).toContain('- [x] Task 1')
      })

      it('marks task as incomplete', () => {
        const { newContent, task } = setTaskStatus(content, '1.1.3', false)

        expect(task.completed).toBe(false)
        expect(newContent).toContain('- [ ] Task 3')
      })

      it('works with internal ID', () => {
        const { newContent, task } = setTaskStatus(content, 'task-1-2', true)

        expect(task.completed).toBe(true)
        expect(newContent).toContain('- [x] Task 2')
      })

      it('throws for non-existent task', () => {
        expect(() => setTaskStatus(content, 'non-existent', true))
          .toThrow('Task not found')
      })
    })

    describe('toggleTaskStatus', () => {
      it('toggles incomplete to complete', () => {
        const { newContent, task } = toggleTaskStatus(content, '1.1.1')

        expect(task.completed).toBe(true)
        expect(newContent).toContain('- [x] Task 1')
      })

      it('toggles complete to incomplete', () => {
        const { newContent, task } = toggleTaskStatus(content, '1.1.3')

        expect(task.completed).toBe(false)
        expect(newContent).toContain('- [ ] Task 3')
      })
    })

    describe('bulk operations', () => {
      it('marks multiple tasks complete', () => {
        const result = markTasksComplete(content, ['1.1.1', '1.1.2'])

        expect(result.newContent).toContain('- [x] Task 1')
        expect(result.newContent).toContain('- [x] Task 2')
        expect(result.updated).toBe(2)
      })

      it('marks multiple tasks incomplete', () => {
        const contentWithCompleted = `## Tasks

- [x] Task 1
- [x] Task 2
- [x] Task 3
`
        const result = markTasksIncomplete(contentWithCompleted, ['1.1.1', '1.1.2'])

        expect(result.newContent).toContain('- [ ] Task 1')
        expect(result.newContent).toContain('- [ ] Task 2')
        expect(result.newContent).toContain('- [x] Task 3')
        expect(result.updated).toBe(2)
      })
    })
  })

  describe('parseTasksFile convenience function', () => {
    it('works as a simple wrapper', () => {
      const content = `## Tasks

- [ ] Simple task
`
      const result = parseTasksFile('convenience-test', content)

      expect(result.changeId).toBe('convenience-test')
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].tasks[0].title).toBe('Simple task')
    })
  })

  describe('OpenSpec 1.0 specific features', () => {
    it('handles 3-level hierarchy correctly', () => {
      const content = `## Phase 1: Foundation

### 1.1 Database Setup

- [ ] Create schema
- [ ] Run migrations

### 1.2 API Setup

- [ ] Create routes
- [ ] Add middleware

## Phase 2: Features

### 2.1 Authentication

- [ ] Add login
- [ ] Add logout
`
      const result = parseTasksFile('openspec-test', content)

      // Should have 4 groups (1.1, 1.2, 2.1 with tasks)
      const groupsWithTasks = result.groups.filter(g => g.tasks.length > 0)
      expect(groupsWithTasks.length).toBeGreaterThanOrEqual(3)

      // Verify phase tracking
      const phase1Groups = result.groups.filter(g => g.phaseIndex === 0)
      const phase2Groups = result.groups.filter(g => g.phaseIndex === 1)
      expect(phase1Groups.length).toBeGreaterThanOrEqual(1)
      expect(phase2Groups.length).toBeGreaterThanOrEqual(1)
    })

    it('generates correct majorOrder and groupOrder', () => {
      const content = `## Phase 1: First

- [ ] Task 1

## Phase 2: Second

- [ ] Task 2

## Phase 3: Third

- [ ] Task 3
`
      const result = parseTasksFile('order-test', content)

      // majorOrder should be phase number (1-based)
      expect(result.groups[0].majorOrder).toBe(1)
      expect(result.groups[1].majorOrder).toBe(2)
      expect(result.groups[2].majorOrder).toBe(3)

      // groupOrder should be sequential across all groups
      expect(result.groups[0].groupOrder).toBe(1)
      expect(result.groups[1].groupOrder).toBe(2)
      expect(result.groups[2].groupOrder).toBe(3)
    })
  })
})
