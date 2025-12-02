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

/**
 * 프로젝트 경로 변경
 */
export async function updateProjectPath(projectId: string, newPath: string): Promise<Project> {
  const config = await loadConfig()
  const projectIndex = config.projects.findIndex((p) => p.id === projectId)

  if (projectIndex === -1) {
    throw new Error(`Project not found: ${projectId}`)
  }

  config.projects[projectIndex].path = newPath
  await saveConfig(config)
  return config.projects[projectIndex]
}

/**
 * 프로젝트 순서 변경
 */
export async function reorderProjects(projectIds: string[]): Promise<Project[]> {
  const config = await loadConfig()

  // 새로운 순서로 프로젝트 배열 재구성
  const reorderedProjects: Project[] = []
  for (const id of projectIds) {
    const project = config.projects.find((p) => p.id === id)
    if (project) {
      reorderedProjects.push(project)
    }
  }

  // 누락된 프로젝트가 있으면 추가 (안전장치)
  for (const project of config.projects) {
    if (!reorderedProjects.find((p) => p.id === project.id)) {
      reorderedProjects.push(project)
    }
  }

  config.projects = reorderedProjects
  await saveConfig(config)
  return config.projects
}
