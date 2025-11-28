import { describe, it, expect } from 'vitest'
import { parseTasksFile, toggleTaskInFile } from './parser.js'

describe('parseTasksFile', () => {
  it('parses numbered groups and tasks', () => {
    const content = `# Tasks: test-change

## 1. Setup

- [ ] 1.1 Initialize project
- [x] 1.2 Install dependencies

## 2. Implementation

- [ ] 2.1 Create components
- [ ] 2.2 Add tests
`
    const result = parseTasksFile('test-change', content)

    expect(result.changeId).toBe('test-change')
    expect(result.groups).toHaveLength(2)

    expect(result.groups[0].id).toBe('group-1')
    expect(result.groups[0].title).toBe('Setup')
    expect(result.groups[0].tasks).toHaveLength(2)

    expect(result.groups[0].tasks[0].id).toBe('task-1-1')
    expect(result.groups[0].tasks[0].title).toBe('Initialize project')
    expect(result.groups[0].tasks[0].completed).toBe(false)

    expect(result.groups[0].tasks[1].id).toBe('task-1-2')
    expect(result.groups[0].tasks[1].completed).toBe(true)

    expect(result.groups[1].id).toBe('group-2')
    expect(result.groups[1].tasks).toHaveLength(2)
  })

  it('parses phase format groups', () => {
    const content = `# Tasks

## Phase 0: Planning

- [ ] 0.1 Define requirements
- [ ] 0.2 Create design

## Phase 1: Development

- [ ] 1.1 Build features
`
    const result = parseTasksFile('phase-test', content)

    expect(result.groups).toHaveLength(2)
    expect(result.groups[0].id).toBe('group-phase-0')
    expect(result.groups[0].title).toBe('Phase 0: Planning')
    expect(result.groups[1].id).toBe('group-phase-1')
  })

  it('parses subsection headers as groups', () => {
    const content = `## 1. Main Section

### 1.1 Subsection A

- [ ] Task A1
- [ ] Task A2

### 1.2 Subsection B

- [ ] Task B1
`
    const result = parseTasksFile('subsection-test', content)

    expect(result.groups).toHaveLength(3)
    expect(result.groups[1].id).toBe('group-1-1')
    expect(result.groups[1].title).toBe('1.1 Subsection A')
    expect(result.groups[2].id).toBe('group-1-2')
  })

  it('handles plain (unnumbered) tasks', () => {
    const content = `## Tasks

- [ ] First task
- [x] Second task
- [ ] Third task
`
    const result = parseTasksFile('plain-test', content)

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].tasks).toHaveLength(3)
    expect(result.groups[0].tasks[0].id).toBe('task-group-1-1')
    expect(result.groups[0].tasks[1].id).toBe('task-group-1-2')
    expect(result.groups[0].tasks[1].completed).toBe(true)
  })

  it('tracks line numbers correctly', () => {
    const content = `# Title

## 1. Group

- [ ] 1.1 Task one
- [ ] 1.2 Task two
`
    const result = parseTasksFile('line-test', content)

    expect(result.groups[0].tasks[0].lineNumber).toBe(5)
    expect(result.groups[0].tasks[1].lineNumber).toBe(6)
  })
})

describe('toggleTaskInFile', () => {
  it('toggles numbered task from unchecked to checked', () => {
    const content = `## 1. Group

- [ ] 1.1 First task
- [ ] 1.2 Second task
`
    const { newContent, task } = toggleTaskInFile(content, 'task-1-1')

    expect(task.completed).toBe(true)
    expect(newContent).toContain('- [x] 1.1 First task')
    expect(newContent).toContain('- [ ] 1.2 Second task')
  })

  it('toggles numbered task from checked to unchecked', () => {
    const content = `## 1. Group

- [x] 1.1 Completed task
`
    const { newContent, task } = toggleTaskInFile(content, 'task-1-1')

    expect(task.completed).toBe(false)
    expect(newContent).toContain('- [ ] 1.1 Completed task')
  })

  it('toggles plain (unnumbered) task', () => {
    const content = `## Plain

- [ ] First task
- [ ] Second task
`
    const { newContent, task } = toggleTaskInFile(content, 'task-group-1-2')

    expect(task.completed).toBe(true)
    expect(newContent).toContain('- [ ] First task')
    expect(newContent).toContain('- [x] Second task')
  })

  it('throws error for non-existent task', () => {
    const content = `## 1. Group

- [ ] 1.1 Only task
`
    expect(() => toggleTaskInFile(content, 'task-9-9')).toThrow('Task not found')
  })

  it('preserves other lines in file', () => {
    const content = `# Tasks: test

Some description here.

## 1. Section

- [ ] 1.1 Task

More content below.
`
    const { newContent } = toggleTaskInFile(content, 'task-1-1')

    expect(newContent).toContain('# Tasks: test')
    expect(newContent).toContain('Some description here.')
    expect(newContent).toContain('More content below.')
  })
})
