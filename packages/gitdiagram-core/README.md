# GitDiagram Core

AI-powered repository architecture diagram generator. Automatically generates Mermaid.js diagrams from codebase structure using a 3-stage LLM pipeline.

## Overview

This package is a TypeScript port of the [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) project, adapted for integration with ZyFlow.

## Features

- **3-Stage AI Generation Pipeline**:
  1. **Architecture Analysis**: Analyzes file tree and README to understand project structure
  2. **Component Mapping**: Maps key components to diagram nodes
  3. **Mermaid Generation**: Creates final Mermaid.js flowchart code

- **LLM Adapter Abstraction**: Supports Claude and OpenAI APIs
- **Mermaid Validation**: Syntax checking and click event processing
- **File Tree Generation**: Recursive directory scanning with exclusion patterns

## Installation

```bash
npm install @zyflow/gitdiagram-core
```

## Usage

### Basic Usage

```typescript
import { generateDiagram, createLLMAdapter } from '@zyflow/gitdiagram-core'

const adapter = createLLMAdapter('claude', {
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const result = await generateDiagram(adapter, {
  fileTree: '...',  // Directory structure string
  readme: '...',    // README content (optional)
  instructions: 'Focus on the API layer',
})

console.log(result.mermaidCode)
```

### Using the DiagramGenerator Class

```typescript
import { DiagramGenerator, ClaudeAdapter } from '@zyflow/gitdiagram-core'

const generator = new DiagramGenerator({
  llmAdapter: new ClaudeAdapter({ apiKey: '...' }),
})

// Generate full diagram
const result = await generator.generate({
  fileTree: '...',
  readme: '...',
})

// Modify existing diagram
const modified = await generator.modify({
  currentDiagram: result.mermaidCode,
  fileTree: '...',
  instructions: 'Add database connections',
})
```

### Generating File Tree

```typescript
import { generateFileTree, readReadme } from '@zyflow/gitdiagram-core'

const fileTree = await generateFileTree('/path/to/repo', {
  maxDepth: 5,
  excludePatterns: ['node_modules', '.git', 'dist'],
})

const readme = await readReadme('/path/to/repo')
```

### Mermaid Utilities

```typescript
import {
  validateMermaidSyntax,
  extractClickEvents,
  pathsToGitHubUrls,
} from '@zyflow/gitdiagram-core'

// Validate syntax
const validation = validateMermaidSyntax(code)
if (!validation.valid) {
  console.error(validation.errors)
}

// Extract click events
const events = extractClickEvents(code)
// [{ nodeId: 'App', path: 'src/App.tsx' }, ...]

// Convert paths to GitHub URLs
const withUrls = pathsToGitHubUrls(
  code,
  'https://github.com/user/repo',
  'main'
)
```

## MCP Tools

This package provides MCP tools for Claude Code integration:

- `diagram_generate`: Generate architecture diagram from repository
- `diagram_from_change`: Generate diagram focused on OpenSpec change impact
- `diagram_validate`: Validate Mermaid diagram syntax

## API Reference

### Functions

| Function | Description |
|----------|-------------|
| `generateDiagram` | Main function for 3-stage diagram generation |
| `modifyDiagram` | Modify existing diagram with new instructions |
| `generateFileTree` | Generate directory structure string |
| `readReadme` | Read README file from repository |
| `validateMermaidSyntax` | Validate Mermaid code syntax |
| `extractClickEvents` | Extract click event definitions |
| `pathsToGitHubUrls` | Convert file paths to GitHub URLs |

### Classes

| Class | Description |
|-------|-------------|
| `DiagramGenerator` | Stateful generator with caching |
| `ClaudeAdapter` | Claude API adapter |
| `OpenAIAdapter` | OpenAI API adapter |

### Prompts

The package exports prompt templates used in the generation pipeline:

- `SYSTEM_FIRST_PROMPT`: Architecture explanation generation
- `SYSTEM_SECOND_PROMPT`: Component mapping to diagram nodes
- `SYSTEM_THIRD_PROMPT`: Final Mermaid code generation
- `SYSTEM_MODIFY_PROMPT`: Diagram modification prompt

## Upstream Sync

This package is based on [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram).
See [UPSTREAM.md](./UPSTREAM.md) for synchronization guidelines.

## License

MIT
