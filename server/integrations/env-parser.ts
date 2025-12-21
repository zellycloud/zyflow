/**
 * .env 파일 파서
 * 환경변수 파일을 파싱하여 key-value 쌍으로 변환
 */

import { readFile, readdir, access, stat } from 'fs/promises'
import { join } from 'path'

export interface EnvFileInfo {
  name: string
  variableCount: number
  size: number
}

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
  // 기본 .env 파일들
  '.env',
  '.env.local',
  // 환경별 파일
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.staging',
  '.env.staging.local',
  '.env.test',
  '.env.test.local',
  // Next.js 특화
  '.env.preview',
  // Doppler / 기타
  '.env.me',
  '.env.vault',
  // Wrangler (Cloudflare Workers)
  '.dev.vars',
  // Docker
  '.env.docker',
  // Serverless
  '.env.sls',
]

// 추가 환경 파일 (하위 폴더 내)
const ADDITIONAL_ENV_DIRS = [
  '.vercel', // Vercel CLI 로컬 설정
  'config',
  'configs',
  'environments',
  'env',
]

// 추가 설정 파일 패턴 (폴더 내에서 찾을 파일들)
const ADDITIONAL_ENV_FILES_IN_DIRS = [
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.preview.local',
  '.env.production.local',
  'default.env',
  'development.env',
  'production.env',
  'staging.env',
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
 * @param includeSubdirs 하위 디렉토리도 검색할지 여부 (기본: true)
 */
export async function findEnvFiles(projectPath: string, includeSubdirs = true): Promise<string[]> {
  const foundFiles: string[] = []

  // 1. 기본 패턴 확인 (루트 디렉토리)
  for (const pattern of ENV_FILE_PATTERNS) {
    const filePath = join(projectPath, pattern)
    try {
      await access(filePath)
      foundFiles.push(pattern)
    } catch {
      // 파일 없음
    }
  }

  // 2. 추가로 .env.* 패턴 검색 (루트)
  try {
    const entries = await readdir(projectPath)
    for (const entry of entries) {
      if (
        (entry.startsWith('.env') || entry.endsWith('.env')) &&
        !foundFiles.includes(entry) &&
        !entry.includes('.example') &&
        !entry.includes('.sample') &&
        !entry.includes('.template')
      ) {
        // 파일인지 확인
        try {
          const fileStat = await stat(join(projectPath, entry))
          if (fileStat.isFile()) {
            foundFiles.push(entry)
          }
        } catch {
          // stat 실패
        }
      }
    }
  } catch {
    // 디렉토리 읽기 실패
  }

  // 3. 하위 디렉토리 검색
  if (includeSubdirs) {
    for (const subdir of ADDITIONAL_ENV_DIRS) {
      const subdirPath = join(projectPath, subdir)
      try {
        await access(subdirPath)
        const subdirStat = await stat(subdirPath)

        if (subdirStat.isDirectory()) {
          // 지정된 파일 패턴 확인
          for (const pattern of ADDITIONAL_ENV_FILES_IN_DIRS) {
            const filePath = join(subdirPath, pattern)
            try {
              await access(filePath)
              const relativePath = join(subdir, pattern)
              if (!foundFiles.includes(relativePath)) {
                foundFiles.push(relativePath)
              }
            } catch {
              // 파일 없음
            }
          }

          // 추가로 .env.* 패턴 검색 (하위 디렉토리)
          try {
            const subdirEntries = await readdir(subdirPath)
            for (const entry of subdirEntries) {
              if (
                (entry.startsWith('.env') || entry.endsWith('.env')) &&
                !entry.includes('.example') &&
                !entry.includes('.sample') &&
                !entry.includes('.template')
              ) {
                const relativePath = join(subdir, entry)
                if (!foundFiles.includes(relativePath)) {
                  try {
                    const fileStat = await stat(join(subdirPath, entry))
                    if (fileStat.isFile()) {
                      foundFiles.push(relativePath)
                    }
                  } catch {
                    // stat 실패
                  }
                }
              }
            }
          } catch {
            // 디렉토리 읽기 실패
          }
        }
      } catch {
        // 하위 디렉토리 없음
      }
    }
  }

  return foundFiles
}

/**
 * 프로젝트의 .env 파일 정보 조회 (파일 목록 + 변수 개수)
 */
export async function getEnvFileInfos(projectPath: string): Promise<EnvFileInfo[]> {
  const envFiles = await findEnvFiles(projectPath)
  const fileInfos: EnvFileInfo[] = []

  for (const fileName of envFiles) {
    const filePath = join(projectPath, fileName)
    try {
      const content = await readFile(filePath, 'utf-8')
      const fileStat = await stat(filePath)
      const parsed = parseEnvContent(content)

      fileInfos.push({
        name: fileName,
        variableCount: parsed.size,
        size: fileStat.size,
      })
    } catch {
      // 파일 읽기 실패 시 스킵
    }
  }

  return fileInfos
}

/**
 * 프로젝트의 모든 .env 파일 파싱
 * @param projectPath 프로젝트 경로
 * @param selectedFiles 선택된 파일들 (없으면 모든 파일 스캔)
 */
export async function parseProjectEnvFiles(
  projectPath: string,
  selectedFiles?: string[]
): Promise<EnvParseResult> {
  const result: EnvParseResult = {
    variables: [],
    files: [],
    errors: [],
  }

  const envFiles = await findEnvFiles(projectPath)

  // 선택된 파일만 필터링 (없으면 모든 파일)
  const filesToParse = selectedFiles && selectedFiles.length > 0
    ? envFiles.filter(f => selectedFiles.includes(f))
    : envFiles

  result.files = filesToParse

  // 각 파일 파싱 (나중 파일이 우선)
  const allVariables = new Map<string, EnvVariable>()

  for (const fileName of filesToParse) {
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
