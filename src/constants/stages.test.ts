import { describe, it, expect } from 'vitest'
import { STAGES, STAGE_CONFIG } from './stages'
import type { Stage } from '@/types'

describe('STAGES', () => {
  it('should have 7 stages in correct order', () => {
    expect(STAGES).toHaveLength(7)
    expect(STAGES).toEqual(['spec', 'changes', 'task', 'code', 'test', 'commit', 'docs'])
  })

  it('should include all pipeline stages', () => {
    const expectedStages: Stage[] = ['spec', 'changes', 'task', 'code', 'test', 'commit', 'docs']
    expectedStages.forEach((stage) => {
      expect(STAGES).toContain(stage)
    })
  })
})

describe('STAGE_CONFIG', () => {
  it('should have configuration for all stages', () => {
    STAGES.forEach((stage) => {
      expect(STAGE_CONFIG[stage]).toBeDefined()
    })
  })

  it('should have label, icon, and color for each stage', () => {
    STAGES.forEach((stage) => {
      const config = STAGE_CONFIG[stage]
      expect(config.label).toBeDefined()
      expect(typeof config.label).toBe('string')
      expect(config.icon).toBeDefined()
      expect(config.color).toBeDefined()
    })
  })

  it('should have correct labels for stages', () => {
    expect(STAGE_CONFIG.spec.label).toBe('Spec')
    expect(STAGE_CONFIG.changes.label).toBe('Changes')
    expect(STAGE_CONFIG.task.label).toBe('Tasks')
    expect(STAGE_CONFIG.code.label).toBe('Code')
    expect(STAGE_CONFIG.test.label).toBe('Test')
    expect(STAGE_CONFIG.commit.label).toBe('Commit')
    expect(STAGE_CONFIG.docs.label).toBe('Docs')
  })
})
