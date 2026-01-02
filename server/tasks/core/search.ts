import { getSqlite, getDb } from '../db/client.js';
import { tasks, Task } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface SearchResult {
  id: string;
  title: string;
  description: string | null;
  snippet: string;
  rank: number;
}

export interface SearchOptions {
  limit?: number;
  status?: string;
  priority?: string;
  projectId?: string; // 프로젝트별 필터링
  includeArchived?: boolean; // archived 포함 여부
}

export function searchTasks(query: string, options: SearchOptions = {}): Task[] {
  const sqlite = getSqlite();
  const db = getDb();
  const limit = options.limit || 20;

  // Use FTS5 to search
  // Quote the query to handle special characters
  const ftsQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"*`)
    .join(' OR ');

  if (!ftsQuery) {
    return [];
  }

  const stmt = sqlite.prepare(`
    SELECT tasks.id, bm25(tasks_fts) as rank
    FROM tasks_fts
    JOIN tasks ON tasks.id = tasks_fts.id
    WHERE tasks_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  const searchResults = stmt.all(ftsQuery, limit) as Array<{ id: number; rank: number }>;

  if (searchResults.length === 0) {
    return [];
  }

  // Fetch full task data
  const taskIds = searchResults.map((r) => r.id);
  const fullTasks: Task[] = [];

  for (const id of taskIds) {
    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (task) {
      // Apply additional filters
      if (options.projectId && task.projectId !== options.projectId) continue;
      if (options.status && task.status !== options.status) continue;
      if (options.priority && task.priority !== options.priority) continue;
      // 기본적으로 archived 제외 (includeArchived가 true가 아닌 경우)
      if (!options.includeArchived && task.status === 'archived') continue;
      fullTasks.push(task);
    }
  }

  return fullTasks;
}

export function rebuildSearchIndex(): void {
  const sqlite = getSqlite();

  // Rebuild the FTS index from scratch
  sqlite.exec(`
    INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');
  `);
}
