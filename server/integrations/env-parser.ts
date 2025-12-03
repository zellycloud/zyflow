/**
 * .env 파일 파서
 * 환경변수 파일을 파싱하여 key-value 쌍으로 변환
 */

import { readFile, readdir, access } from 'fs/promises'
import { join } from 'path'

export interface EnvVariable {
  key: string
  value: string
  source: string // 파일 이름 (예: '.env', '.env.local')
}

export interface EnvParseResult {
  variables: EnvVariable[]
  files: string[]
  errors: Array<{ file: string; error: string }>
}

// 지원하는 .env 파일 패턴 (우선순위 순)
const ENV_FILE_PATTERNS = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.staging',
  '.env.test',
]

/**
 * 단일 .env 파일 파싱
 */
export function parseEnvContent(content: string): Map<string, string> {
  const result = new Map<string, string>()
  const lines = content.split('\n')

  let multilineKey: string | null = null
  let multilineValue = ''
  let multilineQuote: string | null = null

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // 멀티라인 처리 중
    if (multilineKey !== null) {
      if (multilineQuote && line.includes(multilineQuote)) {
        // 닫는 따옴표 찾음
        const endIdx = line.indexOf(multilineQuote)
        multilineValue += '\n' + line.substring(0, endIdx)
        result.set(multilineKey, multilineValue)
        multilineKey = null
        multilineValue = ''
        multilineQuote = null
        continue
      } else {
        multilineValue += '\n' + line
        continue
      }
    }

    // 빈 줄이나 주석 스킵
    line = line.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    // KEY=VALUE 파싱
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) {
      continue
    }

    const key = line.substring(0, eqIndex).trim()
    let value = line.substring(eqIndex + 1)

    // export KEY=VALUE 형식 처리
    const cleanKey = key.replace(/^export\s+/, '')

    // 따옴표 처리
    value = value.trim()

    if (
      (value.startsWith('"') && !value.endsWith('"')) ||
      (value.startsWith("'") && !value.endsWith("'"))
    ) {
      // 멀티라인 값 시작
      multilineKey = cleanKey
      multilineQuote = value[0]
      multilineValue = value.substring(1)
      continue
    }

    // 따옴표 제거
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // 인라인 주석 제거 (따옴표 밖의 #)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIdx = value.indexOf(' #')
      if (commentIdx !== -1) {
        value = value.substring(0, commentIdx).trim()
      }
    }

    // 이스케이프 시퀀스 처리
    value = value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')

    result.set(cleanKey, value)
  }

  return result
}

/**
 * 프로젝트 디렉토리에서 .env 파일 찾기
 */
export async function findEnvFiles(projectPath: string): Promise<string[]> {
  const foundFiles: string[] = []

  // 기본 패턴 확인
  for (const pattern of ENV_FILE_PATTERNS) {
    const filePath = join(projectPath, pattern)
    try {
      await access(filePath)
      foundFiles.push(pattern)
    } catch {
      // 파일 없음
    }
  }

  // 추가로 .env.* 패턴 검색
  try {
    const entries = await readdir(projectPath)
    for (const entry of entries) {
      if (
        entry.startsWith('.env') &&
        !foundFiles.includes(entry) &&
        !entry.includes('.example') &&
        !entry.includes('.sample')
      ) {
        foundFiles.push(entry)
      }
    }
  } catch {
    // 디렉토리 읽기 실패
  }

  return foundFiles
}

/**
 * 프로젝트의 모든 .env 파일 파싱
 */
export async function parseProjectEnvFiles(projectPath: string): Promise<EnvParseResult> {
  const result: EnvParseResult = {
    variables: [],
    files: [],
    errors: [],
  }

  const envFiles = await findEnvFiles(projectPath)
  result.files = envFiles

  // 각 파일 파싱 (나중 파일이 우선)
  const allVariables = new Map<string, EnvVariable>()

  for (const fileName of envFiles) {
    const filePath = join(projectPath, fileName)
    try {
      const content = await readFile(filePath, 'utf-8')
      const parsed = parseEnvContent(content)

      for (const [key, value] of parsed) {
        allVariables.set(key, {
          key,
          value,
          source: fileName,
        })
      }
    } catch (error) {
      result.errors.push({
        file: fileName,
        error: (error as Error).message,
      })
    }
  }

  result.variables = Array.from(allVariables.values())
  return result
}

/**
 * 특정 .env 파일만 파싱
 */
export async function parseEnvFile(
  projectPath: string,
  fileName: string
): Promise<EnvVariable[]> {
  const filePath = join(projectPath, fileName)
  const content = await readFile(filePath, 'utf-8')
  const parsed = parseEnvContent(content)

  return Array.from(parsed.entries()).map(([key, value]) => ({
    key,
    value,
    source: fileName,
  }))
}
