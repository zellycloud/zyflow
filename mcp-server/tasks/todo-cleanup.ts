/**
 * todo-cleanup Task
 *
 * 코드 내 TODO/FIXME 주석을 스캔하고 해결된 것을 정리합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';
import type { TaskResult, TaskSuggestion } from '../post-task-types.js';
import type { TaskExecutorOptions } from '../post-task-runner.js';
import { registerTaskExecutor } from '../post-task-runner.js';

const execAsync = promisify(exec);

/**
 * TODO 주석 정보
 */
interface TodoItem {
  file: string;
  line: number;
  type: 'TODO' | 'FIXME' | 'HACK' | 'XXX';
  content: string;
  author?: string;
  date?: string;
  resolved: boolean;
  resolvedReason?: string;
}

/**
 * TODO 주석 파싱
 */
function parseTodoComment(line: string, lineNumber: number, file: string): TodoItem | null {
  // 패턴: // TODO: message 또는 // TODO(author): message
  const patterns = [
    /\/\/\s*(TODO|FIXME|HACK|XXX)(?:\(([^)]+)\))?:\s*(.+)/i,
    /\/\*\s*(TODO|FIXME|HACK|XXX)(?:\(([^)]+)\))?:\s*(.+?)\s*\*\//i,
    /#\s*(TODO|FIXME|HACK|XXX)(?:\(([^)]+)\))?:\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return {
        file,
        line: lineNumber,
        type: match[1].toUpperCase() as TodoItem['type'],
        author: match[2] || undefined,
        content: match[3].trim(),
        resolved: false,
      };
    }
  }

  return null;
}

/**
 * grep으로 TODO 주석 찾기
 */
async function findTodos(projectPath: string): Promise<TodoItem[]> {
  const todos: TodoItem[] = [];

  try {
    // ripgrep 또는 grep 사용
    const { stdout } = await execAsync(
      `grep -rn -E "(TODO|FIXME|HACK|XXX):" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" .`,
      { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 }
    );

    const lines = stdout.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      // 패턴: ./src/file.ts:10: // TODO: message
      const match = line.match(/^\.\/(.+?):(\d+):(.+)$/);
      if (match) {
        const file = match[1];
        const lineNumber = parseInt(match[2], 10);
        const content = match[3];

        const todo = parseTodoComment(content, lineNumber, file);
        if (todo) {
          todos.push(todo);
        }
      }
    }
  } catch {
    // grep 결과 없음 또는 오류
  }

  return todos;
}

/**
 * Git 히스토리로 TODO가 해결되었는지 확인
 */
async function checkTodoResolved(
  projectPath: string,
  todo: TodoItem
): Promise<{ resolved: boolean; reason?: string }> {
  try {
    // TODO가 추가된 이후 해당 라인이 수정되었는지 확인
    const { stdout } = await execAsync(
      `git log --oneline -1 --follow -p -- "${todo.file}" | head -50`,
      { cwd: projectPath, maxBuffer: 1024 * 1024 }
    );

    // TODO 내용과 관련된 기능이 구현되었는지 키워드 검색
    const keywords = todo.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

    for (const keyword of keywords) {
      try {
        const { stdout: commitLog } = await execAsync(
          `git log --oneline --all --grep="${keyword}" | head -5`,
          { cwd: projectPath, maxBuffer: 1024 * 1024 }
        );

        if (commitLog.trim()) {
          // 관련 커밋이 있으면 해결되었을 수 있음
          return {
            resolved: true,
            reason: `Found related commit: ${commitLog.split('\n')[0]}`,
          };
        }
      } catch {
        // 무시
      }
    }

    return { resolved: false };
  } catch {
    return { resolved: false };
  }
}

/**
 * 해결된 TODO 제거
 */
async function removeTodo(
  projectPath: string,
  todo: TodoItem
): Promise<boolean> {
  try {
    const filePath = `${projectPath}/${todo.file}`;
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // 해당 라인에서 TODO 주석만 제거 (전체 라인 제거 아님)
    if (lines[todo.line - 1]) {
      const line = lines[todo.line - 1];
      const newLine = line
        .replace(/\/\/\s*(TODO|FIXME|HACK|XXX)(?:\([^)]+\))?:\s*.+/, '')
        .replace(/\/\*\s*(TODO|FIXME|HACK|XXX)(?:\([^)]+\))?:\s*.+?\s*\*\//, '')
        .trimEnd();

      // 빈 줄이 되면 제거, 아니면 교체
      if (newLine.trim() === '') {
        lines.splice(todo.line - 1, 1);
      } else {
        lines[todo.line - 1] = newLine;
      }

      await writeFile(filePath, lines.join('\n'), 'utf-8');
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * todo-cleanup 실행기
 */
async function todoCleanupExecutor(
  projectPath: string,
  options: TaskExecutorOptions
): Promise<TaskResult> {
  let issuesFound = 0;
  let issuesFixed = 0;
  const modifiedFiles: string[] = [];
  const suggestions: TaskSuggestion[] = [];
  let rawOutput = '';

  try {
    // 1. TODO 주석 찾기
    const todos = await findTodos(projectPath);
    issuesFound = todos.length;

    rawOutput += `Found ${todos.length} TODO/FIXME comments\n\n`;

    // 2. 각 TODO에 대해 해결 여부 확인
    for (const todo of todos) {
      const { resolved, reason } = await checkTodoResolved(projectPath, todo);
      todo.resolved = resolved;
      todo.resolvedReason = reason;

      if (resolved) {
        suggestions.push({
          file: todo.file,
          line: todo.line,
          issue: `${todo.type}: ${todo.content}`,
          suggestion: `Possibly resolved - ${reason}. Consider removing.`,
          confidence: 'medium',
        });
      } else {
        suggestions.push({
          file: todo.file,
          line: todo.line,
          issue: `${todo.type}: ${todo.content}`,
          suggestion: 'Still pending - keep or implement',
          confidence: 'high',
        });
      }

      rawOutput += `[${todo.resolved ? 'RESOLVED?' : 'PENDING'}] ${todo.file}:${todo.line} - ${todo.type}: ${todo.content}\n`;
    }

    // 3. 해결된 TODO 자동 제거 (dry run이 아닌 경우)
    if (!options.dryRun) {
      const resolvedTodos = todos.filter((t) => t.resolved);

      for (const todo of resolvedTodos) {
        const removed = await removeTodo(projectPath, todo);
        if (removed) {
          issuesFixed++;
          if (!modifiedFiles.includes(todo.file)) {
            modifiedFiles.push(todo.file);
          }
        }
      }
    }

    return {
      task: 'todo-cleanup',
      success: true,
      duration: 0,
      issuesFound,
      issuesFixed,
      model: options.model,
      cli: options.cli,
      details: {
        modifiedFiles: modifiedFiles.length > 0 ? modifiedFiles : undefined,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        rawOutput,
      },
    };
  } catch (error) {
    return {
      task: 'todo-cleanup',
      success: false,
      duration: 0,
      issuesFound,
      issuesFixed,
      model: options.model,
      cli: options.cli,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// 실행기 등록
registerTaskExecutor('todo-cleanup', todoCleanupExecutor);

export { todoCleanupExecutor, findTodos, parseTodoComment };
