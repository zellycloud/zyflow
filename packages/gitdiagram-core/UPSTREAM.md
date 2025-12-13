# Upstream Synchronization Guide

This package is based on [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) by Ahmed Khaleel.

## Upstream Repository

- **Repository**: https://github.com/ahmedkhaleel2004/gitdiagram
- **License**: MIT
- **Last Sync**: 2024-12-13

## Ported Components

| Original File | Ported File | Status |
|---------------|-------------|--------|
| `backend/app/prompts.py` | `src/prompts.ts` | Ported |
| `backend/app/generate.py` | `src/generator.ts` | Pending |
| File tree generation | `src/file-tree.ts` | Pending |

## Synchronization Process

1. Check upstream for changes:
   ```bash
   ./scripts/check-upstream.sh
   ```

2. Review changes in `backend/app/prompts.py` for prompt updates

3. Update corresponding TypeScript files

4. Update `lastSync` in `package.json`

## Key Differences from Upstream

- TypeScript instead of Python
- Designed for MCP server integration
- Supports multiple LLM providers (Claude, OpenAI)
- Integrated with ZyFlow project management

## Attribution

Original prompts and generation logic by Ahmed Khaleel.
Adapted for ZyFlow with modifications for TypeScript and MCP integration.
