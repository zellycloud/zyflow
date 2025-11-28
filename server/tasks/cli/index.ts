#!/usr/bin/env node
import {
  handleListCommand,
  handleAddCommand,
  handleViewCommand,
  handleEditCommand,
  handleMoveCommand,
  handleSearchCommand,
  handleDeleteCommand,
  handleHelpCommand,
  CommandOptions,
} from './commands.js';

function parseArgs(args: string[]): { command: string; positional: string[]; options: CommandOptions & { confirm?: boolean } } {
  const command = args[0] || 'help';
  const positional: string[] = [];
  const options: CommandOptions & { confirm?: boolean } = {};

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);

      if (key === 'kanban' || key === 'confirm') {
        (options as Record<string, unknown>)[key] = true;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        const value = args[i + 1];
        if (key === 'limit') {
          options.limit = parseInt(value, 10);
        } else {
          (options as Record<string, unknown>)[key] = value;
        }
        i++;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const shortMap: Record<string, string> = {
        p: 'priority',
        s: 'status',
        t: 'tags',
        a: 'assignee',
        d: 'description',
        k: 'kanban',
        l: 'limit',
      };

      const fullKey = shortMap[key] || key;

      if (fullKey === 'kanban') {
        options.kanban = true;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        const value = args[i + 1];
        if (fullKey === 'limit') {
          options.limit = parseInt(value, 10);
        } else {
          (options as Record<string, unknown>)[fullKey] = value;
        }
        i++;
      }
    } else {
      positional.push(arg);
    }

    i++;
  }

  return { command, positional, options };
}

function main(): void {
  const args = process.argv.slice(2);
  const { command, positional, options } = parseArgs(args);

  let output: string;

  try {
    switch (command) {
      case 'list':
      case 'ls':
        output = handleListCommand(options);
        break;

      case 'add':
      case 'create':
        if (positional.length === 0) {
          output = 'Error: Title is required. Usage: zy tasks add "Task title"';
        } else {
          output = handleAddCommand(positional.join(' '), options);
        }
        break;

      case 'view':
      case 'show':
        if (positional.length === 0) {
          output = 'Error: Task ID is required. Usage: zy tasks view TASK-XXX';
        } else {
          output = handleViewCommand(positional[0]);
        }
        break;

      case 'edit':
      case 'update':
        if (positional.length === 0) {
          output = 'Error: Task ID is required. Usage: zy tasks edit TASK-XXX --status done';
        } else {
          output = handleEditCommand(positional[0], options);
        }
        break;

      case 'move':
        if (positional.length < 2) {
          output = 'Error: Task ID and status required. Usage: zy tasks move TASK-XXX in-progress';
        } else {
          output = handleMoveCommand(positional[0], positional[1]);
        }
        break;

      case 'search':
      case 'find':
        if (positional.length === 0) {
          output = 'Error: Search query is required. Usage: zy tasks search "keyword"';
        } else {
          output = handleSearchCommand(positional.join(' '), options);
        }
        break;

      case 'delete':
      case 'rm':
        if (positional.length === 0) {
          output = 'Error: Task ID is required. Usage: zy tasks delete TASK-XXX --confirm';
        } else {
          output = handleDeleteCommand(positional[0], options.confirm || false);
        }
        break;

      case 'help':
      case '--help':
      case '-h':
      default:
        output = handleHelpCommand();
        break;
    }
  } catch (error) {
    output = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }

  console.log(output);
}

main();
