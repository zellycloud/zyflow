/**
 * 암호화 유틸리티 단위 테스트
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  maskSensitive,
  generateMasterKey,
  isEncrypted,
} from './crypto.js'

describe('Integration Hub Crypto Utils', () => {
  let testMasterKey: string

  beforeAll(() => {
    testMasterKey = generateMasterKey()
  })

  describe('generateMasterKey', () => {
    it('should generate a 64-character hex string', () => {
      const key = generateMasterKey()
      expect(key).toHaveLength(64)
      expect(/^[0-9a-f]+$/i.test(key)).toBe(true)
    })

    it('should generate unique keys', () => {
      const key1 = generateMasterKey()
      const key2 = generateMasterKey()
      expect(key1).not.toBe(key2)
    })
  })

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a simple string', async () => {
      const plaintext = 'Hello, World!'
      const encrypted = await encrypt(plaintext, testMasterKey)
      const decrypted = await decrypt(encrypted, testMasterKey)
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt Korean text', async () => {
      const plaintext = '안녕하세요, 세계!'
      const encrypted = await encrypt(plaintext, testMasterKey)
      const decrypted = await decrypt(encrypted, testMasterKey)
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt special characters', async () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~'
      const encrypted = await encrypt(plaintext, testMasterKey)
      const decrypted = await decrypt(encrypted, testMasterKey)
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt long strings', async () => {
      const plaintext = 'A'.repeat(10000)
      const encrypted = await encrypt(plaintext, testMasterKey)
      const decrypted = await decrypt(encrypted, testMasterKey)
      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertexts for same plaintext (random IV)', async () => {
      const plaintext = 'Same message'
      const encrypted1 = await encrypt(plaintext, testMasterKey)
      const encrypted2 = await encrypt(plaintext, testMasterKey)
      // Uses 'data' field instead of 'ciphertext'
      expect(encrypted1.data).not.toBe(encrypted2.data)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)
    })

    it('should fail decryption with wrong key', async () => {
      const plaintext = 'Secret message'
      const encrypted = await encrypt(plaintext, testMasterKey)
      const wrongKey = generateMasterKey()

      await expect(decrypt(encrypted, wrongKey)).rejects.toThrow()
    })

    it('should include version, iv, salt, authTag, and data in encrypted data', async () => {
      const plaintext = 'Test'
      const encrypted = await encrypt(plaintext, testMasterKey)

      expect(encrypted.version).toBe(1)
      expect(encrypted.iv).toBeDefined()
      expect(encrypted.salt).toBeDefined()
      expect(encrypted.authTag).toBeDefined()
      expect(encrypted.data).toBeDefined()
    })
  })

  describe('encryptObject/decryptObject', () => {
    it('should encrypt and decrypt a simple object', async () => {
      const obj = { username: 'testuser', token: 'secret-token' }
      const encrypted = await encryptObject(obj, testMasterKey)
      const decrypted = await decryptObject(encrypted, testMasterKey)
      expect(decrypted).toEqual(obj)
    })

    it('should encrypt and decrypt nested objects', async () => {
      const obj = {
        github: {
          username: 'user',
          credentials: {
            pat: 'ghp_xxx',
            sshKeyPath: '~/.ssh/id_rsa',
          },
        },
        settings: {
          autoSync: true,
          interval: 60,
        },
      }
      const encrypted = await encryptObject(obj, testMasterKey)
      const decrypted = await decryptObject(encrypted, testMasterKey)
      expect(decrypted).toEqual(obj)
    })

    it('should encrypt and decrypt arrays', async () => {
      const obj = { items: [1, 2, 3], names: ['a', 'b', 'c'] }
      const encrypted = await encryptObject(obj, testMasterKey)
      const decrypted = await decryptObject(encrypted, testMasterKey)
      expect(decrypted).toEqual(obj)
    })

    it('should handle null and undefined values', async () => {
      const obj = { value: null, other: 'exists' }
      const encrypted = await encryptObject(obj, testMasterKey)
      const decrypted = await decryptObject<typeof obj>(encrypted, testMasterKey)
      expect(decrypted.value).toBeNull()
      expect(decrypted.other).toBe('exists')
    })

    it('should produce a JSON string output', async () => {
      const obj = { test: true }
      const encrypted = await encryptObject(obj, testMasterKey)
      expect(typeof encrypted).toBe('string')
      // Should be valid JSON
      expect(() => JSON.parse(encrypted)).not.toThrow()
    })
  })

  describe('maskSensitive', () => {
    it('should mask with prefix...suffix format', () => {
      const result = maskSensitive('ghp_xxxxxxxxxxxx1234')
      // Default showChars=4, so format is first 4 chars + ... + last 4 chars
      expect(result).toBe('ghp_...1234')
    })

    it('should handle short strings with all asterisks', () => {
      const result = maskSensitive('abc')
      // Length 3 <= showChars*2 (4*2=8), so all asterisks
      expect(result).toBe('***')
    })

    it('should allow custom show character count', () => {
      const result = maskSensitive('secretpassword', 6)
      // Length 14 > showChars*2 (6*2=12), so prefix...suffix format
      expect(result).toBe('secret...ssword')
    })

    it('should mask entire string if shorter than or equal to showChars*2', () => {
      const result = maskSensitive('ab', 4)
      // Length 2 <= showChars*2 (4*2=8), so all asterisks
      expect(result).toBe('**')
    })

    it('should handle empty string', () => {
      const result = maskSensitive('')
      expect(result).toBe('')
    })

    it('should handle strings equal to showChars*2 with all asterisks', () => {
      const result = maskSensitive('12345678', 4)
      // Length 8 <= showChars*2 (4*2=8), so all asterisks
      expect(result).toBe('********')
    })

    it('should show prefix...suffix for strings longer than showChars*2', () => {
      const result = maskSensitive('123456789', 4)
      // Length 9 > showChars*2 (4*2=8), so prefix...suffix
      expect(result).toBe('1234...6789')
    })
  })

  describe('isEncrypted', () => {
    it('should return true for valid encrypted data', async () => {
      const encrypted = await encryptObject({ test: true }, testMasterKey)
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it('should return false for plain text', () => {
      expect(isEncrypted('hello world')).toBe(false)
    })

    it('should return false for invalid JSON', () => {
      expect(isEncrypted('not json')).toBe(false)
    })

    it('should return false for JSON without required fields', () => {
      expect(isEncrypted('{"foo": "bar"}')).toBe(false)
    })

    it('should return false for wrong version', () => {
      expect(isEncrypted('{"version": 2, "salt": "a", "iv": "b", "authTag": "c", "data": "d"}')).toBe(false)
    })
  })
})
