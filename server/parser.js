/**
 * Parse tasks.md content into structured data
 * Supports multiple formats:
 * - Group headers: "## 1. Section" or "## Phase 0: Section" or "## Section Name"
 * - Subsections: "### 0.1 Subsection" (creates new group)
 * - Tasks: "- [ ] 1.1 Task" or "- [ ] 1.1.1 Task" or "- [ ] Task" (no number)
 */
export function parseTasksFile(changeId, content) {
    const lines = content.split('\n');
    const groups = [];
    let currentGroup = null;
    let groupCounter = 0;
    let taskCounter = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;
        // Match group headers - multiple formats:
        // 1. "## 1. Section Name" - numbered format
        // 2. "## Phase 0: Section Name" - phase format
        // 3. "## Section Name" - plain format
        const numberedGroupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/);
        const phaseGroupMatch = line.match(/^##\s+Phase\s+(\d+):\s*(.+)$/i);
        const plainGroupMatch = line.match(/^##\s+(.+)$/);
        if (numberedGroupMatch) {
            const groupId = `group-${numberedGroupMatch[1]}`;
            const groupTitle = numberedGroupMatch[2].trim();
            currentGroup = { id: groupId, title: groupTitle, tasks: [] };
            groups.push(currentGroup);
            taskCounter = 0;
            continue;
        }
        if (phaseGroupMatch) {
            const groupId = `group-phase-${phaseGroupMatch[1]}`;
            const groupTitle = `Phase ${phaseGroupMatch[1]}: ${phaseGroupMatch[2].trim()}`;
            currentGroup = { id: groupId, title: groupTitle, tasks: [] };
            groups.push(currentGroup);
            taskCounter = 0;
            continue;
        }
        // Match subsection headers: "### 0.1 Subsection Name" - treat as new group
        const subsectionMatch = line.match(/^###\s+([\d.]+)\s+(.+)$/);
        if (subsectionMatch) {
            const subsectionNumber = subsectionMatch[1];
            const groupId = `group-${subsectionNumber.replace(/\./g, '-')}`;
            const groupTitle = `${subsectionNumber} ${subsectionMatch[2].trim()}`;
            currentGroup = { id: groupId, title: groupTitle, tasks: [] };
            groups.push(currentGroup);
            taskCounter = 0;
            continue;
        }
        // Plain ## header (fallback, only if no group yet or explicit section)
        if (plainGroupMatch && !numberedGroupMatch && !phaseGroupMatch) {
            // Skip if it looks like a title (# Tasks: ...)
            if (line.startsWith('# '))
                continue;
            groupCounter++;
            const groupId = `group-${groupCounter}`;
            const groupTitle = plainGroupMatch[1].trim();
            currentGroup = { id: groupId, title: groupTitle, tasks: [] };
            groups.push(currentGroup);
            taskCounter = 0;
            continue;
        }
        // Match task items - two formats:
        // 1. "- [ ] 1.1 Task" - numbered task
        // 2. "- [ ] Task" - unnumbered task (auto-generate ID)
        const numberedTaskMatch = line.match(/^-\s+\[([ xX])\]\s+([\d.]+)\s+(.+)$/);
        const plainTaskMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
        if (numberedTaskMatch && currentGroup) {
            const completed = numberedTaskMatch[1].toLowerCase() === 'x';
            const taskNumber = numberedTaskMatch[2];
            const taskTitle = numberedTaskMatch[3].trim();
            const taskId = `task-${taskNumber.replace(/\./g, '-')}`;
            const task = {
                id: taskId,
                title: taskTitle,
                completed,
                groupId: currentGroup.id,
                lineNumber,
            };
            currentGroup.tasks.push(task);
            taskCounter++;
        }
        else if (plainTaskMatch && currentGroup && !numberedTaskMatch) {
            const completed = plainTaskMatch[1].toLowerCase() === 'x';
            const taskTitle = plainTaskMatch[2].trim();
            taskCounter++;
            const taskId = `task-${currentGroup.id}-${taskCounter}`;
            const task = {
                id: taskId,
                title: taskTitle,
                completed,
                groupId: currentGroup.id,
                lineNumber,
            };
            currentGroup.tasks.push(task);
        }
    }
    return { changeId, groups };
}
/**
 * Toggle task completion status in file content
 */
export function toggleTaskInFile(content, taskId) {
    const lines = content.split('\n');
    let foundTask = null;
    let currentGroupId = '';
    let groupCounter = 0;
    let taskCounter = 0;
    // Check if taskId is numbered (task-1-1) or auto-generated (task-group-xxx-n)
    const isNumberedTask = /^task-[\d-]+$/.test(taskId) && !taskId.includes('group');
    const taskNumber = isNumberedTask
        ? taskId.replace('task-', '').replace(/-/g, '.')
        : null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Track current group - multiple formats
        const numberedGroupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/);
        const phaseGroupMatch = line.match(/^##\s+Phase\s+(\d+):\s*(.+)$/i);
        const subsectionMatch = line.match(/^###\s+([\d.]+)\s+(.+)$/);
        const plainGroupMatch = line.match(/^##\s+(.+)$/);
        if (numberedGroupMatch) {
            currentGroupId = `group-${numberedGroupMatch[1]}`;
            taskCounter = 0;
        }
        else if (phaseGroupMatch) {
            currentGroupId = `group-phase-${phaseGroupMatch[1]}`;
            taskCounter = 0;
        }
        else if (subsectionMatch) {
            currentGroupId = `group-${subsectionMatch[1].replace(/\./g, '-')}`;
            taskCounter = 0;
        }
        else if (plainGroupMatch && !numberedGroupMatch && !phaseGroupMatch && !line.startsWith('# ')) {
            groupCounter++;
            currentGroupId = `group-${groupCounter}`;
            taskCounter = 0;
        }
        // Try numbered task match first
        const numberedTaskMatch = line.match(/^(-\s+\[)([ xX])(\]\s+)([\d.]+)(\s+.+)$/);
        if (numberedTaskMatch) {
            taskCounter++;
            if (isNumberedTask && numberedTaskMatch[4] === taskNumber) {
                const wasCompleted = numberedTaskMatch[2].toLowerCase() === 'x';
                const newCompleted = !wasCompleted;
                const newCheckmark = newCompleted ? 'x' : ' ';
                lines[i] = `${numberedTaskMatch[1]}${newCheckmark}${numberedTaskMatch[3]}${numberedTaskMatch[4]}${numberedTaskMatch[5]}`;
                foundTask = {
                    id: taskId,
                    title: numberedTaskMatch[5].trim(),
                    completed: newCompleted,
                    groupId: currentGroupId,
                    lineNumber: i + 1,
                };
                break;
            }
            continue;
        }
        // Try plain task match (unnumbered)
        const plainTaskMatch = line.match(/^(-\s+\[)([ xX])(\]\s+)(.+)$/);
        if (plainTaskMatch && currentGroupId) {
            taskCounter++;
            const generatedTaskId = `task-${currentGroupId}-${taskCounter}`;
            if (!isNumberedTask && generatedTaskId === taskId) {
                const wasCompleted = plainTaskMatch[2].toLowerCase() === 'x';
                const newCompleted = !wasCompleted;
                const newCheckmark = newCompleted ? 'x' : ' ';
                lines[i] = `${plainTaskMatch[1]}${newCheckmark}${plainTaskMatch[3]}${plainTaskMatch[4]}`;
                foundTask = {
                    id: taskId,
                    title: plainTaskMatch[4].trim(),
                    completed: newCompleted,
                    groupId: currentGroupId,
                    lineNumber: i + 1,
                };
                break;
            }
        }
    }
    if (!foundTask) {
        throw new Error(`Task not found: ${taskId}`);
    }
    return {
        newContent: lines.join('\n'),
        task: foundTask,
    };
}
//# sourceMappingURL=parser.js.map