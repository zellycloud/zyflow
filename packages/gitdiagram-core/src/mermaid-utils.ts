/**
 * Mermaid.js Utilities
 *
 * Validation, parsing, and click event processing for Mermaid diagrams
 */

export interface ClickEvent {
  /** Node ID in the diagram */
  nodeId: string;
  /** File or directory path */
  path: string;
}

export interface ValidationResult {
  /** Whether the diagram is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Common Mermaid syntax errors to check for
 */
const SYNTAX_CHECKS = [
  {
    // Special characters without quotes in node labels
    pattern: /\[([^\]"]*[()\\<>][^\]"]*)\]/g,
    message: 'Node label contains special characters without quotes',
    severity: 'error' as const,
  },
  {
    // Spaces in relationship labels
    pattern: /-->\|\s+[^|]+\s+\|/g,
    message: 'Relationship label has spaces around content',
    severity: 'warning' as const,
  },
  {
    // Class style on subgraph
    pattern: /subgraph\s+"[^"]*":::/g,
    message: 'Cannot apply class style directly to subgraph declaration',
    severity: 'error' as const,
  },
  {
    // Subgraph with alias
    pattern: /subgraph\s+\w+\s+"[^"]*"/g,
    message: 'Subgraphs cannot have aliases like nodes',
    severity: 'error' as const,
  },
  {
    // Init declaration (should be handled externally)
    pattern: /%%\{init:/g,
    message: 'Init declaration should be handled externally',
    severity: 'warning' as const,
  },
];

/**
 * Validate Mermaid diagram syntax
 */
export function validateMermaidSyntax(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for empty code
  if (!code.trim()) {
    return {
      valid: false,
      errors: ['Empty diagram code'],
      warnings: [],
    };
  }

  // Check for diagram type declaration
  const firstLine = code.trim().split('\n')[0];
  const validTypes = [
    'flowchart',
    'graph',
    'sequenceDiagram',
    'classDiagram',
    'stateDiagram',
    'erDiagram',
    'journey',
    'gantt',
    'pie',
    'gitGraph',
    'mindmap',
    'timeline',
    'quadrantChart',
    'requirementDiagram',
    'C4Context',
    'architecture',
  ];

  const hasValidType = validTypes.some(
    (type) =>
      firstLine.startsWith(type) ||
      firstLine.startsWith(`%%`) ||
      firstLine.startsWith('---')
  );

  if (!hasValidType) {
    warnings.push(
      `First line should be a diagram type declaration (found: "${firstLine.slice(0, 30)}...")`
    );
  }

  // Run syntax checks
  for (const check of SYNTAX_CHECKS) {
    const matches = code.match(check.pattern);
    if (matches) {
      const message = `${check.message} (${matches.length} occurrence(s))`;
      if (check.severity === 'error') {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  // Check for balanced brackets and parentheses
  const brackets = { '[': ']', '(': ')', '{': '}', '"': '"' };
  const stack: string[] = [];

  for (const char of code) {
    if ('[({'.includes(char)) {
      stack.push(char);
    } else if ('])}'.includes(char)) {
      const expected = brackets[stack.pop() as keyof typeof brackets];
      if (expected !== char) {
        errors.push('Unbalanced brackets/parentheses');
        break;
      }
    }
  }

  if (stack.length > 0) {
    errors.push('Unclosed brackets/parentheses');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Extract click events from Mermaid code
 */
export function extractClickEvents(code: string): ClickEvent[] {
  const events: ClickEvent[] = [];

  // Match click events: click NodeId "path"
  const clickPattern = /click\s+(\w+)\s+"([^"]+)"/g;

  let match;
  while ((match = clickPattern.exec(code)) !== null) {
    events.push({
      nodeId: match[1],
      path: match[2],
    });
  }

  return events;
}

/**
 * Add or update click events in Mermaid code
 */
export function updateClickEvents(
  code: string,
  events: ClickEvent[]
): string {
  let result = code;

  // Remove existing click events section if present
  result = result.replace(/\n\s*%% Click Events[\s\S]*?(?=\n\s*%%|$)/g, '');

  // Remove individual click events
  result = result.replace(/\n\s*click\s+\w+\s+"[^"]+"/g, '');

  // Add new click events before styles section or at the end
  if (events.length > 0) {
    const clickSection =
      '\n    %% Click Events\n' +
      events.map((e) => `    click ${e.nodeId} "${e.path}"`).join('\n');

    // Try to insert before styles section
    const stylesMatch = result.match(/\n\s*%% Styles/);
    if (stylesMatch && stylesMatch.index !== undefined) {
      result =
        result.slice(0, stylesMatch.index) +
        clickSection +
        '\n' +
        result.slice(stylesMatch.index);
    } else {
      result = result.trimEnd() + '\n' + clickSection;
    }
  }

  return result;
}

/**
 * Convert file paths to GitHub URLs
 */
export function pathsToGitHubUrls(
  code: string,
  repoUrl: string,
  branch: string = 'main'
): string {
  // Normalize repo URL
  const baseUrl = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');

  // Extract click events and update paths
  const clickPattern = /click\s+(\w+)\s+"([^"]+)"/g;

  return code.replace(clickPattern, (match, nodeId, path) => {
    // Skip if already a URL
    if (path.startsWith('http')) {
      return match;
    }

    const fullUrl = `${baseUrl}/blob/${branch}/${path}`;
    return `click ${nodeId} "${fullUrl}"`;
  });
}

/**
 * Extract node IDs from Mermaid code
 */
export function extractNodeIds(code: string): string[] {
  const nodeIds = new Set<string>();

  // Match node definitions: NodeId[...] or NodeId(...) or NodeId{...}
  const nodePattern = /^\s*(\w+)\s*[[({]/gm;

  let match;
  while ((match = nodePattern.exec(code)) !== null) {
    nodeIds.add(match[1]);
  }

  return Array.from(nodeIds);
}

/**
 * Add color styling if missing
 */
export function ensureColorStyles(code: string): string {
  // Check if any classDef is present
  if (code.includes('classDef')) {
    return code;
  }

  // Add default color styles
  const defaultStyles = `
    %% Styles
    classDef frontend fill:#42b883,stroke:#35495e,color:#fff
    classDef backend fill:#68a063,stroke:#3e6b38,color:#fff
    classDef database fill:#336791,stroke:#1a3a52,color:#fff
    classDef external fill:#f5a623,stroke:#c4841d,color:#fff
    classDef api fill:#61dafb,stroke:#20a4d8,color:#333
`;

  return code.trimEnd() + '\n' + defaultStyles;
}

/**
 * Format Mermaid code for better readability
 */
export function formatMermaidCode(code: string): string {
  const lines = code.split('\n');
  const formatted: string[] = [];

  let indentLevel = 0;
  const baseIndent = '    ';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      formatted.push('');
      continue;
    }

    // Decrease indent for 'end' keyword
    if (trimmed === 'end') {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    // Add line with proper indentation
    formatted.push(baseIndent.repeat(indentLevel) + trimmed);

    // Increase indent after 'subgraph'
    if (trimmed.startsWith('subgraph')) {
      indentLevel++;
    }
  }

  return formatted.join('\n');
}
