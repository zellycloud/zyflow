import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// 순차 번호 관리 테이블
export const sequences = sqliteTable('sequences', {
  name: text('name').primaryKey(),
  value: integer('value').notNull().default(0),
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', {
    enum: ['todo', 'in-progress', 'review', 'done', 'archived']
  }).notNull().default('todo'),
  priority: text('priority', {
    enum: ['low', 'medium', 'high']
  }).notNull().default('medium'),
  tags: text('tags'), // JSON array: ["bug", "refactor"]
  assignee: text('assignee'),
  order: integer('order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }), // null if not archived
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'archived';
export type TaskPriority = 'low' | 'medium' | 'high';
