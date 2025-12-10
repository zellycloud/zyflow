// Database
export { initDb, getDb, closeDb, getDbPath } from './db/client.js';
export { tasks } from './db/schema.js';
export type { Task, NewTask, TaskStatus, TaskPriority, TaskOrigin } from './db/schema.js';

// Core operations
export {
  createTask,
  getTask,
  getTaskByOriginAndId,
  listTasks,
  updateTask,
  deleteTask,
  moveTask,
  getTasksByStatus,
  archiveTask,
  unarchiveTask,
  autoArchiveOldTasks,
} from './core/task.js';
export type { CreateTaskInput, UpdateTaskInput, ListTasksOptions } from './core/task.js';

// Search
export { searchTasks, rebuildSearchIndex } from './core/search.js';
export type { SearchOptions } from './core/search.js';
