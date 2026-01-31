/**
 * Unified SPEC Scanner (SPEC-VISIBILITY-001)
 *
 * Scans both MoAI (.moai/specs/) and OpenSpec (openspec/specs/) directories
 * to provide a unified view of all SPEC documents in a project.
 *
 * Features:
 * - Dual-format support (MoAI and OpenSpec)
 * - Graceful handling of missing directories
 * - Deduplication with MoAI priority
 * - Caching with 60-second TTL
 * - Migration candidate detection
 */
import { readdir, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

import {
  type UnifiedSpec,
  type SpecFormat,
  type ScanResult,
  type CacheEntry,
  type MigrationStatus,
  SpecStatusSchema,
  SpecPrioritySchema,
} from './types/spec.js'

// =============================================
// Status Normalization
// =============================================

/**
 * Valid status values for SPEC documents
 */
const VALID_STATUSES = [
  'planned',
  'active',
  'completed',
  'blocked',
  'archived',
  'draft',
] as const

type SpecStatus = (typeof VALID_STATUSES)[number]

/**
 * Normalize status from frontmatter to valid database status
 * Handles case variations, aliases, and invalid values
 *
 * @param rawStatus - Raw status value from frontmatter
 * @returns Normalized status value, defaults to 'planned'
 */
export function normalizeStatus(rawStatus: unknown): SpecStatus {
  if (typeof rawStatus !== 'string') {
    return 'planned'
  }

  const normalized = rawStatus.toLowerCase().trim()

  switch (normalized) {
    case 'planned':
      return 'planned'
    case 'active':
      return 'active'
    case 'completed':
    case 'complete':
      return 'completed'
    case 'blocked':
      return 'blocked'
    case 'archived':
      return 'archived'
    case 'draft':
      return 'draft'
    default:
      return 'planned'
  }
}

/**
 * Normalize priority from frontmatter
 *
 * @param rawPriority - Raw priority value from frontmatter
 * @returns Normalized priority value, defaults to 'medium'
 */
function normalizePriority(
  rawPriority: unknown
): 'high' | 'medium' | 'low' {
  if (typeof rawPriority !== 'string') {
    return 'medium'
  }

  const normalized = rawPriority.toLowerCase().trim()

  switch (normalized) {
    case 'high':
    case 'critical':
    case 'urgent':
      return 'high'
    case 'medium':
    case 'normal':
      return 'medium'
    case 'low':
    case 'minor':
      return 'low'
    default:
      return 'medium'
  }
}

// =============================================
// Caching Layer (TAG-010)
// =============================================

/** Cache TTL in milliseconds (60 seconds) */
const CACHE_TTL_MS = 60 * 1000

/** In-memory cache for scan results */
const scanCache = new Map<string, CacheEntry>()

/**
 * Get cached result if valid
 *
 * @param cacheKey - Cache key (project path)
 * @returns Cached ScanResult or null if expired/missing
 */
function getCachedResult(cacheKey: string): ScanResult | null {
  const entry = scanCache.get(cacheKey)
  if (!entry) {
    return null
  }

  if (Date.now() > entry.expiresAt) {
    scanCache.delete(cacheKey)
    return null
  }

  return entry.result
}

/**
 * Store result in cache
 *
 * @param cacheKey - Cache key (project path)
 * @param result - Scan result to cache
 */
function setCachedResult(cacheKey: string, result: ScanResult): void {
  scanCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

/**
 * Clear cache for a specific project or all projects
 *
 * @param cacheKey - Optional specific cache key to clear
 */
export function clearCache(cacheKey?: string): void {
  if (cacheKey) {
    scanCache.delete(cacheKey)
  } else {
    scanCache.clear()
  }
}

// =============================================
// MoAI SPEC Scanner
// =============================================

/**
 * Scan .moai/specs/ directory for SPEC documents
 *
 * @param projectPath - Path to the project root
 * @returns Array of UnifiedSpec objects from MoAI format
 */
export async function scanMoaiSpecs(
  projectPath: string
): Promise<{ specs: UnifiedSpec[]; errors: string[] }> {
  const specs: UnifiedSpec[] = []
  const errors: string[] = []
  const specsDir = join(projectPath, '.moai', 'specs')

  if (!existsSync(specsDir)) {
    return { specs, errors }
  }

  try {
    const entries = await readdir(specsDir)
    const specDirs = entries.filter((e) => e.startsWith('SPEC-'))

    for (const specId of specDirs) {
      const specDir = join(specsDir, specId)

      try {
        const specStat = await stat(specDir)
        if (!specStat.isDirectory()) continue

        const specPath = join(specDir, 'spec.md')
        const relativePath = `.moai/specs/${specId}/spec.md`

        if (!existsSync(specPath)) {
          continue
        }

        try {
          const content = await readFile(specPath, 'utf-8')
          const { data: frontmatter } = matter(content)

          const spec: UnifiedSpec = {
            spec_id: specId,
            title: String(frontmatter.title || specId),
            status: normalizeStatus(frontmatter.status),
            priority: normalizePriority(frontmatter.priority),
            format: 'moai' as SpecFormat,
            sourcePath: relativePath,
            created: frontmatter.created
              ? String(frontmatter.created)
              : undefined,
            updated: frontmatter.updated
              ? String(frontmatter.updated)
              : undefined,
            tags: Array.isArray(frontmatter.tags)
              ? frontmatter.tags.map(String)
              : undefined,
            domain: frontmatter.domain
              ? String(frontmatter.domain)
              : undefined,
          }

          specs.push(spec)
        } catch (err) {
          errors.push(
            `Failed to parse ${specId}/spec.md: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      } catch (err) {
        errors.push(
          `Failed to read ${specId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }
    }
  } catch (err) {
    errors.push(
      `Failed to scan .moai/specs: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }

  return { specs, errors }
}

// =============================================
// OpenSpec Scanner
// =============================================

/**
 * Scan openspec/specs/ or openspec/changes/ directory for SPEC documents
 * Gracefully handles missing directories
 *
 * @param projectPath - Path to the project root
 * @returns Array of UnifiedSpec objects from OpenSpec format
 */
export async function scanOpenSpecs(
  projectPath: string
): Promise<{ specs: UnifiedSpec[]; errors: string[] }> {
  const specs: UnifiedSpec[] = []
  const errors: string[] = []

  // Try both openspec/specs and openspec/changes directories
  const specsDir = join(projectPath, 'openspec', 'specs')
  const changesDir = join(projectPath, 'openspec', 'changes')

  // Scan openspec/specs if exists
  if (existsSync(specsDir)) {
    const result = await scanOpenSpecDirectory(specsDir, projectPath, 'specs')
    specs.push(...result.specs)
    errors.push(...result.errors)
  }

  // Scan openspec/changes if exists
  if (existsSync(changesDir)) {
    const result = await scanOpenSpecDirectory(
      changesDir,
      projectPath,
      'changes'
    )
    specs.push(...result.specs)
    errors.push(...result.errors)
  }

  return { specs, errors }
}

/**
 * Scan a specific OpenSpec directory
 *
 * @param directory - Directory to scan
 * @param projectPath - Project root path
 * @param dirType - Type of directory ('specs' or 'changes')
 * @returns Scan results
 */
async function scanOpenSpecDirectory(
  directory: string,
  projectPath: string,
  dirType: 'specs' | 'changes'
): Promise<{ specs: UnifiedSpec[]; errors: string[] }> {
  const specs: UnifiedSpec[] = []
  const errors: string[] = []

  try {
    const entries = await readdir(directory, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue

      const changeId = entry.name
      const changeDir = join(directory, changeId)

      // Try to find proposal.md or spec.md
      const proposalPath = join(changeDir, 'proposal.md')
      const specPath = join(changeDir, 'spec.md')

      let filePath = ''
      if (existsSync(proposalPath)) {
        filePath = proposalPath
      } else if (existsSync(specPath)) {
        filePath = specPath
      } else {
        continue
      }

      const fileName = existsSync(proposalPath) ? 'proposal.md' : 'spec.md'
      const relativePath = `openspec/${dirType}/${changeId}/${fileName}`

      try {
        const content = await readFile(filePath, 'utf-8')
        const { data: frontmatter, content: bodyContent } = matter(content)

        // Extract title from frontmatter or first heading
        let title = String(frontmatter.title || changeId)
        if (!frontmatter.title) {
          const titleMatch = bodyContent.match(/^#\s+(?:Change:\s+)?(.+)$/m)
          if (titleMatch) {
            title = titleMatch[1].trim()
          }
        }

        const spec: UnifiedSpec = {
          spec_id: changeId,
          title,
          status: normalizeStatus(frontmatter.status),
          priority: normalizePriority(frontmatter.priority),
          format: 'openspec' as SpecFormat,
          sourcePath: relativePath,
          created: frontmatter.created
            ? String(frontmatter.created)
            : undefined,
          updated: frontmatter.updated
            ? String(frontmatter.updated)
            : undefined,
          tags: Array.isArray(frontmatter.tags)
            ? frontmatter.tags.map(String)
            : undefined,
          domain: frontmatter.domain ? String(frontmatter.domain) : undefined,
        }

        specs.push(spec)
      } catch (err) {
        errors.push(
          `Failed to parse ${changeId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }
    }
  } catch (err) {
    errors.push(
      `Failed to scan openspec/${dirType}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }

  return { specs, errors }
}

// =============================================
// Merge and Deduplication
// =============================================

/**
 * Merge spec lists with deduplication
 * MoAI specs take priority over OpenSpec when IDs match
 *
 * @param moaiSpecs - Specs from MoAI format
 * @param openSpecs - Specs from OpenSpec format
 * @returns Merged and deduplicated spec list
 */
export function mergeSpecLists(
  moaiSpecs: UnifiedSpec[],
  openSpecs: UnifiedSpec[]
): UnifiedSpec[] {
  const merged: Map<string, UnifiedSpec> = new Map()
  const moaiIds = new Set(moaiSpecs.map((s) => s.spec_id))

  // Add all MoAI specs first (priority)
  for (const spec of moaiSpecs) {
    merged.set(spec.spec_id, spec)
  }

  // Add OpenSpec specs, marking duplicates as migration candidates
  for (const spec of openSpecs) {
    if (merged.has(spec.spec_id)) {
      // This spec exists in both formats - mark as migration candidate
      const moaiSpec = merged.get(spec.spec_id)!
      moaiSpec.migrationCandidate = true
    } else {
      merged.set(spec.spec_id, spec)
    }
  }

  return Array.from(merged.values())
}

// =============================================
// Main Scanner Function
// =============================================

/**
 * Scan all SPEC directories and return unified results
 * Uses caching for performance
 *
 * @param projectPath - Path to the project root
 * @param forceRefresh - Skip cache and force fresh scan
 * @returns Unified scan results
 */
export async function scanAllSpecs(
  projectPath: string,
  forceRefresh: boolean = false
): Promise<ScanResult> {
  const cacheKey = projectPath

  // Check cache unless force refresh
  if (!forceRefresh) {
    const cached = getCachedResult(cacheKey)
    if (cached) {
      return cached
    }
  }

  const allErrors: string[] = []

  // Scan both directories in parallel
  const [moaiResult, openResult] = await Promise.all([
    scanMoaiSpecs(projectPath),
    scanOpenSpecs(projectPath),
  ])

  allErrors.push(...moaiResult.errors, ...openResult.errors)

  // Merge with deduplication
  const specs = mergeSpecLists(moaiResult.specs, openResult.specs)

  const result: ScanResult = {
    specs,
    errors: allErrors,
    scannedAt: Date.now(),
  }

  // Store in cache
  setCachedResult(cacheKey, result)

  return result
}

// =============================================
// Remote SSH Support
// =============================================

/**
 * Remote plugin interface for SSH operations
 */
export interface RemotePlugin {
  listDirectory: (server: unknown, path: string) => Promise<{ entries: Array<{ name: string; type: string }> }>
  readRemoteFile: (server: unknown, path: string) => Promise<string>
}

/**
 * Scan MoAI SPECs from a remote server via SSH
 */
async function scanRemoteMoaiSpecs(
  projectPath: string,
  server: unknown,
  plugin: RemotePlugin
): Promise<{ specs: UnifiedSpec[]; errors: string[] }> {
  const specs: UnifiedSpec[] = []
  const errors: string[] = []
  const specsDir = `${projectPath}/.moai/specs`

  let listing: { entries: Array<{ name: string; type: string }> }
  try {
    listing = await plugin.listDirectory(server, specsDir)
  } catch {
    return { specs, errors }
  }

  const specDirs = listing.entries.filter(
    (entry) =>
      (entry.type === 'directory' || entry.type === 'd' || entry.type === 'Directory') &&
      entry.name.match(/^SPEC-[A-Z]+-\d+$/)
  )

  for (const entry of specDirs) {
    const specId = entry.name
    const specPath = `${specsDir}/${specId}`
    const relativePath = `.moai/specs/${specId}/spec.md`

    try {
      const content = await plugin.readRemoteFile(server, `${specPath}/spec.md`)
      const { data: frontmatter } = matter(content)

      const spec: UnifiedSpec = {
        spec_id: specId,
        title: String(frontmatter.title || specId),
        status: normalizeStatus(frontmatter.status),
        priority: normalizePriority(frontmatter.priority),
        format: 'moai' as SpecFormat,
        sourcePath: relativePath,
        created: frontmatter.created ? String(frontmatter.created) : undefined,
        updated: frontmatter.updated ? String(frontmatter.updated) : undefined,
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : undefined,
        domain: frontmatter.domain ? String(frontmatter.domain) : undefined,
      }

      specs.push(spec)
    } catch (err) {
      errors.push(`Failed to parse ${specId}/spec.md: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { specs, errors }
}

/**
 * Scan OpenSpec from a remote server via SSH
 */
async function scanRemoteOpenSpecs(
  projectPath: string,
  server: unknown,
  plugin: RemotePlugin
): Promise<{ specs: UnifiedSpec[]; errors: string[] }> {
  const specs: UnifiedSpec[] = []
  const errors: string[] = []

  const specsDir = `${projectPath}/openspec/specs`
  const changesDir = `${projectPath}/openspec/changes`

  // Scan openspec/specs if exists
  try {
    const listing = await plugin.listDirectory(server, specsDir)
    const result = await scanRemoteOpenSpecDirectory(specsDir, projectPath, 'specs', listing, server, plugin)
    specs.push(...result.specs)
    errors.push(...result.errors)
  } catch {
    // Directory doesn't exist
  }

  // Scan openspec/changes if exists
  try {
    const listing = await plugin.listDirectory(server, changesDir)
    const result = await scanRemoteOpenSpecDirectory(changesDir, projectPath, 'changes', listing, server, plugin)
    specs.push(...result.specs)
    errors.push(...result.errors)
  } catch {
    // Directory doesn't exist
  }

  return { specs, errors }
}

/**
 * Scan a specific OpenSpec directory on remote server
 */
async function scanRemoteOpenSpecDirectory(
  directory: string,
  projectPath: string,
  dirType: 'specs' | 'changes',
  listing: { entries: Array<{ name: string; type: string }> },
  server: unknown,
  plugin: RemotePlugin
): Promise<{ specs: UnifiedSpec[]; errors: string[] }> {
  const specs: UnifiedSpec[] = []
  const errors: string[] = []

  for (const entry of listing.entries) {
    if (entry.type !== 'directory' && entry.type !== 'd' && entry.type !== 'Directory') continue
    if (entry.name === 'archive') continue

    const changeId = entry.name
    const changeDir = `${directory}/${changeId}`

    // Try to find proposal.md or spec.md
    let filePath = ''
    let fileName = ''

    try {
      await plugin.readRemoteFile(server, `${changeDir}/proposal.md`)
      filePath = `${changeDir}/proposal.md`
      fileName = 'proposal.md'
    } catch {
      try {
        await plugin.readRemoteFile(server, `${changeDir}/spec.md`)
        filePath = `${changeDir}/spec.md`
        fileName = 'spec.md'
      } catch {
        continue
      }
    }

    const relativePath = `openspec/${dirType}/${changeId}/${fileName}`

    try {
      const content = await plugin.readRemoteFile(server, filePath)
      const { data: frontmatter, content: bodyContent } = matter(content)

      let title = String(frontmatter.title || changeId)
      if (!frontmatter.title) {
        const titleMatch = bodyContent.match(/^#\s+(?:Change:\s+)?(.+)$/m)
        if (titleMatch) {
          title = titleMatch[1].trim()
        }
      }

      const spec: UnifiedSpec = {
        spec_id: changeId,
        title,
        status: normalizeStatus(frontmatter.status),
        priority: normalizePriority(frontmatter.priority),
        format: 'openspec' as SpecFormat,
        sourcePath: relativePath,
        created: frontmatter.created ? String(frontmatter.created) : undefined,
        updated: frontmatter.updated ? String(frontmatter.updated) : undefined,
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : undefined,
        domain: frontmatter.domain ? String(frontmatter.domain) : undefined,
      }

      specs.push(spec)
    } catch (err) {
      errors.push(`Failed to parse ${changeId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { specs, errors }
}

/**
 * Scan all SPEC directories on a remote server via SSH
 *
 * @param projectPath - Path to the project root on remote server
 * @param serverId - Remote server ID
 * @returns Unified scan results
 */
export async function scanAllSpecsRemote(
  projectPath: string,
  serverId: string
): Promise<ScanResult> {
  const allErrors: string[] = []

  // Load remote plugin
  let plugin: RemotePlugin & { getRemoteServerById: (id: string) => Promise<unknown> }
  try {
    plugin = await import('@zyflow/remote-plugin')
  } catch {
    return {
      specs: [],
      errors: ['Remote plugin not installed'],
      scannedAt: Date.now(),
    }
  }

  const server = await plugin.getRemoteServerById(serverId)
  if (!server) {
    return {
      specs: [],
      errors: [`Server not found: ${serverId}`],
      scannedAt: Date.now(),
    }
  }

  // Scan both directories in parallel
  const [moaiResult, openResult] = await Promise.all([
    scanRemoteMoaiSpecs(projectPath, server, plugin),
    scanRemoteOpenSpecs(projectPath, server, plugin),
  ])

  allErrors.push(...moaiResult.errors, ...openResult.errors)

  // Merge with deduplication
  const specs = mergeSpecLists(moaiResult.specs, openResult.specs)

  return {
    specs,
    errors: allErrors,
    scannedAt: Date.now(),
  }
}

// =============================================
// Migration Status Helper
// =============================================

/**
 * Get migration status statistics
 *
 * @param projectPath - Path to the project root
 * @param forceRefresh - Skip cache and force fresh scan
 * @returns Migration status statistics
 */
export async function getMigrationStatus(
  projectPath: string,
  forceRefresh: boolean = false
): Promise<MigrationStatus> {
  const result = await scanAllSpecs(projectPath, forceRefresh)

  let moaiCount = 0
  let openspecCount = 0
  let migrationCandidates = 0

  for (const spec of result.specs) {
    if (spec.format === 'moai') {
      moaiCount++
    } else {
      openspecCount++
    }

    if (spec.migrationCandidate) {
      migrationCandidates++
    }
  }

  return {
    moaiCount,
    openspecCount,
    migrationCandidates,
    totalSpecs: result.specs.length,
  }
}
