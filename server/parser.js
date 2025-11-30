function parseTasksFile(changeId, content) {
  const lines = content.split("\n");
  const groups = [];
  let currentGroup = null;
  let currentMajorOrder = 0;
  let currentMajorTitle = "";
  let groupCounter = 0;
  let taskCounter = 0;
  let pendingMajorGroup = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const numberedGroupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    const phaseGroupMatch = line.match(/^##\s+Phase\s+(\d+):\s*(.+)$/i);
    const plainGroupMatch = line.match(/^##\s+([^#].*)$/);
    const subsectionMatch = line.match(/^#{3,4}\s+([\d.]+)\s+(.+)$/);
    const plainSubsectionMatch = line.match(/^###\s+([^#\d].*)$/);
    if (numberedGroupMatch) {
      if (pendingMajorGroup && pendingMajorGroup.tasks.length > 0) {
        groups.push(pendingMajorGroup);
      }
      currentMajorOrder = parseInt(numberedGroupMatch[1]);
      currentMajorTitle = numberedGroupMatch[2].trim();
      const groupId = `group-${currentMajorOrder}`;
      pendingMajorGroup = {
        id: groupId,
        title: currentMajorTitle,
        tasks: [],
        majorOrder: currentMajorOrder,
        majorTitle: currentMajorTitle,
        subOrder: 1
      };
      currentGroup = pendingMajorGroup;
      taskCounter = 0;
      continue;
    }
    if (phaseGroupMatch) {
      if (pendingMajorGroup && pendingMajorGroup.tasks.length > 0) {
        groups.push(pendingMajorGroup);
      }
      currentMajorOrder = parseInt(phaseGroupMatch[1]);
      currentMajorTitle = `Phase ${phaseGroupMatch[1]}: ${phaseGroupMatch[2].trim()}`;
      const groupId = `group-phase-${phaseGroupMatch[1]}`;
      pendingMajorGroup = {
        id: groupId,
        title: currentMajorTitle,
        tasks: [],
        majorOrder: currentMajorOrder,
        majorTitle: currentMajorTitle,
        subOrder: 1
      };
      currentGroup = pendingMajorGroup;
      taskCounter = 0;
      continue;
    }
    if (subsectionMatch) {
      pendingMajorGroup = null;
      const subsectionNumber = subsectionMatch[1];
      const parts = subsectionNumber.split(".");
      const majorNum = parseInt(parts[0]);
      const subNum = parts.length > 1 ? parseInt(parts[1]) : 1;
      const effectiveMajorOrder = currentMajorOrder !== 0 || currentMajorTitle ? currentMajorOrder : majorNum;
      const effectiveMajorTitle = currentMajorTitle || `Section ${majorNum}`;
      const groupId = `group-${subsectionNumber.replace(/\./g, "-")}`;
      const groupTitle = `${subsectionNumber} ${subsectionMatch[2].trim()}`;
      currentGroup = {
        id: groupId,
        title: groupTitle,
        tasks: [],
        majorOrder: effectiveMajorOrder,
        majorTitle: effectiveMajorTitle,
        subOrder: subNum
      };
      groups.push(currentGroup);
      taskCounter = 0;
      continue;
    }
    if (plainSubsectionMatch && !subsectionMatch) {
      if (pendingMajorGroup && pendingMajorGroup.tasks.length > 0) {
        groups.push(pendingMajorGroup);
      }
      pendingMajorGroup = null;
      taskCounter = 0;
      continue;
    }
    if (plainGroupMatch && !numberedGroupMatch && !phaseGroupMatch) {
      if (line.startsWith("# ") && !line.startsWith("## ")) continue;
      if (pendingMajorGroup && pendingMajorGroup.tasks.length > 0) {
        groups.push(pendingMajorGroup);
      }
      groupCounter++;
      currentMajorOrder = groupCounter;
      currentMajorTitle = plainGroupMatch[1].trim();
      const groupId = `group-${groupCounter}`;
      pendingMajorGroup = {
        id: groupId,
        title: currentMajorTitle,
        tasks: [],
        majorOrder: currentMajorOrder,
        majorTitle: currentMajorTitle,
        subOrder: 1
      };
      currentGroup = pendingMajorGroup;
      taskCounter = 0;
      continue;
    }
    const numberedTaskMatch = line.match(/^-\s+\[([ xX])\]\s+([\d.]+)\s+(.+)$/);
    const plainTaskMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (numberedTaskMatch && currentGroup) {
      const completed = numberedTaskMatch[1].toLowerCase() === "x";
      const taskNumber = numberedTaskMatch[2];
      const taskTitle = numberedTaskMatch[3].trim();
      const taskId = `task-${taskNumber.replace(/\./g, "-")}`;
      const task = {
        id: taskId,
        title: taskTitle,
        completed,
        groupId: currentGroup.id,
        lineNumber
      };
      currentGroup.tasks.push(task);
      taskCounter++;
    } else if (plainTaskMatch && currentGroup && !numberedTaskMatch) {
      const completed = plainTaskMatch[1].toLowerCase() === "x";
      const taskTitle = plainTaskMatch[2].trim();
      taskCounter++;
      const taskId = `task-${currentGroup.id}-${taskCounter}`;
      const task = {
        id: taskId,
        title: taskTitle,
        completed,
        groupId: currentGroup.id,
        lineNumber
      };
      currentGroup.tasks.push(task);
    }
  }
  if (pendingMajorGroup && pendingMajorGroup.tasks.length > 0) {
    groups.push(pendingMajorGroup);
  }
  return { changeId, groups };
}
function toggleTaskInFile(content, taskId) {
  const lines = content.split("\n");
  let foundTask = null;
  let currentGroupId = "";
  let groupCounter = 0;
  let taskCounter = 0;
  const isNumberedTask = /^task-[\d-]+$/.test(taskId) && !taskId.includes("group");
  const taskNumber = isNumberedTask ? taskId.replace("task-", "").replace(/-/g, ".") : null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const numberedGroupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    const phaseGroupMatch = line.match(/^##\s+Phase\s+(\d+):\s*(.+)$/i);
    const subsectionMatch = line.match(/^###\s+([\d.]+)\s+(.+)$/);
    const plainGroupMatch = line.match(/^##\s+(.+)$/);
    if (numberedGroupMatch) {
      currentGroupId = `group-${numberedGroupMatch[1]}`;
      taskCounter = 0;
    } else if (phaseGroupMatch) {
      currentGroupId = `group-phase-${phaseGroupMatch[1]}`;
      taskCounter = 0;
    } else if (subsectionMatch) {
      currentGroupId = `group-${subsectionMatch[1].replace(/\./g, "-")}`;
      taskCounter = 0;
    } else if (plainGroupMatch && !numberedGroupMatch && !phaseGroupMatch && !line.startsWith("# ")) {
      groupCounter++;
      currentGroupId = `group-${groupCounter}`;
      taskCounter = 0;
    }
    const numberedTaskMatch = line.match(/^(-\s+\[)([ xX])(\]\s+)([\d.]+)(\s+.+)$/);
    if (numberedTaskMatch) {
      taskCounter++;
      if (isNumberedTask && numberedTaskMatch[4] === taskNumber) {
        const wasCompleted = numberedTaskMatch[2].toLowerCase() === "x";
        const newCompleted = !wasCompleted;
        const newCheckmark = newCompleted ? "x" : " ";
        lines[i] = `${numberedTaskMatch[1]}${newCheckmark}${numberedTaskMatch[3]}${numberedTaskMatch[4]}${numberedTaskMatch[5]}`;
        foundTask = {
          id: taskId,
          title: numberedTaskMatch[5].trim(),
          completed: newCompleted,
          groupId: currentGroupId,
          lineNumber: i + 1
        };
        break;
      }
      continue;
    }
    const plainTaskMatch = line.match(/^(-\s+\[)([ xX])(\]\s+)(.+)$/);
    if (plainTaskMatch && currentGroupId) {
      taskCounter++;
      const generatedTaskId = `task-${currentGroupId}-${taskCounter}`;
      if (!isNumberedTask && generatedTaskId === taskId) {
        const wasCompleted = plainTaskMatch[2].toLowerCase() === "x";
        const newCompleted = !wasCompleted;
        const newCheckmark = newCompleted ? "x" : " ";
        lines[i] = `${plainTaskMatch[1]}${newCheckmark}${plainTaskMatch[3]}${plainTaskMatch[4]}`;
        foundTask = {
          id: taskId,
          title: plainTaskMatch[4].trim(),
          completed: newCompleted,
          groupId: currentGroupId,
          lineNumber: i + 1
        };
        break;
      }
    }
  }
  if (!foundTask) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return {
    newContent: lines.join("\n"),
    task: foundTask
  };
}
export {
  parseTasksFile,
  toggleTaskInFile
};
