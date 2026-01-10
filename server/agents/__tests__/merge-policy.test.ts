/**
 * Merge Policy Tests
 */

import { describe, it, expect } from 'vitest'
import {
  decideMerge,
  getPolicy,
  getAllPolicies,
  type ValidationResult,
} from '../merge-policy'

const mockValidationPassed: ValidationResult = {
  passed: true,
  level: 'full',
  checks: {
    syntax: { passed: true, skipped: false, errors: [], warnings: [], duration: 100 },
    typecheck: { passed: true, skipped: false, errors: [], warnings: [], duration: 200 },
    lint: { passed: true, skipped: false, errors: [], warnings: [], duration: 150 },
    test: { passed: true, skipped: false, errors: [], warnings: [], duration: 500 },
  },
  overallScore: 1.0,
  errors: [],
  warnings: [],
}

const mockValidationFailed: ValidationResult = {
  passed: false,
  level: 'full',
  checks: {
    syntax: { passed: true, skipped: false, errors: [], warnings: [], duration: 100 },
    typecheck: { passed: false, skipped: false, errors: ['Type error'], warnings: [], duration: 200 },
    lint: { passed: true, skipped: true, errors: [], warnings: [], duration: 0 },
    test: { passed: true, skipped: true, errors: [], warnings: [], duration: 0 },
  },
  overallScore: 0.5,
  errors: ['Type error'],
  warnings: [],
}

describe('Merge Policy', () => {
  describe('decideMerge', () => {
    it('should approve auto-merge for GitHub Actions with all checks passed', () => {
      const decision = decideMerge('github', undefined, true, mockValidationPassed, 0.9)

      expect(decision.shouldMerge).toBe(true)
      expect(decision.ciPassed).toBe(true)
      expect(decision.validationPassed).toBe(true)
    })

    it('should reject auto-merge when CI fails', () => {
      const decision = decideMerge('github', undefined, false, mockValidationPassed, 0.9)

      expect(decision.shouldMerge).toBe(false)
      expect(decision.reason).toContain('CI did not pass')
    })

    it('should reject auto-merge when validation fails', () => {
      const decision = decideMerge('github', undefined, true, mockValidationFailed, 0.9)

      expect(decision.shouldMerge).toBe(false)
      expect(decision.reason).toContain('Validation failed')
    })

    it('should reject auto-merge when confidence is too low', () => {
      const decision = decideMerge('github', undefined, true, mockValidationPassed, 0.5)

      expect(decision.shouldMerge).toBe(false)
      expect(decision.reason).toContain('Confidence')
    })

    it('should require manual approval for Supabase security alerts', () => {
      const decision = decideMerge('supabase', 'security', true, mockValidationPassed, 0.95)

      expect(decision.shouldMerge).toBe(false)
      expect(decision.policy.requiresManualApproval).toBe(true)
      expect(decision.reason).toContain('Manual approval required')
    })

    it('should require manual approval for Supabase performance alerts', () => {
      const decision = decideMerge('supabase', 'performance', true, mockValidationPassed, 0.95)

      expect(decision.shouldMerge).toBe(false)
      expect(decision.policy.requiresManualApproval).toBe(true)
    })

    it('should allow auto-merge for Supabase edge function errors', () => {
      const decision = decideMerge('supabase', 'edge_function', true, mockValidationPassed, 0.9)

      expect(decision.shouldMerge).toBe(true)
    })
  })

  describe('getPolicy', () => {
    it('should return policy for known source', () => {
      const policy = getPolicy('github')

      expect(policy).toBeDefined()
      expect(policy?.source).toBe('github')
      expect(policy?.autoMerge).toBe(true)
    })

    it('should return specific subtype policy', () => {
      const securityPolicy = getPolicy('supabase', 'security')

      expect(securityPolicy).toBeDefined()
      expect(securityPolicy?.autoMerge).toBe(false)
      expect(securityPolicy?.requiresManualApproval).toBe(true)
    })
  })

  describe('getAllPolicies', () => {
    it('should return all defined policies', () => {
      const policies = getAllPolicies()

      expect(policies.length).toBeGreaterThan(0)
      expect(policies.some(p => p.source === 'github')).toBe(true)
      expect(policies.some(p => p.source === 'vercel')).toBe(true)
      expect(policies.some(p => p.source === 'sentry')).toBe(true)
      expect(policies.some(p => p.source === 'supabase')).toBe(true)
    })
  })
})
