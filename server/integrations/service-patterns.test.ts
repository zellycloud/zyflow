/**
 * service-patterns 단위 테스트
 * 서비스별 환경변수 패턴 매칭 테스트
 */

import { describe, it, expect } from 'vitest'
import {
  detectServices,
  maskCredentialValue,
  inferEnvironmentFromSource,
  mapToIntegrationHubType,
} from './service-patterns.js'
import type { EnvVariable } from './env-parser.js'

describe('service-patterns', () => {
  describe('detectServices', () => {
    describe('GitHub detection', () => {
      it('should detect GitHub from GITHUB_TOKEN', () => {
        const variables: EnvVariable[] = [
          { key: 'GITHUB_TOKEN', value: 'ghp_xxxxxxxxxxxx', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'github')).toBeDefined()
        expect(result.services.find((s) => s.type === 'github')?.isComplete).toBe(true)
      })

      it('should detect GitHub from GH_TOKEN', () => {
        const variables: EnvVariable[] = [
          { key: 'GH_TOKEN', value: 'ghp_xxxxxxxxxxxx', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'github')).toBeDefined()
      })

      it('should detect GitHub with optional fields', () => {
        const variables: EnvVariable[] = [
          { key: 'GITHUB_TOKEN', value: 'ghp_xxxxxxxxxxxx', source: '.env' },
          { key: 'GITHUB_USERNAME', value: 'testuser', source: '.env' },
          { key: 'GITHUB_EMAIL', value: 'test@example.com', source: '.env' },
        ]
        const result = detectServices(variables)
        const github = result.services.find((s) => s.type === 'github')
        expect(github?.credentials.token).toBe('ghp_xxxxxxxxxxxx')
        expect(github?.credentials.username).toBe('testuser')
        expect(github?.credentials.email).toBe('test@example.com')
      })
    })

    describe('Supabase detection', () => {
      it('should detect Supabase with required fields', () => {
        const variables: EnvVariable[] = [
          { key: 'SUPABASE_URL', value: 'https://xxx.supabase.co', source: '.env' },
          { key: 'SUPABASE_ANON_KEY', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', source: '.env' },
        ]
        const result = detectServices(variables)
        const supabase = result.services.find((s) => s.type === 'supabase')
        expect(supabase).toBeDefined()
        expect(supabase?.isComplete).toBe(true)
      })

      it('should detect incomplete Supabase (missing anon key)', () => {
        const variables: EnvVariable[] = [
          { key: 'SUPABASE_URL', value: 'https://xxx.supabase.co', source: '.env' },
        ]
        const result = detectServices(variables)
        const supabase = result.services.find((s) => s.type === 'supabase')
        expect(supabase).toBeDefined()
        expect(supabase?.isComplete).toBe(false)
        expect(supabase?.missingRequired).toContain('anonKey')
      })

      it('should detect Supabase with service role key', () => {
        const variables: EnvVariable[] = [
          { key: 'SUPABASE_URL', value: 'https://xxx.supabase.co', source: '.env' },
          { key: 'SUPABASE_ANON_KEY', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', source: '.env' },
          { key: 'SUPABASE_SERVICE_ROLE_KEY', value: 'service-role-key', source: '.env' },
        ]
        const result = detectServices(variables)
        const supabase = result.services.find((s) => s.type === 'supabase')
        expect(supabase?.credentials.serviceRoleKey).toBe('service-role-key')
      })
    })

    describe('AI/ML services detection', () => {
      it('should detect OpenAI', () => {
        const variables: EnvVariable[] = [
          { key: 'OPENAI_API_KEY', value: 'sk-xxxxxxxxxxxx', source: '.env' },
        ]
        const result = detectServices(variables)
        const openai = result.services.find((s) => s.type === 'openai')
        expect(openai).toBeDefined()
        expect(openai?.isComplete).toBe(true)
      })

      it('should detect Anthropic', () => {
        const variables: EnvVariable[] = [
          { key: 'ANTHROPIC_API_KEY', value: 'sk-ant-xxxxxxxxxxxx', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'anthropic')).toBeDefined()
      })

      it('should detect Hugging Face with different formats', () => {
        const variables1: EnvVariable[] = [
          { key: 'HUGGINGFACE_TOKEN', value: 'hf_xxxx', source: '.env' },
        ]
        const variables2: EnvVariable[] = [
          { key: 'HF_TOKEN', value: 'hf_xxxx', source: '.env' },
        ]
        const variables3: EnvVariable[] = [
          { key: 'HF_API_TOKEN', value: 'hf_xxxx', source: '.env' },
        ]

        expect(detectServices(variables1).services.find((s) => s.type === 'huggingface')).toBeDefined()
        expect(detectServices(variables2).services.find((s) => s.type === 'huggingface')).toBeDefined()
        expect(detectServices(variables3).services.find((s) => s.type === 'huggingface')).toBeDefined()
      })
    })

    describe('Cloud provider detection', () => {
      it('should detect AWS', () => {
        const variables: EnvVariable[] = [
          { key: 'AWS_ACCESS_KEY_ID', value: 'AKIAIOSFODNN7EXAMPLE', source: '.env' },
          { key: 'AWS_SECRET_ACCESS_KEY', value: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', source: '.env' },
        ]
        const result = detectServices(variables)
        const aws = result.services.find((s) => s.type === 'aws')
        expect(aws).toBeDefined()
        expect(aws?.isComplete).toBe(true)
      })

      it('should detect incomplete AWS (missing secret)', () => {
        const variables: EnvVariable[] = [
          { key: 'AWS_ACCESS_KEY_ID', value: 'AKIAIOSFODNN7EXAMPLE', source: '.env' },
        ]
        const result = detectServices(variables)
        const aws = result.services.find((s) => s.type === 'aws')
        expect(aws?.isComplete).toBe(false)
        expect(aws?.missingRequired).toContain('secretAccessKey')
      })

      it('should detect Cloudflare', () => {
        const variables: EnvVariable[] = [
          { key: 'CLOUDFLARE_API_TOKEN', value: 'xxxxxxxxxxxx', source: '.env' },
          { key: 'CLOUDFLARE_ACCOUNT_ID', value: 'account123', source: '.env' },
        ]
        const result = detectServices(variables)
        const cloudflare = result.services.find((s) => s.type === 'cloudflare')
        expect(cloudflare).toBeDefined()
        expect(cloudflare?.credentials.accountId).toBe('account123')
      })
    })

    describe('Payment services detection', () => {
      it('should detect Stripe', () => {
        const variables: EnvVariable[] = [
          { key: 'STRIPE_SECRET_KEY', value: 'sk_test_xxxxxxxxxxxx', source: '.env' },
          { key: 'STRIPE_PUBLISHABLE_KEY', value: 'pk_test_xxxxxxxxxxxx', source: '.env' },
        ]
        const result = detectServices(variables)
        const stripe = result.services.find((s) => s.type === 'stripe')
        expect(stripe).toBeDefined()
        expect(stripe?.isComplete).toBe(true)
      })

      it('should detect Stripe with webhook secret', () => {
        const variables: EnvVariable[] = [
          { key: 'STRIPE_SECRET_KEY', value: 'sk_test_xxxxxxxxxxxx', source: '.env' },
          { key: 'STRIPE_WEBHOOK_SECRET', value: 'whsec_xxxxxxxxxxxx', source: '.env' },
        ]
        const result = detectServices(variables)
        const stripe = result.services.find((s) => s.type === 'stripe')
        expect(stripe?.credentials.webhookSecret).toBe('whsec_xxxxxxxxxxxx')
      })
    })

    describe('Database detection', () => {
      it('should detect PostgreSQL from URL', () => {
        const variables: EnvVariable[] = [
          { key: 'POSTGRES_URL', value: 'postgres://user:pass@localhost/db', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'postgresql')).toBeDefined()
      })

      it('should detect MongoDB', () => {
        const variables: EnvVariable[] = [
          { key: 'MONGODB_URI', value: 'mongodb+srv://user:pass@cluster.mongodb.net/db', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'mongodb')).toBeDefined()
      })

      it('should detect Redis', () => {
        const variables: EnvVariable[] = [
          { key: 'REDIS_URL', value: 'redis://localhost:6379', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'redis')).toBeDefined()
      })

      it('should detect Neon from DATABASE_URL', () => {
        const variables: EnvVariable[] = [
          { key: 'DATABASE_URL', value: 'postgres://ep-cool-branch-123456.us-east-1.aws.neon.tech/neondb', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'neon')).toBeDefined()
      })

      it('should detect Upstash Redis', () => {
        const variables: EnvVariable[] = [
          { key: 'UPSTASH_REDIS_REST_URL', value: 'https://xxx.upstash.io', source: '.env' },
          { key: 'UPSTASH_REDIS_REST_TOKEN', value: 'token123', source: '.env' },
        ]
        const result = detectServices(variables)
        const upstash = result.services.find((s) => s.type === 'upstash')
        expect(upstash).toBeDefined()
        expect(upstash?.isComplete).toBe(true)
      })
    })

    describe('Email services detection', () => {
      it('should detect SendGrid', () => {
        const variables: EnvVariable[] = [
          { key: 'SENDGRID_API_KEY', value: 'SG.xxxxxxxxxxxx', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'sendgrid')).toBeDefined()
      })

      it('should detect Resend', () => {
        const variables: EnvVariable[] = [
          { key: 'RESEND_API_KEY', value: 're_xxxxxxxxxxxx', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'resend')).toBeDefined()
      })
    })

    describe('Auth services detection', () => {
      it('should detect Clerk', () => {
        const variables: EnvVariable[] = [
          { key: 'CLERK_SECRET_KEY', value: 'sk_test_xxxxxxxxxxxx', source: '.env' },
          { key: 'CLERK_PUBLISHABLE_KEY', value: 'pk_test_xxxxxxxxxxxx', source: '.env' },
        ]
        const result = detectServices(variables)
        const clerk = result.services.find((s) => s.type === 'clerk')
        expect(clerk).toBeDefined()
        expect(clerk?.isComplete).toBe(true)
      })

      it('should detect NextAuth', () => {
        const variables: EnvVariable[] = [
          { key: 'NEXTAUTH_SECRET', value: 'secret123', source: '.env' },
          { key: 'NEXTAUTH_URL', value: 'http://localhost:3000', source: '.env' },
        ]
        const result = detectServices(variables)
        const nextauth = result.services.find((s) => s.type === 'nextauth')
        expect(nextauth).toBeDefined()
        expect(nextauth?.credentials.url).toBe('http://localhost:3000')
      })
    })

    describe('Framework prefix normalization', () => {
      it('should normalize NEXT_PUBLIC_ prefix', () => {
        const variables: EnvVariable[] = [
          { key: 'NEXT_PUBLIC_SUPABASE_URL', value: 'https://xxx.supabase.co', source: '.env' },
          { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: 'key123', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'supabase')).toBeDefined()
      })

      it('should normalize VITE_ prefix', () => {
        const variables: EnvVariable[] = [
          { key: 'VITE_SUPABASE_URL', value: 'https://xxx.supabase.co', source: '.env' },
          { key: 'VITE_SUPABASE_ANON_KEY', value: 'key123', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'supabase')).toBeDefined()
      })

      it('should normalize REACT_APP_ prefix', () => {
        const variables: EnvVariable[] = [
          { key: 'REACT_APP_STRIPE_SECRET_KEY', value: 'sk_test_xxx', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.find((s) => s.type === 'stripe')).toBeDefined()
      })
    })

    describe('unmatched variables', () => {
      it('should track unmatched variables', () => {
        const variables: EnvVariable[] = [
          { key: 'GITHUB_TOKEN', value: 'ghp_xxx', source: '.env' },
          { key: 'MY_CUSTOM_VAR', value: 'value1', source: '.env' },
          { key: 'ANOTHER_VAR', value: 'value2', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.unmatchedVariables).toHaveLength(2)
        expect(result.unmatchedVariables.map((v) => v.key)).toContain('MY_CUSTOM_VAR')
        expect(result.unmatchedVariables.map((v) => v.key)).toContain('ANOTHER_VAR')
      })
    })

    describe('source tracking', () => {
      it('should track source files for each service', () => {
        const variables: EnvVariable[] = [
          { key: 'GITHUB_TOKEN', value: 'ghp_xxx', source: '.env.local' },
          { key: 'GITHUB_USERNAME', value: 'user', source: '.env' },
        ]
        const result = detectServices(variables)
        const github = result.services.find((s) => s.type === 'github')
        expect(github?.sources).toContain('.env.local')
        expect(github?.sources).toContain('.env')
      })
    })

    describe('multiple services', () => {
      it('should detect multiple services from same file', () => {
        const variables: EnvVariable[] = [
          { key: 'GITHUB_TOKEN', value: 'ghp_xxx', source: '.env' },
          { key: 'OPENAI_API_KEY', value: 'sk-xxx', source: '.env' },
          { key: 'STRIPE_SECRET_KEY', value: 'sk_test_xxx', source: '.env' },
          { key: 'SUPABASE_URL', value: 'https://xxx.supabase.co', source: '.env' },
          { key: 'SUPABASE_ANON_KEY', value: 'key123', source: '.env' },
        ]
        const result = detectServices(variables)
        expect(result.services.length).toBeGreaterThanOrEqual(4)
        expect(result.services.find((s) => s.type === 'github')).toBeDefined()
        expect(result.services.find((s) => s.type === 'openai')).toBeDefined()
        expect(result.services.find((s) => s.type === 'stripe')).toBeDefined()
        expect(result.services.find((s) => s.type === 'supabase')).toBeDefined()
      })
    })
  })

  describe('maskCredentialValue', () => {
    it('should mask long values with prefix...suffix format', () => {
      const result = maskCredentialValue('ghp_xxxxxxxxxxxx1234')
      expect(result).toBe('ghp_...****')
    })

    it('should mask short values with asterisks', () => {
      const result = maskCredentialValue('short')
      expect(result).toBe('****')
    })

    it('should handle empty string', () => {
      const result = maskCredentialValue('')
      expect(result).toBe('****')
    })

    it('should handle values exactly 8 characters', () => {
      const result = maskCredentialValue('12345678')
      expect(result).toBe('1234...****')
    })
  })

  describe('inferEnvironmentFromSource', () => {
    it('should detect production environment', () => {
      expect(inferEnvironmentFromSource(['.env.production'])).toBe('production')
      expect(inferEnvironmentFromSource(['.env.prod'])).toBe('production')
    })

    it('should detect staging environment', () => {
      expect(inferEnvironmentFromSource(['.env.staging'])).toBe('staging')
      expect(inferEnvironmentFromSource(['.env.stage'])).toBe('staging')
    })

    it('should detect development environment', () => {
      expect(inferEnvironmentFromSource(['.env.development'])).toBe('development')
      expect(inferEnvironmentFromSource(['.env.dev'])).toBe('development')
    })

    it('should detect local environment', () => {
      expect(inferEnvironmentFromSource(['.env.local'])).toBe('local')
    })

    it('should return unknown for .env only', () => {
      expect(inferEnvironmentFromSource(['.env'])).toBe('unknown')
    })

    it('should prioritize production over other environments', () => {
      expect(inferEnvironmentFromSource(['.env.production', '.env.development'])).toBe('production')
    })
  })

  describe('mapToIntegrationHubType', () => {
    it('should map known types directly', () => {
      expect(mapToIntegrationHubType('github')).toBe('github')
      expect(mapToIntegrationHubType('supabase')).toBe('supabase')
      expect(mapToIntegrationHubType('vercel')).toBe('vercel')
      expect(mapToIntegrationHubType('sentry')).toBe('sentry')
    })

    it('should map unknown types to custom', () => {
      expect(mapToIntegrationHubType('openai')).toBe('custom')
      expect(mapToIntegrationHubType('stripe')).toBe('custom')
      expect(mapToIntegrationHubType('aws')).toBe('custom')
    })
  })
})
