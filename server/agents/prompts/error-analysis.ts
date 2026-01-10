/**
 * Error Analysis Prompt Templates
 *
 * Gemini AI를 위한 에러 분석 프롬프트 템플릿
 * - 빌드 에러 분석
 * - 테스트 실패 분석
 * - 타입 에러 분석
 * - 런타임 에러 분석
 */

import type { ParsedError, AnalysisResult } from '../error-analyzer'

export interface FixSuggestion {
  file: string
  startLine: number
  endLine: number
  originalCode: string
  fixedCode: string
  explanation: string
  confidence: number
}

export interface AnalysisResponse {
  rootCause: string
  explanation: string
  fixes: FixSuggestion[]
  additionalNotes?: string
  confidence: number
}

/**
 * 시스템 프롬프트 (공통)
 */
export const SYSTEM_PROMPT = `You are an expert code analyzer and fixer. Your task is to:
1. Analyze error messages and code to identify root causes
2. Generate precise, minimal fixes that resolve the issues
3. Explain the fixes clearly and concisely

Guidelines:
- Always provide fixes in valid, syntactically correct code
- Minimize changes - only fix what's necessary
- Maintain code style and conventions
- Consider edge cases and potential side effects
- Be conservative with confidence scores

Response Format:
Always respond with valid JSON matching the expected schema. Do not include markdown code blocks.`

/**
 * 빌드 에러 분석 프롬프트
 */
export function buildErrorAnalysisPrompt(
  error: ParsedError,
  codeContext: string,
  projectContext?: string
): string {
  return `${SYSTEM_PROMPT}

## Error Information
- Type: Build Error
- Message: ${error.message}
- File: ${error.location?.file || 'Unknown'}
- Line: ${error.location?.line || 'Unknown'}

## Code Context
\`\`\`typescript
${codeContext}
\`\`\`

${projectContext ? `## Project Context\n${projectContext}` : ''}

## Task
Analyze this build error and provide a fix.

Respond with JSON:
{
  "rootCause": "Brief description of why this error occurred",
  "explanation": "Detailed technical explanation",
  "fixes": [
    {
      "file": "path/to/file.ts",
      "startLine": 10,
      "endLine": 12,
      "originalCode": "the original code",
      "fixedCode": "the corrected code",
      "explanation": "why this fix works",
      "confidence": 0.9
    }
  ],
  "additionalNotes": "Any warnings or considerations",
  "confidence": 0.85
}`
}

/**
 * 테스트 실패 분석 프롬프트
 */
export function testFailureAnalysisPrompt(
  error: ParsedError,
  testCode: string,
  implementationCode: string
): string {
  return `${SYSTEM_PROMPT}

## Error Information
- Type: Test Failure
- Message: ${error.message}
- Test File: ${error.location?.file || 'Unknown'}

## Test Code
\`\`\`typescript
${testCode}
\`\`\`

## Implementation Code
\`\`\`typescript
${implementationCode}
\`\`\`

## Task
Analyze why this test is failing and determine if:
1. The test assertion is wrong
2. The implementation has a bug
3. Both need changes

Prefer fixing the implementation over changing tests, unless the test expectation is clearly wrong.

Respond with JSON:
{
  "rootCause": "Why the test is failing",
  "explanation": "Detailed analysis of the mismatch",
  "fixes": [
    {
      "file": "path/to/file.ts",
      "startLine": 10,
      "endLine": 12,
      "originalCode": "the original code",
      "fixedCode": "the corrected code",
      "explanation": "why this fix works",
      "confidence": 0.85
    }
  ],
  "additionalNotes": "Whether test or implementation was fixed and why",
  "confidence": 0.8
}`
}

/**
 * 타입 에러 분석 프롬프트
 */
export function typeErrorAnalysisPrompt(
  error: ParsedError,
  codeContext: string,
  typeDefinitions?: string
): string {
  return `${SYSTEM_PROMPT}

## Error Information
- Type: TypeScript Type Error
- Message: ${error.message}
- File: ${error.location?.file || 'Unknown'}
- Line: ${error.location?.line || 'Unknown'}

## Code Context
\`\`\`typescript
${codeContext}
\`\`\`

${typeDefinitions ? `## Relevant Type Definitions\n\`\`\`typescript\n${typeDefinitions}\n\`\`\`` : ''}

## Task
Analyze this TypeScript type error and provide a fix. Consider:
1. Incorrect type annotations
2. Missing type guards
3. Incompatible types
4. Generic type issues
5. Null/undefined handling

Respond with JSON:
{
  "rootCause": "Why TypeScript is reporting this error",
  "explanation": "Technical explanation of the type mismatch",
  "fixes": [
    {
      "file": "path/to/file.ts",
      "startLine": 10,
      "endLine": 12,
      "originalCode": "the original code",
      "fixedCode": "the corrected code",
      "explanation": "how this fixes the type error",
      "confidence": 0.9
    }
  ],
  "confidence": 0.85
}`
}

/**
 * 런타임 에러 분석 프롬프트
 */
export function runtimeErrorAnalysisPrompt(
  error: ParsedError,
  stackTrace: string,
  codeContext: string
): string {
  return `${SYSTEM_PROMPT}

## Error Information
- Type: Runtime Error
- Message: ${error.message}
- File: ${error.location?.file || 'Unknown'}

## Stack Trace
\`\`\`
${stackTrace}
\`\`\`

## Code Context
\`\`\`typescript
${codeContext}
\`\`\`

## Task
Analyze this runtime error and provide a fix. Consider:
1. Null/undefined access
2. Array out of bounds
3. Invalid function calls
4. Missing error handling
5. Race conditions
6. Resource leaks

Respond with JSON:
{
  "rootCause": "What caused the runtime error",
  "explanation": "How this error occurs at runtime",
  "fixes": [
    {
      "file": "path/to/file.ts",
      "startLine": 10,
      "endLine": 12,
      "originalCode": "the original code",
      "fixedCode": "the corrected code with proper error handling",
      "explanation": "how this prevents the runtime error",
      "confidence": 0.75
    }
  ],
  "additionalNotes": "Potential edge cases to consider",
  "confidence": 0.7
}`
}

/**
 * ESLint 에러 분석 프롬프트
 */
export function lintErrorAnalysisPrompt(
  error: ParsedError,
  codeContext: string,
  ruleName?: string
): string {
  return `${SYSTEM_PROMPT}

## Error Information
- Type: ESLint Error
- Rule: ${ruleName || 'Unknown'}
- Message: ${error.message}
- File: ${error.location?.file || 'Unknown'}
- Line: ${error.location?.line || 'Unknown'}

## Code Context
\`\`\`typescript
${codeContext}
\`\`\`

## Task
Fix this ESLint violation while maintaining code functionality. Consider:
1. The intent of the ESLint rule
2. Best practices it enforces
3. Minimal changes to satisfy the rule

Respond with JSON:
{
  "rootCause": "Why this code violates the ESLint rule",
  "explanation": "What the rule is checking for",
  "fixes": [
    {
      "file": "path/to/file.ts",
      "startLine": 10,
      "endLine": 12,
      "originalCode": "the original code",
      "fixedCode": "the code that satisfies the lint rule",
      "explanation": "how this satisfies the lint rule",
      "confidence": 0.95
    }
  ],
  "confidence": 0.9
}`
}

/**
 * 복합 에러 분석 프롬프트 (여러 에러를 한 번에 분석)
 */
export function batchErrorAnalysisPrompt(
  analysisResult: AnalysisResult,
  codeContexts: Map<string, string>
): string {
  const errorsList = analysisResult.errors
    .slice(0, 10) // 최대 10개만 분석
    .map((e, i) => {
      const context = e.location?.file ? codeContexts.get(e.location.file) : undefined
      return `
### Error ${i + 1}
- Type: ${e.type}
- Severity: ${e.severity}
- Message: ${e.message}
- Location: ${e.location?.file || 'Unknown'}:${e.location?.line || '?'}
${context ? `\`\`\`typescript\n${context}\n\`\`\`` : ''}`
    })
    .join('\n')

  return `${SYSTEM_PROMPT}

## Error Summary
- Total Errors: ${analysisResult.summary.total}
- Critical: ${analysisResult.summary.bySeverity.critical}
- Errors: ${analysisResult.summary.bySeverity.error}
- Warnings: ${analysisResult.summary.bySeverity.warning}

## Errors to Analyze
${errorsList}

## Task
Analyze all errors and provide fixes prioritized by:
1. Critical errors first
2. Errors that block other fixes
3. Related errors that can be fixed together

Respond with JSON:
{
  "summary": "Overall assessment of the codebase issues",
  "prioritizedFixes": [
    {
      "errorIndex": 0,
      "rootCause": "...",
      "fixes": [...],
      "confidence": 0.85
    }
  ],
  "relatedErrors": [[0, 2], [1, 3]],
  "overallConfidence": 0.8
}`
}

/**
 * PR 설명 생성 프롬프트
 */
export function generatePRDescriptionPrompt(
  fixes: FixSuggestion[],
  originalErrors: ParsedError[]
): string {
  const fixesSummary = fixes
    .map(
      (f, i) => `
${i + 1}. **${f.file}** (lines ${f.startLine}-${f.endLine})
   - ${f.explanation}`
    )
    .join('\n')

  const errorsSummary = originalErrors
    .map((e) => `- ${e.type}: ${e.message}`)
    .join('\n')

  return `Generate a professional PR description for the following auto-fix.

## Original Errors
${errorsSummary}

## Fixes Applied
${fixesSummary}

Generate a PR description with:
1. Title (concise, imperative mood)
2. Summary (what was fixed)
3. Changes (bulleted list)
4. Testing notes

Respond with JSON:
{
  "title": "Fix: ...",
  "summary": "...",
  "changes": ["...", "..."],
  "testingNotes": "..."
}`
}
