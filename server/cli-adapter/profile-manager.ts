/**
 * CLI Profile Manager
 *
 * Manages CLI profiles including built-in and custom profiles.
 * Stores custom profiles in .zyflow/cli-profiles.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { CLIProfile, CLIType, DEFAULT_CLI_PROFILES } from './types.js'

const PROFILES_FILENAME = 'cli-profiles.json'

export class CLIProfileManager {
  private projectPath: string
  private profiles: Map<string, CLIProfile> = new Map()
  private loaded = false

  constructor(projectPath: string) {
    this.projectPath = projectPath
  }

  /**
   * Get the profiles file path
   */
  private getProfilesPath(): string {
    return join(this.projectPath, '.zyflow', PROFILES_FILENAME)
  }

  /**
   * Load profiles from disk
   */
  async load(): Promise<void> {
    // Initialize with built-in profiles
    for (const profile of DEFAULT_CLI_PROFILES) {
      this.profiles.set(profile.id, { ...profile })
    }

    // Load custom profiles
    const profilesPath = this.getProfilesPath()
    if (existsSync(profilesPath)) {
      try {
        const content = await readFile(profilesPath, 'utf-8')
        const data = JSON.parse(content) as { profiles: CLIProfile[] }
        const customProfiles = data.profiles || []
        for (const profile of customProfiles) {
          // Don't override built-in profiles
          if (!this.profiles.get(profile.id)?.builtin) {
            this.profiles.set(profile.id, profile)
          }
        }
      } catch (error) {
        console.error('Failed to load CLI profiles:', error)
      }
    }

    this.loaded = true
  }

  /**
   * Save custom profiles to disk
   */
  async save(): Promise<void> {
    const customProfiles = Array.from(this.profiles.values()).filter(p => !p.builtin)

    const zyflowDir = join(this.projectPath, '.zyflow')
    if (!existsSync(zyflowDir)) {
      await mkdir(zyflowDir, { recursive: true })
    }

    await writeFile(
      this.getProfilesPath(),
      JSON.stringify({ profiles: customProfiles }, null, 2),
      'utf-8'
    )
  }

  /**
   * Ensure profiles are loaded
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load()
    }
  }

  /**
   * Get all profiles
   */
  async getAll(): Promise<CLIProfile[]> {
    await this.ensureLoaded()
    return Array.from(this.profiles.values())
  }

  /**
   * Get built-in profiles only
   */
  async getBuiltin(): Promise<CLIProfile[]> {
    await this.ensureLoaded()
    return Array.from(this.profiles.values()).filter(p => p.builtin)
  }

  /**
   * Get custom profiles only
   */
  async getCustom(): Promise<CLIProfile[]> {
    await this.ensureLoaded()
    return Array.from(this.profiles.values()).filter(p => !p.builtin)
  }

  /**
   * Get a profile by ID
   */
  async get(id: string): Promise<CLIProfile | undefined> {
    await this.ensureLoaded()
    return this.profiles.get(id)
  }

  /**
   * Add or update a custom profile
   */
  async upsert(profile: CLIProfile): Promise<void> {
    await this.ensureLoaded()

    // Can't modify built-in profiles
    if (this.profiles.get(profile.id)?.builtin) {
      throw new Error(`Cannot modify built-in profile: ${profile.id}`)
    }

    this.profiles.set(profile.id, { ...profile, builtin: false })
    await this.save()
  }

  /**
   * Delete a custom profile
   */
  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded()

    const profile = this.profiles.get(id)
    if (!profile) {
      return false
    }

    if (profile.builtin) {
      throw new Error(`Cannot delete built-in profile: ${id}`)
    }

    this.profiles.delete(id)
    await this.save()
    return true
  }

  /**
   * Create a custom profile from a command string
   */
  async createFromCommand(
    name: string,
    command: string,
    options?: {
      args?: string[]
      mcpFlag?: string
      env?: Record<string, string>
      description?: string
      icon?: string
    }
  ): Promise<CLIProfile> {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const profile: CLIProfile = {
      id,
      name,
      type: 'custom' as CLIType,
      command,
      args: options?.args || [],
      mcpFlag: options?.mcpFlag,
      env: options?.env,
      description: options?.description,
      icon: options?.icon || '🔧',
      builtin: false,
    }

    await this.upsert(profile)
    return profile
  }

  /**
   * Check if a CLI command is available
   */
  async checkAvailability(profileId: string): Promise<{
    available: boolean
    version?: string
    error?: string
  }> {
    const profile = await this.get(profileId)
    if (!profile) {
      return { available: false, error: 'Profile not found' }
    }

    const { spawn } = await import('child_process')

    return new Promise(resolve => {
      const proc = spawn(profile.command, ['--version'], {
        shell: true,
        timeout: 5000,
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', data => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', data => {
        stderr += data.toString()
      })

      proc.on('error', _error => {
        resolve({
          available: false,
          error: `Command not found: ${profile.command}`,
        })
      })

      proc.on('close', code => {
        if (code === 0) {
          resolve({
            available: true,
            version: stdout.trim() || stderr.trim(),
          })
        } else {
          // Some CLIs return non-zero for --version but still work
          resolve({
            available: true,
            version: stdout.trim() || stderr.trim(),
          })
        }
      })

      // Timeout
      setTimeout(() => {
        proc.kill()
        resolve({
          available: false,
          error: 'Command timed out',
        })
      }, 5000)
    })
  }

  /**
   * Get available (installed) CLIs
   */
  async getAvailable(): Promise<Array<CLIProfile & { version?: string }>> {
    await this.ensureLoaded()
    const results: Array<CLIProfile & { version?: string }> = []

    for (const profile of this.profiles.values()) {
      const check = await this.checkAvailability(profile.id)
      if (check.available) {
        results.push({ ...profile, version: check.version })
      }
    }

    return results
  }
}

// Singleton instance
let profileManager: CLIProfileManager | null = null

export function getProfileManager(projectPath?: string): CLIProfileManager {
  if (!profileManager && projectPath) {
    profileManager = new CLIProfileManager(projectPath)
  }
  if (!profileManager) {
    throw new Error('Profile manager not initialized. Provide projectPath.')
  }
  return profileManager
}

export function initProfileManager(projectPath: string): CLIProfileManager {
  profileManager = new CLIProfileManager(projectPath)
  return profileManager
}
