import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

export interface Project {
  id: string
  name: string
  path: string
  addedAt: string
}

export interface Config {
  projects: Project[]
  activeProjectId: string | null
}

const CONFIG_DIR = join(homedir(), '.zyflow')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: Config = {
  projects: [],
  activeProjectId: null,
}

export async function ensureConfigDir(): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true })
  } catch {
    // Directory exists
  }
}

export async function loadConfig(): Promise<Config> {
  try {
    await ensureConfigDir()
    const content = await readFile(CONFIG_FILE, 'utf-8')
    return JSON.parse(content) as Config
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureConfigDir()
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

export async function addProject(name: string, path: string): Promise<Project> {
  const config = await loadConfig()

  // Generate ID from path
  const id = path.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

  // Check if already exists
  const existing = config.projects.find((p) => p.path === path)
  if (existing) {
    return existing
  }

  const project: Project = {
    id,
    name,
    path,
    addedAt: new Date().toISOString(),
  }

  config.projects.push(project)

  // Set as active if it's the first project
  if (!config.activeProjectId) {
    config.activeProjectId = project.id
  }

  await saveConfig(config)
  return project
}

export async function removeProject(projectId: string): Promise<void> {
  const config = await loadConfig()
  config.projects = config.projects.filter((p) => p.id !== projectId)

  // Clear active if removed
  if (config.activeProjectId === projectId) {
    config.activeProjectId = config.projects[0]?.id || null
  }

  await saveConfig(config)
}

export async function setActiveProject(projectId: string): Promise<void> {
  const config = await loadConfig()
  const project = config.projects.find((p) => p.id === projectId)

  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  config.activeProjectId = projectId
  await saveConfig(config)
}

export async function getActiveProject(): Promise<Project | null> {
  const config = await loadConfig()
  if (!config.activeProjectId) return null
  return config.projects.find((p) => p.id === config.activeProjectId) || null
}
