import { getSqlite, getDb } from '../db/client.js'
import { tasks, Task } from '../db/schema.js'
import { inArray, eq, and, ne } from 'drizzle-orm'

export interface SearchResult {
  id: string
  title: string
  description: string | null
  snippet: string
  rank: number
}

export interface SearchOptions {
  limit?: number
  status?: string
  priority?: string
  projectId?: string // 프로젝트별 필터링
  includeArchived?: boolean // archived 포함 여부
}

export function searchTasks(query: string, options: SearchOptions = {}): Task[] {
  const sqlite = getSqlite()
  const db = getDb()
  const limit = options.limit || 20

  // Use FTS5 to search
  // Quote the query to handle special characters
  const ftsQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"*`)
    .join(' OR ')

  if (!ftsQuery) {
    return []
  }

  const stmt = sqlite.prepare(`
    SELECT tasks.id, bm25(tasks_fts) as rank
    FROM tasks_fts
    JOIN tasks ON tasks.id = tasks_fts.id
    WHERE tasks_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `)

  const searchResults = stmt.all(ftsQuery, limit) as Array<{ id: number; rank: number }>

  if (searchResults.length === 0) {
    return []
  }

  // Fetch full task data with IN clause (fix N+1 query)
  const taskIds = searchResults.map((r) => r.id)

  // Build filter conditions
  const conditions = [inArray(tasks.id, taskIds)]
  if (options.projectId) conditions.push(eq(tasks.projectId, options.projectId))
  if (options.status) conditions.push(eq(tasks.status, options.status as Task['status']))
  if (options.priority) conditions.push(eq(tasks.priority, options.priority as Task['priority']))
  if (!options.includeArchived) conditions.push(ne(tasks.status, 'archived'))

  const fullTasks = db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .all()

  // Maintain original search ranking order
  const taskMap = new Map(fullTasks.map((t) => [t.id, t]))
  return taskIds.map((id) => taskMap.get(id)).filter((t): t is Task => !!t)
}

export function rebuildSearchIndex(): void {
  const sqlite = getSqlite()

  // Rebuild the FTS index from scratch
  sqlite.exec(`
    INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');
  `)
}
