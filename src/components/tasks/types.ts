export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'archived';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string | null; // JSON array string
  assignee: string | null;
  order: number;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
  archivedAt?: number | null; // timestamp when archived
}

export interface TaskColumn {
  id: TaskStatus;
  title: string;
  tasks: Task[];
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  review: 'Review',
  done: 'Done',
  archived: 'Archived',
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

// 칸반 보드에 표시할 컬럼 (archived 제외)
export const STATUS_ORDER: TaskStatus[] = ['todo', 'in-progress', 'review', 'done'];
