import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// =============================================
// Flow 파이프라인 타입 정의
// =============================================
export type Stage = 'spec' | 'task' | 'code' | 'test' | 'commit' | 'docs';
export type ChangeStatus = 'active' | 'completed' | 'archived';

// Task Origin 타입: 태스크 출처 구분
// - openspec: tasks.md에서 동기화된 태스크
// - inbox: 수동으로 생성된 독립 태스크
// - imported: 외부 시스템에서 가져온 태스크
export type TaskOrigin = 'openspec' | 'inbox' | 'imported';

// 순차 번호 관리 테이블
export const sequences = sqliteTable('sequences', {
  name: text('name').primaryKey(),
  value: integer('value').notNull().default(0),
});

// =============================================
// Changes 테이블 (Flow의 최상위 단위)
// =============================================
export const changes = sqliteTable('changes', {
  id: text('id').primaryKey(), // OpenSpec change-id와 동일
  projectId: text('project_id').notNull(), // 프로젝트 식별자
  title: text('title').notNull(),
  specPath: text('spec_path'), // openspec/changes/{id}/proposal.md 경로
  status: text('status', {
    enum: ['active', 'completed', 'archived']
  }).notNull().default('active'),
  currentStage: text('current_stage', {
    enum: ['spec', 'task', 'code', 'test', 'commit', 'docs']
  }).notNull().default('spec'),
  progress: integer('progress').notNull().default(0), // 0-100
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type Change = typeof changes.$inferSelect;
export type NewChange = typeof changes.$inferInsert;

// =============================================
// Tasks 테이블 (기존 + Flow 확장)
// =============================================
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey(),
  // 프로젝트 식별자 (필수 - 프로젝트별 칸반 분리)
  projectId: text('project_id').notNull(),
  // Flow 연결 필드 (nullable - 독립 태스크 지원)
  changeId: text('change_id'), // changes.id 참조, null이면 독립 태스크
  stage: text('stage', {
    enum: ['spec', 'task', 'code', 'test', 'commit', 'docs']
  }).notNull().default('task'), // 기본값 'task' (기존 칸반 호환)
  // 태스크 출처 구분
  origin: text('origin', {
    enum: ['openspec', 'inbox', 'imported']
  }).notNull().default('inbox'),
  // 기존 필드
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
