/**
 * ADK File System Tools
 *
 * 에이전트가 파일 시스템과 상호작용하기 위한 도구들
 */

import { FunctionTool } from '@google/adk'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

/**
 * 파일 읽기 도구
 */
export const readFileTool = new FunctionTool({
  name: 'readFile',
  description: '파일의 내용을 읽습니다. 코드 분석이나 에러 위치 확인에 사용합니다.',
  parameters: z.object({
    filePath: z.string().describe('읽을 파일의 경로 (프로젝트 루트 기준 상대 경로)'),
    startLine: z.number().optional().describe('시작 라인 번호 (1부터 시작)'),
    endLine: z.number().optional().describe('끝 라인 번호'),
  }),
  execute: async ({ filePath, startLine, endLine }) => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath)

      // 보안: 프로젝트 디렉토리 외부 접근 방지
      if (!absolutePath.startsWith(process.cwd())) {
        return { success: false, error: '프로젝트 디렉토리 외부 접근 불가' }
      }

      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: `파일을 찾을 수 없음: ${filePath}` }
      }

      const content = fs.readFileSync(absolutePath, 'utf-8')
      const lines = content.split('\n')

      if (startLine !== undefined || endLine !== undefined) {
        const start = (startLine ?? 1) - 1
        const end = endLine ?? lines.length
        const slicedLines = lines.slice(start, end)
        return {
          success: true,
          content: slicedLines.join('\n'),
          totalLines: lines.length,
          returnedLines: { start: start + 1, end: Math.min(end, lines.length) },
        }
      }

      return { success: true, content, totalLines: lines.length }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

/**
 * 파일 쓰기 도구
 */
export const writeFileTool = new FunctionTool({
  name: 'writeFile',
  description: '파일에 내용을 씁니다. 코드 수정이나 새 파일 생성에 사용합니다.',
  parameters: z.object({
    filePath: z.string().describe('쓸 파일의 경로 (프로젝트 루트 기준 상대 경로)'),
    content: z.string().describe('파일에 쓸 내용'),
    createDirectories: z.boolean().optional().describe('필요한 디렉토리 자동 생성 여부'),
  }),
  execute: async ({ filePath, content, createDirectories }) => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath)

      // 보안: 프로젝트 디렉토리 외부 접근 방지
      if (!absolutePath.startsWith(process.cwd())) {
        return { success: false, error: '프로젝트 디렉토리 외부 접근 불가' }
      }

      if (createDirectories) {
        const dir = path.dirname(absolutePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
      }

      fs.writeFileSync(absolutePath, content, 'utf-8')
      return { success: true, path: filePath, bytesWritten: Buffer.byteLength(content, 'utf-8') }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

/**
 * 코드 검색 도구 (ripgrep 사용)
 */
export const searchCodeTool = new FunctionTool({
  name: 'searchCode',
  description: '코드베이스에서 패턴을 검색합니다. 에러 관련 코드나 함수 정의를 찾는데 사용합니다.',
  parameters: z.object({
    pattern: z.string().describe('검색할 패턴 (정규식 지원)'),
    filePattern: z.string().optional().describe('파일 패턴 필터 (예: "*.ts", "*.tsx")'),
    directory: z.string().optional().describe('검색할 디렉토리 (기본: 프로젝트 루트)'),
    maxResults: z.number().optional().describe('최대 결과 수 (기본: 50)'),
    contextLines: z.number().optional().describe('매치 주변 컨텍스트 라인 수 (기본: 2)'),
  }),
  execute: async ({ pattern, filePattern, directory, maxResults = 50, contextLines = 2 }) => {
    try {
      const searchDir = directory ? path.resolve(process.cwd(), directory) : process.cwd()

      // 보안: 프로젝트 디렉토리 외부 접근 방지
      if (!searchDir.startsWith(process.cwd())) {
        return { success: false, error: '프로젝트 디렉토리 외부 검색 불가' }
      }

      const args = [
        '--json',
        '-C', String(contextLines),
        '-m', String(maxResults),
        '--no-heading',
      ]

      if (filePattern) {
        args.push('-g', filePattern)
      }

      args.push(pattern, searchDir)

      const result = execFileSync('rg', args, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
      })

      // ripgrep JSON 출력 파싱
      const matches: Array<{
        file: string
        line: number
        content: string
        context?: string[]
      }> = []

      const lines = result.trim().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.type === 'match') {
            matches.push({
              file: path.relative(process.cwd(), parsed.data.path.text),
              line: parsed.data.line_number,
              content: parsed.data.lines.text.trim(),
            })
          }
        } catch {
          // JSON 파싱 실패 무시
        }
      }

      return { success: true, matches, totalMatches: matches.length }
    } catch (error: unknown) {
      // ripgrep이 결과 없을 때 exit code 1 반환
      if (error && typeof error === 'object' && 'status' in error && error.status === 1) {
        return { success: true, matches: [], totalMatches: 0 }
      }
      return { success: false, error: String(error) }
    }
  },
})

/**
 * 파일 존재 확인 도구
 */
export const fileExistsTool = new FunctionTool({
  name: 'fileExists',
  description: '파일이 존재하는지 확인합니다.',
  parameters: z.object({
    filePath: z.string().describe('확인할 파일의 경로'),
  }),
  execute: async ({ filePath }) => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath)

      if (!absolutePath.startsWith(process.cwd())) {
        return { success: false, error: '프로젝트 디렉토리 외부 접근 불가' }
      }

      const exists = fs.existsSync(absolutePath)
      const stats = exists ? fs.statSync(absolutePath) : null

      return {
        success: true,
        exists,
        isFile: stats?.isFile() ?? false,
        isDirectory: stats?.isDirectory() ?? false,
        size: stats?.size,
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

/**
 * 디렉토리 목록 도구
 */
export const listDirectoryTool = new FunctionTool({
  name: 'listDirectory',
  description: '디렉토리의 파일 목록을 가져옵니다.',
  parameters: z.object({
    directory: z.string().describe('목록을 가져올 디렉토리 경로'),
    recursive: z.boolean().optional().describe('하위 디렉토리 포함 여부 (기본: false)'),
    pattern: z.string().optional().describe('파일 이름 필터 패턴 (glob)'),
  }),
  execute: async ({ directory, recursive = false, pattern }) => {
    try {
      const absolutePath = path.resolve(process.cwd(), directory)

      if (!absolutePath.startsWith(process.cwd())) {
        return { success: false, error: '프로젝트 디렉토리 외부 접근 불가' }
      }

      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: `디렉토리를 찾을 수 없음: ${directory}` }
      }

      const entries: Array<{ path: string; type: 'file' | 'directory'; size?: number }> = []

      function scanDir(dir: string, relativePath: string = '') {
        const items = fs.readdirSync(dir, { withFileTypes: true })

        for (const item of items) {
          // node_modules, .git 등 무시
          if (item.name === 'node_modules' || item.name === '.git' || item.name.startsWith('.')) {
            continue
          }

          const itemRelPath = path.join(relativePath, item.name)
          const itemAbsPath = path.join(dir, item.name)

          if (pattern) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'))
            if (!regex.test(item.name)) {
              if (!item.isDirectory()) continue
            }
          }

          if (item.isDirectory()) {
            entries.push({ path: itemRelPath, type: 'directory' })
            if (recursive) {
              scanDir(itemAbsPath, itemRelPath)
            }
          } else {
            const stats = fs.statSync(itemAbsPath)
            entries.push({ path: itemRelPath, type: 'file', size: stats.size })
          }
        }
      }

      scanDir(absolutePath)

      return { success: true, entries, totalEntries: entries.length }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

/**
 * 파일 부분 수정 도구
 */
export const patchFileTool = new FunctionTool({
  name: 'patchFile',
  description: '파일의 특정 부분만 수정합니다. 전체 파일을 다시 쓰지 않고 특정 라인이나 패턴을 교체합니다.',
  parameters: z.object({
    filePath: z.string().describe('수정할 파일의 경로'),
    patches: z.array(z.object({
      type: z.enum(['replace', 'insert', 'delete']).describe('패치 타입'),
      startLine: z.number().optional().describe('시작 라인 (1부터 시작)'),
      endLine: z.number().optional().describe('끝 라인 (replace, delete용)'),
      searchPattern: z.string().optional().describe('검색할 패턴 (패턴 기반 교체용)'),
      content: z.string().optional().describe('새 내용 (replace, insert용)'),
    })).describe('적용할 패치 목록'),
  }),
  execute: async ({ filePath, patches }) => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath)

      if (!absolutePath.startsWith(process.cwd())) {
        return { success: false, error: '프로젝트 디렉토리 외부 접근 불가' }
      }

      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: `파일을 찾을 수 없음: ${filePath}` }
      }

      let content = fs.readFileSync(absolutePath, 'utf-8')
      const appliedPatches: string[] = []

      for (const patch of patches) {
        if (patch.type === 'replace' && patch.searchPattern) {
          // 패턴 기반 교체
          const regex = new RegExp(patch.searchPattern, 'g')
          const newContent = content.replace(regex, patch.content ?? '')
          if (newContent !== content) {
            content = newContent
            appliedPatches.push(`패턴 교체: ${patch.searchPattern}`)
          }
        } else if (patch.type === 'replace' && patch.startLine) {
          // 라인 기반 교체
          const lines = content.split('\n')
          const start = patch.startLine - 1
          const end = (patch.endLine ?? patch.startLine) - 1
          const newLines = (patch.content ?? '').split('\n')
          lines.splice(start, end - start + 1, ...newLines)
          content = lines.join('\n')
          appliedPatches.push(`라인 교체: ${patch.startLine}-${patch.endLine ?? patch.startLine}`)
        } else if (patch.type === 'insert' && patch.startLine) {
          // 라인 삽입
          const lines = content.split('\n')
          const newLines = (patch.content ?? '').split('\n')
          lines.splice(patch.startLine - 1, 0, ...newLines)
          content = lines.join('\n')
          appliedPatches.push(`라인 삽입: ${patch.startLine}`)
        } else if (patch.type === 'delete' && patch.startLine) {
          // 라인 삭제
          const lines = content.split('\n')
          const start = patch.startLine - 1
          const end = (patch.endLine ?? patch.startLine) - 1
          lines.splice(start, end - start + 1)
          content = lines.join('\n')
          appliedPatches.push(`라인 삭제: ${patch.startLine}-${patch.endLine ?? patch.startLine}`)
        }
      }

      fs.writeFileSync(absolutePath, content, 'utf-8')

      return { success: true, appliedPatches, resultingSize: Buffer.byteLength(content, 'utf-8') }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

// 모든 파일 도구 내보내기
export const fileTools = [
  readFileTool,
  writeFileTool,
  searchCodeTool,
  fileExistsTool,
  listDirectoryTool,
  patchFileTool,
]
