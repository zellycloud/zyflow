import {
  initDb,
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  moveTask,
  getTasksByStatus,
  searchTasks,
  Task,
  TaskStatus,
  TaskPriority,
} from '../index.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const priorityColors: Record<TaskPriority, string> = {
  high: colors.red,
  medium: colors.yellow,
  low: colors.green,
};

const statusLabels: Record<TaskStatus, string> = {
  todo: '📋 To Do',
  'in-progress': '🔄 In Progress',
  review: '👀 Review',
  done: '✅ Done',
  archived: '📦 Archived',
};

function formatTask(task: Task): string {
  const priority = task.priority as TaskPriority;
  const status = task.status as TaskStatus;
  const tags = task.tags ? JSON.parse(task.tags) as string[] : [];

  let output = '';
  output += `${colors.bold}TASK-${task.id}${colors.reset} `;
  output += `${priorityColors[priority]}[${priority.toUpperCase()}]${colors.reset} `;
  output += `${task.title}\n`;
  output += `  ${colors.dim}Status:${colors.reset} ${statusLabels[status]}\n`;

  if (task.description) {
    output += `  ${colors.dim}Description:${colors.reset} ${task.description}\n`;
  }

  if (tags.length > 0) {
    output += `  ${colors.dim}Tags:${colors.reset} ${tags.map((t) => `${colors.cyan}#${t}${colors.reset}`).join(' ')}\n`;
  }

  if (task.assignee) {
    output += `  ${colors.dim}Assignee:${colors.reset} ${task.assignee}\n`;
  }

  return output;
}

function formatTable(tasks: Task[]): string {
  if (tasks.length === 0) {
    return `${colors.dim}No tasks found.${colors.reset}`;
  }

  const header = `${colors.bold}${'ID'.padEnd(15)} ${'PRIORITY'.padEnd(10)} ${'STATUS'.padEnd(15)} TITLE${colors.reset}`;
  const rows = tasks.map((task) => {
    const priority = task.priority as TaskPriority;
    const status = task.status as TaskStatus;
    const idStr = `TASK-${task.id}`;
    return `${idStr.padEnd(15)} ${priorityColors[priority]}${priority.toUpperCase().padEnd(10)}${colors.reset} ${status.padEnd(15)} ${task.title}`;
  });

  return [header, '-'.repeat(70), ...rows].join('\n');
}

function formatKanban(tasksByStatus: Record<TaskStatus, Task[]>): string {
  const statuses: TaskStatus[] = ['todo', 'in-progress', 'review', 'done'];
  const columnWidth = 25;

  // Header
  let output = statuses.map((s) => statusLabels[s].padEnd(columnWidth)).join('│') + '\n';
  output += statuses.map(() => '─'.repeat(columnWidth)).join('┼') + '\n';

  // Find max tasks in any column
  const maxTasks = Math.max(...statuses.map((s) => tasksByStatus[s].length));

  for (let i = 0; i < maxTasks; i++) {
    const row = statuses.map((status) => {
      const task = tasksByStatus[status][i];
      if (!task) return ' '.repeat(columnWidth);
      const priority = task.priority as TaskPriority;
      const short = String(task.id);
      const title = task.title.slice(0, 15);
      return `${priorityColors[priority]}●${colors.reset} ${short} ${title}`.padEnd(columnWidth + 10); // extra for color codes
    });
    output += row.join('│') + '\n';
  }

  return output;
}

export interface CommandOptions {
  status?: string;
  priority?: string;
  tags?: string;
  assignee?: string;
  kanban?: boolean;
  limit?: number;
  description?: string;
}

export function handleListCommand(options: CommandOptions): string {
  initDb();

  if (options.kanban) {
    const tasksByStatus = getTasksByStatus();
    return formatKanban(tasksByStatus);
  }

  const tasks = listTasks({
    status: options.status as TaskStatus | undefined,
    priority: options.priority as TaskPriority | undefined,
    tags: options.tags ? options.tags.split(',') : undefined,
    assignee: options.assignee,
    limit: options.limit,
  });

  return formatTable(tasks);
}

export function handleAddCommand(title: string, options: CommandOptions): string {
  initDb();

  // CLI에서 생성하는 태스크는 현재 프로젝트의 default projectId 사용
  const task = createTask({
    projectId: process.cwd().toLowerCase().replace(/\//g, '-').replace(/^-/, '') || 'default',
    title,
    description: options.description,
    priority: options.priority as TaskPriority | undefined,
    tags: options.tags ? options.tags.split(',') : undefined,
    assignee: options.assignee,
  });

  return `${colors.green}✓${colors.reset} Created task ${colors.bold}${task.id}${colors.reset}\n\n${formatTask(task)}`;
}

export function handleViewCommand(id: string): string {
  initDb();

  const task = getTask(id);
  if (!task) {
    return `${colors.red}✗${colors.reset} Task not found: ${id}`;
  }

  return formatTask(task);
}

export function handleEditCommand(id: string, options: CommandOptions): string {
  initDb();

  const task = updateTask(id, {
    status: options.status as TaskStatus | undefined,
    priority: options.priority as TaskPriority | undefined,
    tags: options.tags ? options.tags.split(',') : undefined,
    assignee: options.assignee,
  });

  if (!task) {
    return `${colors.red}✗${colors.reset} Task not found: ${id}`;
  }

  return `${colors.green}✓${colors.reset} Updated task ${colors.bold}${task.id}${colors.reset}\n\n${formatTask(task)}`;
}

export function handleMoveCommand(id: string, status: string): string {
  initDb();

  const validStatuses: TaskStatus[] = ['todo', 'in-progress', 'review', 'done'];
  if (!validStatuses.includes(status as TaskStatus)) {
    return `${colors.red}✗${colors.reset} Invalid status: ${status}. Valid values: ${validStatuses.join(', ')}`;
  }

  const task = moveTask(id, status as TaskStatus);
  if (!task) {
    return `${colors.red}✗${colors.reset} Task not found: ${id}`;
  }

  return `${colors.green}✓${colors.reset} Moved task ${colors.bold}${task.id}${colors.reset} to ${statusLabels[status as TaskStatus]}`;
}

export function handleSearchCommand(query: string, options: CommandOptions): string {
  initDb();

  const tasks = searchTasks(query, {
    limit: options.limit,
    status: options.status,
    priority: options.priority,
  });

  if (tasks.length === 0) {
    return `${colors.dim}No tasks found matching "${query}"${colors.reset}`;
  }

  return `Found ${tasks.length} task(s):\n\n${formatTable(tasks)}`;
}

export function handleDeleteCommand(id: string, confirm: boolean = false): string {
  initDb();

  const task = getTask(id);
  if (!task) {
    return `${colors.red}✗${colors.reset} Task not found: ${id}`;
  }

  if (!confirm) {
    return `${colors.yellow}⚠${colors.reset} To delete task ${colors.bold}${id}${colors.reset} "${task.title}", run with --confirm flag`;
  }

  deleteTask(id);
  return `${colors.green}✓${colors.reset} Deleted task ${colors.bold}${id}${colors.reset}`;
}

export function handleHelpCommand(): string {
  return `
${colors.bold}zy tasks${colors.reset} - Task management CLI

${colors.bold}USAGE${colors.reset}
  zy tasks <command> [options]

${colors.bold}COMMANDS${colors.reset}
  list              List all tasks
  add <title>       Create a new task
  view <id>         View task details
  edit <id>         Edit a task
  move <id> <status> Move task to a status
  search <query>    Search tasks
  delete <id>       Delete a task

${colors.bold}OPTIONS${colors.reset}
  --status <status>   Filter by status (todo, in-progress, review, done)
  --priority <p>      Filter/set priority (low, medium, high)
  --tags <tags>       Filter/set tags (comma-separated)
  --assignee <name>   Filter/set assignee
  --kanban            Show kanban board view
  --limit <n>         Limit results
  --description <d>   Set description (for add)
  --confirm           Confirm deletion

${colors.bold}EXAMPLES${colors.reset}
  zy tasks list --kanban
  zy tasks add "Fix login bug" --priority high --tags bug,auth
  zy tasks move TASK-ABC123 in-progress
  zy tasks search "modal"
`;
}
