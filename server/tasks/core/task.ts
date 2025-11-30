import { eq, desc, asc, and, inArray, ne, lt } from 'drizzle-orm';
import { getDb, getSqlite } from '../db/client.js';
import { tasks, Task, NewTask, TaskStatus, TaskPriority } from '../db/schema.js';

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  assignee?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  assignee?: string;
  order?: number;
}

export interface ListTasksOptions {
  projectId?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority;
  tags?: string[];
  assignee?: string;
  limit?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'priority' | 'order';
  orderDir?: 'asc' | 'desc';
  includeArchived?: boolean; // 기본값 false - archived 제외
}

// 순차 번호로 Task ID 생성 (1, 2, 3, ...)
function generateTaskId(): number {
  const sqlite = getSqlite();

  // 트랜잭션으로 순차 번호 증가 및 반환
  const result = sqlite.prepare(`
    UPDATE sequences SET value = value + 1 WHERE name = 'task' RETURNING value
  `).get() as { value: number } | undefined;

  return result?.value ?? 1;
}

export function createTask(input: CreateTaskInput): Task {
  const db = getDb();
  const now = new Date();
  const taskId = generateTaskId();

  const newTask: NewTask = {
    id: taskId,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    status: input.status || 'todo',
    priority: input.priority || 'medium',
    tags: input.tags ? JSON.stringify(input.tags) : null,
    assignee: input.assignee,
    order: 0,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(tasks).values(newTask).run();

  return getTask(taskId)!;
}

export function getTask(id: number | string): Task | null {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  const db = getDb();
  const result = db.select().from(tasks).where(eq(tasks.id, numId)).get();
  return result || null;
}

export function listTasks(options: ListTasksOptions = {}): Task[] {
  const db = getDb();
  const conditions = [];

  // 기본적으로 archived 제외 (includeArchived가 true가 아닌 경우)
  if (!options.includeArchived) {
    conditions.push(ne(tasks.status, 'archived'));
  }

  if (options.projectId) {
    conditions.push(eq(tasks.projectId, options.projectId));
  }

  if (options.status) {
    if (Array.isArray(options.status)) {
      conditions.push(inArray(tasks.status, options.status));
    } else {
      conditions.push(eq(tasks.status, options.status));
    }
  }

  if (options.priority) {
    conditions.push(eq(tasks.priority, options.priority));
  }

  if (options.assignee) {
    conditions.push(eq(tasks.assignee, options.assignee));
  }

  let query = db.select().from(tasks);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  // Apply ordering
  const orderColumn = options.orderBy || 'createdAt';
  const orderDir = options.orderDir || 'desc';

  const orderMap = {
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
    priority: tasks.priority,
    order: tasks.order,
  };

  const orderFn = orderDir === 'asc' ? asc : desc;
  query = query.orderBy(orderFn(orderMap[orderColumn])) as typeof query;

  if (options.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  let results = query.all();

  // Filter by tags (post-processing since tags is JSON)
  if (options.tags && options.tags.length > 0) {
    results = results.filter((task) => {
      if (!task.tags) return false;
      const taskTags = JSON.parse(task.tags) as string[];
      return options.tags!.some((tag) => taskTags.includes(tag));
    });
  }

  return results;
}

export function updateTask(id: number | string, input: UpdateTaskInput): Task | null {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  const db = getDb();
  const existing = getTask(numId);

  if (!existing) {
    return null;
  }

  const updates: Partial<NewTask> = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.status !== undefined) updates.status = input.status;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
  if (input.assignee !== undefined) updates.assignee = input.assignee;
  if (input.order !== undefined) updates.order = input.order;

  db.update(tasks).set(updates).where(eq(tasks.id, numId)).run();

  return getTask(numId);
}

export function deleteTask(id: number | string): boolean {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  const db = getDb();
  const existing = getTask(numId);

  if (!existing) {
    return false;
  }

  db.delete(tasks).where(eq(tasks.id, numId)).run();
  return true;
}

export function moveTask(id: number | string, status: TaskStatus, order?: number): Task | null {
  return updateTask(id, { status, order });
}

export function getTasksByStatus(projectId?: string, includeArchived = false): Record<TaskStatus, Task[]> {
  const allTasks = listTasks({ projectId, orderBy: 'order', orderDir: 'asc', includeArchived });

  const result: Record<TaskStatus, Task[]> = {
    'todo': [],
    'in-progress': [],
    'review': [],
    'done': [],
    'archived': [],
  };

  for (const task of allTasks) {
    result[task.status as TaskStatus].push(task);
  }

  return result;
}

// Task를 Archive로 이동
export function archiveTask(id: number | string): Task | null {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  const db = getDb();
  const existing = getTask(numId);

  if (!existing) {
    return null;
  }

  const now = new Date();
  db.update(tasks)
    .set({
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
    })
    .where(eq(tasks.id, numId))
    .run();

  return getTask(numId);
}

// Done 상태에서 일정 기간 지난 Task들을 자동으로 Archive
export function autoArchiveOldTasks(daysOld = 7): number {
  const db = getDb();
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);

  // done 상태이고 updatedAt이 cutoffDate보다 오래된 태스크들을 archive
  const result = db.update(tasks)
    .set({
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(tasks.status, 'done'),
        lt(tasks.updatedAt, cutoffDate)
      )
    )
    .run();

  return result.changes;
}

// Archive된 Task 복원 (done으로)
export function unarchiveTask(id: number | string): Task | null {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  const db = getDb();
  const existing = getTask(numId);

  if (!existing || existing.status !== 'archived') {
    return null;
  }

  db.update(tasks)
    .set({
      status: 'done',
      archivedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, numId))
    .run();

  return getTask(numId);
}
