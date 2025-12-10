/**
 * env-parser 단위 테스트
 * 환경변수 파일 파싱 기능 테스트
 */

import { describe, it, expect } from 'vitest'
import { parseEnvContent } from './env-parser.js'

describe('env-parser', () => {
  describe('parseEnvContent', () => {
    describe('basic parsing', () => {
      it('should parse simple KEY=value pairs', () => {
        const content = `
FOO=bar
BAZ=qux
`
        const result = parseEnvContent(content)
        expect(result.get('FOO')).toBe('bar')
        expect(result.get('BAZ')).toBe('qux')
      })

      it('should handle empty values', () => {
        const content = `
EMPTY=
ANOTHER=value
`
        const result = parseEnvContent(content)
        expect(result.get('EMPTY')).toBe('')
        expect(result.get('ANOTHER')).toBe('value')
      })

      it('should ignore blank lines', () => {
        const content = `
FOO=bar

BAZ=qux

`
        const result = parseEnvContent(content)
        expect(result.size).toBe(2)
      })

      it('should handle values with equals signs', () => {
        const content = `DATABASE_URL=postgres://user:pass=word@localhost/db`
        const result = parseEnvContent(content)
        expect(result.get('DATABASE_URL')).toBe('postgres://user:pass=word@localhost/db')
      })
    })

    describe('comments', () => {
      it('should ignore comment lines starting with #', () => {
        const content = `
# This is a comment
FOO=bar
# Another comment
BAZ=qux
`
        const result = parseEnvContent(content)
        expect(result.size).toBe(2)
        expect(result.get('FOO')).toBe('bar')
        expect(result.get('BAZ')).toBe('qux')
      })

      it('should remove inline comments outside quotes', () => {
        const content = `
FOO=bar # this is a comment
BAZ=qux
`
        const result = parseEnvContent(content)
        expect(result.get('FOO')).toBe('bar')
      })
    })

    describe('quotes', () => {
      it('should handle double quoted values', () => {
        const content = `FOO="bar baz"`
        const result = parseEnvContent(content)
        expect(result.get('FOO')).toBe('bar baz')
      })

      it('should handle single quoted values', () => {
        const content = `FOO='bar baz'`
        const result = parseEnvContent(content)
        expect(result.get('FOO')).toBe('bar baz')
      })

      it('should preserve spaces in quoted values', () => {
        const content = `FOO="  bar  baz  "`
        const result = parseEnvContent(content)
        expect(result.get('FOO')).toBe('  bar  baz  ')
      })

      it('should handle empty quoted strings', () => {
        const content = `
EMPTY_DOUBLE=""
EMPTY_SINGLE=''
`
        const result = parseEnvContent(content)
        expect(result.get('EMPTY_DOUBLE')).toBe('')
        expect(result.get('EMPTY_SINGLE')).toBe('')
      })
    })

    describe('multiline values', () => {
      it('should handle multiline values with double quotes', () => {
        const content = `PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0
-----END RSA PRIVATE KEY-----"`
        const result = parseEnvContent(content)
        expect(result.get('PRIVATE_KEY')).toContain('BEGIN RSA PRIVATE KEY')
        expect(result.get('PRIVATE_KEY')).toContain('END RSA PRIVATE KEY')
      })

      it('should handle multiline values with single quotes', () => {
        const content = `MESSAGE='Hello
World'`
        const result = parseEnvContent(content)
        expect(result.get('MESSAGE')).toBe('Hello\nWorld')
      })
    })

    describe('export syntax', () => {
      it('should handle export prefix', () => {
        const content = `
export FOO=bar
export BAZ=qux
`
        const result = parseEnvContent(content)
        expect(result.get('FOO')).toBe('bar')
        expect(result.get('BAZ')).toBe('qux')
      })

      it('should handle mixed export and non-export', () => {
        const content = `
FOO=bar
export BAZ=qux
`
        const result = parseEnvContent(content)
        expect(result.get('FOO')).toBe('bar')
        expect(result.get('BAZ')).toBe('qux')
      })
    })

    describe('escape sequences', () => {
      it('should handle escaped newlines', () => {
        const content = `MESSAGE=Hello\\nWorld`
        const result = parseEnvContent(content)
        expect(result.get('MESSAGE')).toBe('Hello\nWorld')
      })

      it('should handle escaped tabs', () => {
        const content = `MESSAGE=Hello\\tWorld`
        const result = parseEnvContent(content)
        expect(result.get('MESSAGE')).toBe('Hello\tWorld')
      })

      it('should handle escaped carriage returns', () => {
        const content = `MESSAGE=Hello\\rWorld`
        const result = parseEnvContent(content)
        expect(result.get('MESSAGE')).toBe('Hello\rWorld')
      })
    })

    describe('whitespace handling', () => {
      it('should trim key names', () => {
        const content = `  FOO  =bar`
        const result = parseEnvContent(content)
        expect(result.get('FOO')).toBe('bar')
      })

      it('should trim unquoted values', () => {
        const content = `FOO=  bar  `
        const result = parseEnvContent(content)
        expect(result.get('FOO')).toBe('bar')
      })
    })

    describe('edge cases', () => {
      it('should handle empty content', () => {
        const result = parseEnvContent('')
        expect(result.size).toBe(0)
      })

      it('should handle content with only comments', () => {
        const content = `
# Comment 1
# Comment 2
`
        const result = parseEnvContent(content)
        expect(result.size).toBe(0)
      })

      it('should ignore lines without equals sign', () => {
        const content = `
FOO=bar
INVALID_LINE
BAZ=qux
`
        const result = parseEnvContent(content)
        expect(result.size).toBe(2)
      })

      it('should handle special characters in values', () => {
        const content = `
URL=https://example.com?foo=bar&baz=qux
SPECIAL=!@#$%^&*()_+-=[]{}|;:,.<>?
`
        const result = parseEnvContent(content)
        expect(result.get('URL')).toBe('https://example.com?foo=bar&baz=qux')
        expect(result.get('SPECIAL')).toBe('!@#$%^&*()_+-=[]{}|;:,.<>?')
      })

      it('should handle Korean characters', () => {
        const content = `MESSAGE=안녕하세요`
        const result = parseEnvContent(content)
        expect(result.get('MESSAGE')).toBe('안녕하세요')
      })

      it('should handle JSON values', () => {
        const content = `CONFIG='{"key": "value", "nested": {"a": 1}}'`
        const result = parseEnvContent(content)
        expect(result.get('CONFIG')).toBe('{"key": "value", "nested": {"a": 1}}')
      })
    })

    describe('real-world examples', () => {
      it('should parse typical .env file', () => {
        const content = `
# Database
DATABASE_URL=postgres://user:password@localhost:5432/mydb

# API Keys
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx

# Feature Flags
ENABLE_DEBUG=true
MAX_CONNECTIONS=100
`
        const result = parseEnvContent(content)
        expect(result.size).toBe(5)
        expect(result.get('DATABASE_URL')).toBe('postgres://user:password@localhost:5432/mydb')
        expect(result.get('OPENAI_API_KEY')).toBe('sk-xxxxxxxxxxxxxxxxxxxx')
        expect(result.get('STRIPE_SECRET_KEY')).toBe('sk_test_xxxxxxxxxxxx')
        expect(result.get('ENABLE_DEBUG')).toBe('true')
        expect(result.get('MAX_CONNECTIONS')).toBe('100')
      })

      it('should parse Next.js style .env file', () => {
        const content = `
# Next.js
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_GA_ID=UA-12345678-1

# Private
DATABASE_URL="postgres://localhost/myapp"
NEXTAUTH_SECRET="super-secret-key"
`
        const result = parseEnvContent(content)
        expect(result.get('NEXT_PUBLIC_API_URL')).toBe('https://api.example.com')
        expect(result.get('NEXT_PUBLIC_GA_ID')).toBe('UA-12345678-1')
        expect(result.get('DATABASE_URL')).toBe('postgres://localhost/myapp')
        expect(result.get('NEXTAUTH_SECRET')).toBe('super-secret-key')
      })
    })
  })
})
