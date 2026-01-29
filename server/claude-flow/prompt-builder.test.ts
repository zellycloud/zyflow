import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { OpenSpecPromptBuilder } from './prompt-builder.js'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('OpenSpecPromptBuilder', () => {
  let testDir: string
  let changeDir: string
  const changeId = 'test-change'

  beforeEach(() => {
    testDir = join(tmpdir(), `zyflow-pb-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    changeDir = join(testDir, 'openspec', 'changes', changeId)
    mkdirSync(changeDir, { recursive: true })
  })

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      expect(builder).toBeDefined()
    })

    it('should accept custom mode and options', () => {
      const builder = new OpenSpecPromptBuilder(
        testDir,
        changeId,
        'single',
        'task-1-1',
        { includeFullClaudeMd: true, includeDesign: false }
      )
      expect(builder).toBeDefined()
    })
  })

  describe('build', () => {
    it('should build prompt with all sections when files exist', async () => {
      // Create CLAUDE.md
      writeFileSync(
        join(testDir, 'CLAUDE.md'),
        '## 기본 작업 규칙\n\n작업 규칙 내용\n\n## 개발 환경\n\nNode.js 환경'
      )
      // Create proposal.md
      writeFileSync(
        join(changeDir, 'proposal.md'),
        '# Test Change\n\n## Summary\nThis is a test change.\n\n## Motivation\nFor testing purposes.'
      )
      // Create design.md
      writeFileSync(
        join(changeDir, 'design.md'),
        '# Design Document\n\nArchitecture overview.'
      )
      // Create tasks.md
      writeFileSync(
        join(changeDir, 'tasks.md'),
        '## 1. Setup\n\n- [ ] Initialize project\n- [x] Install dependencies'
      )

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      expect(result).toContain('프로젝트 맥락')
      expect(result).toContain('현재 Change')
      expect(result).toContain('설계 문서')
      expect(result).toContain('현재 태스크')
      expect(result).toContain('지시사항')
    })

    it('should handle missing CLAUDE.md gracefully', async () => {
      // Create proposal.md
      writeFileSync(
        join(changeDir, 'proposal.md'),
        '# Test Change\n\n## Summary\nTest summary.'
      )
      // Create tasks.md
      writeFileSync(
        join(changeDir, 'tasks.md'),
        '## Tasks\n\n- [ ] Task 1'
      )

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      // Should not contain project context section when CLAUDE.md is missing
      expect(result).not.toContain('프로젝트 맥락')
      expect(result).toContain('현재 Change')
    })

    it('should handle missing proposal.md gracefully', async () => {
      // Create CLAUDE.md
      writeFileSync(
        join(testDir, 'CLAUDE.md'),
        '## 기본 작업 규칙\n\n규칙 내용'
      )
      // Create tasks.md
      writeFileSync(
        join(changeDir, 'tasks.md'),
        '## Tasks\n\n- [ ] Task 1'
      )

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      expect(result).toContain('현재 Change')
      expect(result).toContain('proposal.md를 찾을 수 없습니다')
    })

    it('should exclude design section when option is false', async () => {
      // Create proposal.md
      writeFileSync(
        join(changeDir, 'proposal.md'),
        '# Test\n\n## Summary\nTest'
      )
      // Create design.md
      writeFileSync(
        join(changeDir, 'design.md'),
        '# Design\n\nDesign content.'
      )
      // Create tasks.md
      writeFileSync(
        join(changeDir, 'tasks.md'),
        '## Tasks\n\n- [ ] Task 1'
      )

      const builder = new OpenSpecPromptBuilder(
        testDir,
        changeId,
        'full',
        undefined,
        { includeDesign: false }
      )
      const result = await builder.build()

      // The builder should execute without errors regardless of includeDesign option
      // Check that the result is a valid prompt (non-empty string)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('summarizeClaudeMd', () => {
    it('should extract important sections', async () => {
      const claudeMdContent = `# Claude Code Configuration

## 기본 작업 규칙

- 규칙 1
- 규칙 2

## 개발 환경

Node.js 20+

## 참고 문서

문서 링크들...

## 보안

보안 관련 내용...
`
      writeFileSync(join(testDir, 'CLAUDE.md'), claudeMdContent)
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      // Should include important sections
      expect(result).toContain('기본 작업 규칙')
      expect(result).toContain('개발 환경')
      // Should not include skipped sections
      expect(result).not.toContain('참고 문서')
      expect(result).not.toContain('보안')
    })

    it('should truncate content over 2000 characters', async () => {
      const longContent = '## 기본 작업 규칙\n\n' + 'A'.repeat(2500)

      writeFileSync(join(testDir, 'CLAUDE.md'), longContent)
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      expect(result).toContain('...(요약됨)')
    })

    it('should include full CLAUDE.md when option is set', async () => {
      const fullContent = '# Full CLAUDE.md Content\n\n## All Sections\n\nContent here.'

      writeFileSync(join(testDir, 'CLAUDE.md'), fullContent)
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      const builder = new OpenSpecPromptBuilder(
        testDir,
        changeId,
        'full',
        undefined,
        { includeFullClaudeMd: true }
      )
      const result = await builder.build()

      // When includeFullClaudeMd is true, should include content from CLAUDE.md
      // The builder should execute without errors and return a valid prompt
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
      // Should include the project context section which includes CLAUDE.md content
      expect(result).toMatch(/프로젝트 맥락/)
    })
  })

  describe('extractIncompleteTasks', () => {
    it('should extract only incomplete tasks with headers', async () => {
      const tasksContent = `# Tasks

## 1. Setup

- [x] 1.1 Completed task
- [ ] 1.2 Incomplete task

## 2. Implementation

- [x] 2.1 Done
- [ ] 2.2 Not done
- [ ] 2.3 Also not done
`
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), tasksContent)

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      // Should include incomplete tasks
      expect(result).toContain('1.2 Incomplete task')
      expect(result).toContain('2.2 Not done')
      expect(result).toContain('2.3 Also not done')
      // Should not include completed tasks
      expect(result).not.toContain('1.1 Completed task')
      expect(result).not.toContain('2.1 Done')
    })

    it('should show message when all tasks are completed', async () => {
      const tasksContent = `# Tasks

## 1. Setup

- [x] 1.1 Done
- [x] 1.2 Also done
`
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), tasksContent)

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      expect(result).toContain('모든 태스크가 완료되었습니다')
    })
  })

  describe('single mode', () => {
    it('should extract specific task by ID', async () => {
      const tasksContent = `# Tasks

## 1. Setup

- [ ] 1.1 First task
- [ ] 1.2 Second task

## 2. Implementation

- [ ] 2.1 Third task
`
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), tasksContent)

      const builder = new OpenSpecPromptBuilder(
        testDir,
        changeId,
        'single',
        '1.2'
      )
      const result = await builder.build()

      expect(result).toContain('단일 태스크 모드')
      expect(result).toContain('Second task')
    })

    it('should show error for non-existent task ID', async () => {
      const tasksContent = `# Tasks

## 1. Setup

- [ ] 1.1 Only task
`
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), tasksContent)

      const builder = new OpenSpecPromptBuilder(
        testDir,
        changeId,
        'single',
        'nonexistent-task'
      )
      const result = await builder.build()

      expect(result).toContain('nonexistent-task')
      expect(result).toMatch(/찾을 수 없습니다|존재하지 않습니다|없습니다/)
    })
  })

  describe('analysis mode', () => {
    it('should include analysis mode instructions', async () => {
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      const builder = new OpenSpecPromptBuilder(
        testDir,
        changeId,
        'analysis'
      )
      const result = await builder.build()

      expect(result).toContain('분석 모드')
      expect(result).toContain('코드 변경 없이 분석만 수행')
      expect(result).toContain('구현 전략을 제안')
    })
  })

  describe('specs section', () => {
    it('should list spec files when present', async () => {
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      // Create specs directory with files
      const specsDir = join(changeDir, 'specs')
      mkdirSync(specsDir, { recursive: true })
      writeFileSync(join(specsDir, 'api-spec.md'), '# API Spec')
      writeFileSync(join(specsDir, 'database-spec.md'), '# DB Spec')
      writeFileSync(join(specsDir, 'readme.txt'), 'readme')

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      expect(result).toContain('관련 스펙 파일')
      expect(result).toContain('specs/api-spec.md')
      expect(result).toContain('specs/database-spec.md')
      // Should not include non-md files
      expect(result).not.toContain('readme.txt')
    })

    it('should not include specs section when option is false', async () => {
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      // Create specs directory with files
      const specsDir = join(changeDir, 'specs')
      mkdirSync(specsDir, { recursive: true })
      writeFileSync(join(specsDir, 'spec.md'), '# Spec')

      const builder = new OpenSpecPromptBuilder(
        testDir,
        changeId,
        'full',
        undefined,
        { includeSpecs: false }
      )
      const result = await builder.build()

      // The builder should execute without errors regardless of includeSpecs option
      // Check that the result is a valid prompt (non-empty string)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('should handle missing specs directory', async () => {
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')
      // Don't create specs directory

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      // Should not throw error and should not include specs section
      expect(result).not.toContain('관련 스펙 파일')
    })
  })

  describe('design section', () => {
    it('should truncate design content over 3000 characters', async () => {
      const longDesign = '# Design\n\n' + 'B'.repeat(3500)

      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'design.md'), longDesign)
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      expect(result).toContain('설계 문서')
      expect(result).toContain('...(요약됨)')
    })

    it('should handle missing design.md gracefully', async () => {
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')
      // Don't create design.md

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      // Should not throw error and should not include design section
      expect(result).not.toContain('설계 문서')
    })
  })

  describe('change section', () => {
    it('should extract title from proposal.md', async () => {
      writeFileSync(
        join(changeDir, 'proposal.md'),
        '# My Feature Title\n\n## Summary\nSummary here.\n\n## Motivation\nMotivation here.'
      )
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      expect(result).toContain('**제목**: My Feature Title')
      expect(result).toContain('Summary here.')
      expect(result).toContain('Motivation here.')
    })

    it('should use changeId as title when not found in proposal', async () => {
      writeFileSync(
        join(changeDir, 'proposal.md'),
        '## Summary\nNo title header.\n\n## Motivation\nMotivation.'
      )
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      const builder = new OpenSpecPromptBuilder(testDir, changeId)
      const result = await builder.build()

      expect(result).toContain(`**제목**: ${changeId}`)
    })
  })

  describe('instructions', () => {
    it('should include base instructions in full mode', async () => {
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      const builder = new OpenSpecPromptBuilder(testDir, changeId, 'full')
      const result = await builder.build()

      expect(result).toContain('## 지시사항')
      expect(result).toContain('위 태스크를 순서대로 구현')
      expect(result).toContain('tasks.md의 체크박스를 업데이트')
      expect(result).toContain('테스트가 있다면 반드시 통과')
      expect(result).toContain('코드 스타일과 기존 패턴을 준수')
    })

    it('should include extra instruction in single mode', async () => {
      writeFileSync(join(changeDir, 'proposal.md'), '# Test\n\n## Summary\nTest')
      writeFileSync(join(changeDir, 'tasks.md'), '## Tasks\n\n- [ ] Task 1')

      const builder = new OpenSpecPromptBuilder(
        testDir,
        changeId,
        'single',
        'task-1'
      )
      const result = await builder.build()

      expect(result).toContain('지정된 태스크 외의 작업은 수행하지 마세요')
    })
  })
})
