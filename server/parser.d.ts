import type { Task, TasksFile } from '../src/types/index.js';
/**
 * Parse tasks.md content into structured data
 * Supports multiple formats:
 * - Group headers: "## 1. Section" or "## Phase 0: Section" or "## Section Name"
 * - Subsections: "### 0.1 Subsection" (creates new group)
 * - Tasks: "- [ ] 1.1 Task" or "- [ ] 1.1.1 Task" or "- [ ] Task" (no number)
 */
export declare function parseTasksFile(changeId: string, content: string): TasksFile;
/**
 * Toggle task completion status in file content
 */
export declare function toggleTaskInFile(content: string, taskId: string): {
    newContent: string;
    task: Task;
};
//# sourceMappingURL=parser.d.ts.map