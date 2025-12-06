/**
 * Local Settings 테스트
 *
 * 로컬 설정 파일 읽기, fallback 로직, 마이그레이션 시나리오 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'

import {
  getProjectZyflowPath,
  getSettingsPath,
  getEnvironmentFilePath,
  hasZyflowDir,
  ensureZyflowDir,
  hasLocalSettings,
  loadLocalSettings,
  saveLocalSettings,
  initLocalZyflow,
  listLocalEnvironments,
  loadLocalEnvironment,
  saveLocalEnvironment,
  hasLocalTestAccounts,
  loadLocalTestAccounts,
  saveLocalTestAccounts,
  encryptTestAccountPassword,
  decryptTestAccountPassword,
} from './file-utils.js'
import {
  createDefaultLocalSettings,
} from './types.js'
import type { LocalSettings, LocalTestAccount } from './types.js'

describe('Local Settings - File Utils', () => {
  let tempDir: string

  beforeEach(async () => {
    // 임시 디렉토리 생성
    tempDir = await mkdtemp(join(tmpdir(), 'zyflow-test-'))
  })

  afterEach(async () => {
    // 임시 디렉토리 삭제
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('Path Utilities', () => {
    it('getProjectZyflowPath should return correct path', () => {
      const result = getProjectZyflowPath('/test/project')
      expect(result).toBe('/test/project/.zyflow')
    })

    it('getSettingsPath should return correct path', () => {
      const result = getSettingsPath('/test/project')
      expect(result).toBe('/test/project/.zyflow/settings.json')
    })

    it('getEnvironmentFilePath should return correct path', () => {
      const result = getEnvironmentFilePath('/test/project', 'local')
      expect(result).toBe('/test/project/.zyflow/environments/local.env')
    })
  })

  describe('Directory Operations', () => {
    it('hasZyflowDir should return false for non-existent directory', async () => {
      const result = await hasZyflowDir(tempDir)
      expect(result).toBe(false)
    })

    it('ensureZyflowDir should create .zyflow directory', async () => {
      await ensureZyflowDir(tempDir)
      const result = await hasZyflowDir(tempDir)
      expect(result).toBe(true)
    })

    it('initLocalZyflow should create default structure', async () => {
      const result = await initLocalZyflow(tempDir)

      expect(result.zyflowPath).toBe(join(tempDir, '.zyflow'))
      expect(result.settingsCreated).toBe(true)
      expect(result.environmentsDir).toBe(join(tempDir, '.zyflow/environments'))

      // settings.json이 생성되었는지 확인
      const hasSettings = await hasLocalSettings(tempDir)
      expect(hasSettings).toBe(true)
    })

    it('initLocalZyflow should not overwrite existing settings', async () => {
      // 먼저 초기화
      await initLocalZyflow(tempDir)

      // 설정 수정
      const settings = await loadLocalSettings(tempDir)
      settings!.integrations.github = 'test-uuid'
      await saveLocalSettings(tempDir, settings!)

      // 다시 초기화
      const result = await initLocalZyflow(tempDir)
      expect(result.settingsCreated).toBe(false)

      // 기존 설정이 유지되는지 확인
      const reloadedSettings = await loadLocalSettings(tempDir)
      expect(reloadedSettings?.integrations.github).toBe('test-uuid')
    })
  })

  describe('Settings File Operations', () => {
    it('loadLocalSettings should return null for non-existent file', async () => {
      const result = await loadLocalSettings(tempDir)
      expect(result).toBeNull()
    })

    it('saveLocalSettings and loadLocalSettings should work correctly', async () => {
      const settings = createDefaultLocalSettings()
      settings.integrations.github = 'github-uuid'
      settings.defaultEnvironment = 'staging'

      await saveLocalSettings(tempDir, settings)
      const loaded = await loadLocalSettings(tempDir)

      expect(loaded).not.toBeNull()
      expect(loaded?.integrations.github).toBe('github-uuid')
      expect(loaded?.defaultEnvironment).toBe('staging')
      expect(loaded?.version).toBe(1)
    })
  })

  describe('Environment File Operations', () => {
    beforeEach(async () => {
      await initLocalZyflow(tempDir)
    })

    it('listLocalEnvironments should return empty array initially', async () => {
      const result = await listLocalEnvironments(tempDir)
      expect(result).toEqual([])
    })

    it('saveLocalEnvironment should create .env file', async () => {
      const variables = {
        DATABASE_URL: 'postgres://localhost/db',
        API_KEY: 'secret-key',
      }

      await saveLocalEnvironment(tempDir, 'local', variables)

      const envs = await listLocalEnvironments(tempDir)
      expect(envs).toContain('local')
    })

    it('loadLocalEnvironment should read .env file correctly', async () => {
      const variables = {
        DATABASE_URL: 'postgres://localhost/db',
        API_KEY: 'secret-key',
        MULTILINE: 'line1\nline2',
      }

      await saveLocalEnvironment(tempDir, 'local', variables)
      const loaded = await loadLocalEnvironment(tempDir, 'local')

      expect(loaded).not.toBeNull()
      expect(loaded?.DATABASE_URL).toBe('postgres://localhost/db')
      expect(loaded?.API_KEY).toBe('secret-key')
    })

    it('loadLocalEnvironment should return null for non-existent file', async () => {
      const result = await loadLocalEnvironment(tempDir, 'nonexistent')
      expect(result).toBeNull()
    })

    it('should list multiple environments', async () => {
      await saveLocalEnvironment(tempDir, 'local', { KEY: 'local' })
      await saveLocalEnvironment(tempDir, 'staging', { KEY: 'staging' })
      await saveLocalEnvironment(tempDir, 'production', { KEY: 'prod' })

      const envs = await listLocalEnvironments(tempDir)
      expect(envs).toHaveLength(3)
      expect(envs).toContain('local')
      expect(envs).toContain('staging')
      expect(envs).toContain('production')
    })
  })

  describe('Test Accounts Operations', () => {
    beforeEach(async () => {
      await initLocalZyflow(tempDir)
    })

    it('hasLocalTestAccounts should return false initially', async () => {
      const result = await hasLocalTestAccounts(tempDir)
      expect(result).toBe(false)
    })

    it('saveLocalTestAccounts and loadLocalTestAccounts should work', async () => {
      const accounts: LocalTestAccount[] = [
        {
          id: 'acc-1',
          role: 'admin',
          email: 'admin@test.com',
          password: await encryptTestAccountPassword('admin123'),
        },
        {
          id: 'acc-2',
          role: 'user',
          email: 'user@test.com',
          password: await encryptTestAccountPassword('user123'),
          description: 'Regular user',
        },
      ]

      await saveLocalTestAccounts(tempDir, accounts)

      const hasAccounts = await hasLocalTestAccounts(tempDir)
      expect(hasAccounts).toBe(true)

      const loaded = await loadLocalTestAccounts(tempDir)
      expect(loaded).toHaveLength(2)
      expect(loaded?.[0].role).toBe('admin')
      expect(loaded?.[0].email).toBe('admin@test.com')
      expect(loaded?.[1].description).toBe('Regular user')
    })
  })

  describe('Password Encryption', () => {
    it('should encrypt and decrypt password correctly', async () => {
      const originalPassword = 'my-secret-password-123!'

      const encrypted = await encryptTestAccountPassword(originalPassword)
      expect(encrypted).not.toBe(originalPassword)
      expect(encrypted).toContain(':') // IV:ciphertext 형식

      const decrypted = await decryptTestAccountPassword(encrypted)
      expect(decrypted).toBe(originalPassword)
    })

    it('should handle empty password', async () => {
      const encrypted = await encryptTestAccountPassword('')
      const decrypted = await decryptTestAccountPassword(encrypted)
      expect(decrypted).toBe('')
    })
  })
})

describe('Local Settings - Fallback Logic', () => {
  // Fallback 로직 테스트는 실제 DB 연결이 필요하므로
  // 여기서는 SettingsResolver의 로직만 단위 테스트

  describe('SettingsResolver', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'zyflow-resolver-test-'))
    })

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true })
    })

    it('should detect local settings when present', async () => {
      // 로컬 설정 생성
      await initLocalZyflow(tempDir)

      const hasLocal = await hasLocalSettings(tempDir)
      expect(hasLocal).toBe(true)
    })

    it('should return false when no local settings', async () => {
      const hasLocal = await hasLocalSettings(tempDir)
      expect(hasLocal).toBe(false)
    })
  })
})

describe('Local Settings - Migration Scenarios', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'zyflow-migration-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should handle migration from no settings to local settings', async () => {
    // 1. 처음에는 로컬 설정 없음
    expect(await hasLocalSettings(tempDir)).toBe(false)

    // 2. 초기화로 로컬 설정 생성
    const result = await initLocalZyflow(tempDir)
    expect(result.settingsCreated).toBe(true)
    expect(await hasLocalSettings(tempDir)).toBe(true)

    // 3. 계정 매핑 추가
    const settings = await loadLocalSettings(tempDir)
    settings!.integrations.github = 'github-account-uuid'
    await saveLocalSettings(tempDir, settings!)

    // 4. 환경 변수 추가
    await saveLocalEnvironment(tempDir, 'local', {
      DATABASE_URL: 'postgres://localhost/dev',
    })

    // 5. 확인
    const finalSettings = await loadLocalSettings(tempDir)
    expect(finalSettings?.integrations.github).toBe('github-account-uuid')

    const envs = await listLocalEnvironments(tempDir)
    expect(envs).toContain('local')
  })

  it('should preserve settings after re-initialization', async () => {
    // 1. 초기 설정 생성
    await initLocalZyflow(tempDir)
    const settings = await loadLocalSettings(tempDir)
    settings!.integrations.supabase = 'supabase-uuid'
    settings!.defaultEnvironment = 'staging'
    await saveLocalSettings(tempDir, settings!)

    // 2. 환경 파일 추가
    await saveLocalEnvironment(tempDir, 'staging', { KEY: 'value' })

    // 3. 다시 초기화 (기존 데이터 유지되어야 함)
    const result = await initLocalZyflow(tempDir)
    expect(result.settingsCreated).toBe(false) // 이미 존재하므로 새로 생성 안 함

    // 4. 데이터 확인
    const reloadedSettings = await loadLocalSettings(tempDir)
    expect(reloadedSettings?.integrations.supabase).toBe('supabase-uuid')
    expect(reloadedSettings?.defaultEnvironment).toBe('staging')

    const envs = await listLocalEnvironments(tempDir)
    expect(envs).toContain('staging')
  })
})
