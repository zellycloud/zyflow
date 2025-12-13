/**
 * File Tree Generation
 *
 * Generates a text representation of a directory structure
 * for use in diagram generation prompts.
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, relative } from 'path';

export interface FileTreeOptions {
  /** Maximum depth to traverse (default: 10) */
  maxDepth?: number;
  /** Patterns to exclude (glob-like) */
  excludePatterns?: string[];
  /** Include file sizes */
  includeSizes?: boolean;
  /** Maximum number of files to include */
  maxFiles?: number;
}

const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'dist',
  'build',
  '.cache',
  '.turbo',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env.local',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
];

/**
 * Check if a path matches any exclude pattern
 */
function shouldExclude(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      if (name.endsWith(suffix)) return true;
    } else if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (name.startsWith(prefix)) return true;
    } else if (name === pattern) {
      return true;
    }
  }
  return false;
}

interface TreeEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeEntry[];
  size?: number;
}

/**
 * Recursively build a tree structure
 */
async function buildTree(
  dirPath: string,
  rootPath: string,
  options: Required<FileTreeOptions>,
  currentDepth: number,
  fileCount: { count: number }
): Promise<TreeEntry[]> {
  if (currentDepth > options.maxDepth) return [];
  if (fileCount.count >= options.maxFiles) return [];

  const entries: TreeEntry[] = [];

  try {
    const items = await readdir(dirPath, { withFileTypes: true });

    // Sort: directories first, then files, both alphabetically
    items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of items) {
      if (fileCount.count >= options.maxFiles) break;
      if (shouldExclude(item.name, options.excludePatterns)) continue;

      const fullPath = join(dirPath, item.name);
      const relativePath = relative(rootPath, fullPath);

      if (item.isDirectory()) {
        const children = await buildTree(
          fullPath,
          rootPath,
          options,
          currentDepth + 1,
          fileCount
        );

        // Only include directory if it has children
        if (children.length > 0) {
          entries.push({
            name: item.name,
            path: relativePath,
            isDirectory: true,
            children,
          });
        }
      } else {
        fileCount.count++;

        const entry: TreeEntry = {
          name: item.name,
          path: relativePath,
          isDirectory: false,
        };

        if (options.includeSizes) {
          try {
            const stats = await stat(fullPath);
            entry.size = stats.size;
          } catch {
            // Ignore stat errors
          }
        }

        entries.push(entry);
      }
    }
  } catch (error) {
    // Ignore permission errors and other read errors
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return entries;
}

/**
 * Format tree entries as text
 */
function formatTree(
  entries: TreeEntry[],
  prefix: string = '',
  isLast: boolean = true
): string {
  let result = '';

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLastEntry = i === entries.length - 1;
    const connector = isLastEntry ? '└── ' : '├── ';
    const childPrefix = isLastEntry ? '    ' : '│   ';

    let line = `${prefix}${connector}${entry.name}`;
    if (entry.isDirectory) {
      line += '/';
    }
    if (entry.size !== undefined) {
      line += ` (${formatSize(entry.size)})`;
    }
    result += line + '\n';

    if (entry.children && entry.children.length > 0) {
      result += formatTree(entry.children, prefix + childPrefix, isLastEntry);
    }
  }

  return result;
}

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

/**
 * Generate a text representation of a directory tree
 */
export async function generateFileTree(
  rootPath: string,
  options: FileTreeOptions = {}
): Promise<string> {
  const fullOptions: Required<FileTreeOptions> = {
    maxDepth: options.maxDepth ?? 10,
    excludePatterns: [
      ...DEFAULT_EXCLUDE_PATTERNS,
      ...(options.excludePatterns ?? []),
    ],
    includeSizes: options.includeSizes ?? false,
    maxFiles: options.maxFiles ?? 1000,
  };

  const fileCount = { count: 0 };
  const entries = await buildTree(rootPath, rootPath, fullOptions, 0, fileCount);

  // Get the root directory name
  const rootName = rootPath.split('/').pop() || rootPath;

  let result = `${rootName}/\n`;
  result += formatTree(entries);

  if (fileCount.count >= fullOptions.maxFiles) {
    result += `\n... (truncated, ${fileCount.count}+ files)`;
  }

  return result;
}

/**
 * Read README file from a directory
 */
export async function readReadme(rootPath: string): Promise<string | null> {
  const readmeNames = [
    'README.md',
    'readme.md',
    'README.MD',
    'README',
    'readme',
    'README.txt',
    'readme.txt',
    'README.rst',
    'readme.rst',
  ];

  for (const name of readmeNames) {
    try {
      const content = await readFile(join(rootPath, name), 'utf-8');
      return content;
    } catch {
      // Try next name
    }
  }

  return null;
}

/**
 * Get project context (file tree + README) for diagram generation
 */
export async function getProjectContext(
  rootPath: string,
  options: FileTreeOptions = {}
): Promise<{ fileTree: string; readme: string | null }> {
  const [fileTree, readme] = await Promise.all([
    generateFileTree(rootPath, options),
    readReadme(rootPath),
  ]);

  return { fileTree, readme };
}
