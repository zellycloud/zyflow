/**
 * 환경변수 임포트 서비스
 * .env 파일에서 서비스 계정을 자동으로 감지하고 등록
 */

import { parseProjectEnvFiles, getEnvFileInfos, type EnvParseResult, type EnvFileInfo } from '../env-parser.js'
import {
  detectServices,
  mapToIntegrationHubType,
  maskCredentialValue,
  type ScanResult,
  type ExtendedServiceType,
  type EnvironmentHint,
} from '../service-patterns.js'
import { createServiceAccount, listServiceAccounts } from './accounts.js'
import type { ServiceType } from '../db/schema.js'

// =============================================
// 스캔 결과 타입 (API 응답용)
// =============================================

export interface EnvScanResponse {
  files: string[]
  services: Array<{
    type: ExtendedServiceType
    displayName: string
    credentials: Record<string, string> // 마스킹된 값
    isComplete: boolean
    missingRequired: string[]
    sources: string[]
    environment?: EnvironmentHint
    existingAccount?: {
      id: string
      name: string
    }
  }>
  unmatchedCount: number
}

export interface ImportRequest {
  services: Array<{
    type: ExtendedServiceType
    name: string
    updateExisting?: boolean
  }>
}

export interface ImportResponse {
  created: number
  updated: number
  skipped: number
  errors: Array<{
    type: ExtendedServiceType
    error: string
  }>
  accounts: Array<{
    id: string
    type: string
    name: string
  }>
}

// =============================================
// 스캔 서비스
// =============================================

/**
 * 프로젝트의 .env 파일을 스캔하고 감지된 서비스 반환
 */
export async function scanProjectEnv(projectPath: string): Promise<EnvScanResponse> {
  // 1. .env 파일 파싱
  const parseResult: EnvParseResult = await parseProjectEnvFiles(projectPath)

  // 2. 서비스 패턴 매칭
  const scanResult: ScanResult = detectServices(parseResult.variables)

  // 3. 기존 계정과 비교
  const existingAccounts = await listServiceAccounts()

  // 4. 응답 생성 (credential 값 마스킹)
  const services = scanResult.services.map((service) => {
    // 기존 계정 중 같은 타입이 있는지 확인
    const hubType = mapToIntegrationHubType(service.type)
    const existing = existingAccounts.find((acc) => acc.type === hubType)

    return {
      type: service.type,
      displayName: service.displayName,
      credentials: Object.fromEntries(
        Object.entries(service.credentials).map(([key, value]) => [
          key,
          maskCredentialValue(value),
        ])
      ),
      isComplete: service.isComplete,
      missingRequired: service.missingRequired,
      sources: service.sources,
      existingAccount: existing
        ? {
            id: existing.id,
            name: existing.name,
          }
        : undefined,
    }
  })

  return {
    files: parseResult.files,
    services,
    unmatchedCount: scanResult.unmatchedVariables.length,
  }
}

// 스캔 결과 캐시 (임포트 시 사용)
const scanCache = new Map<string, ScanResult & { rawCredentials: Map<ExtendedServiceType, Record<string, string>> }>()

/**
 * 스캔 결과를 캐시에 저장 (임포트 시 사용)
 * @param projectPath 프로젝트 경로
 * @param selectedFiles 선택된 파일들 (없으면 모든 파일 스캔)
 */
export async function scanAndCacheProjectEnv(
  projectPath: string,
  selectedFiles?: string[]
): Promise<EnvScanResponse> {
  const parseResult = await parseProjectEnvFiles(projectPath, selectedFiles)
  const scanResult = detectServices(parseResult.variables)

  // 원본 credential 저장 (마스킹 전)
  const rawCredentials = new Map<ExtendedServiceType, Record<string, string>>()
  for (const service of scanResult.services) {
    rawCredentials.set(service.type, { ...service.credentials })
  }

  scanCache.set(projectPath, {
    ...scanResult,
    rawCredentials,
  })

  // 마스킹된 응답 반환
  const existingAccounts = await listServiceAccounts()

  const services = scanResult.services.map((service) => {
    const hubType = mapToIntegrationHubType(service.type)
    const existing = existingAccounts.find((acc) => acc.type === hubType)

    return {
      type: service.type,
      displayName: service.displayName,
      credentials: Object.fromEntries(
        Object.entries(service.credentials).map(([key, value]) => [
          key,
          maskCredentialValue(value),
        ])
      ),
      isComplete: service.isComplete,
      missingRequired: service.missingRequired,
      sources: service.sources,
      environment: service.environment,
      existingAccount: existing
        ? {
            id: existing.id,
            name: existing.name,
          }
        : undefined,
    }
  })

  return {
    files: parseResult.files,
    services,
    unmatchedCount: scanResult.unmatchedVariables.length,
  }
}

// =============================================
// 임포트 서비스
// =============================================

/**
 * 선택된 서비스를 Integration Hub에 등록
 */
export async function importServices(
  projectPath: string,
  request: ImportRequest
): Promise<ImportResponse> {
  const result: ImportResponse = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    accounts: [],
  }

  // 캐시된 스캔 결과 사용
  let cached = scanCache.get(projectPath)
  if (!cached) {
    // 캐시 없으면 다시 스캔
    const parseResult = await parseProjectEnvFiles(projectPath)
    const scanResult = detectServices(parseResult.variables)
    const rawCredentials = new Map<ExtendedServiceType, Record<string, string>>()
    for (const service of scanResult.services) {
      rawCredentials.set(service.type, { ...service.credentials })
    }
    cached = { ...scanResult, rawCredentials }
    scanCache.set(projectPath, cached)
  }

  for (const serviceRequest of request.services) {
    const credentials = cached.rawCredentials.get(serviceRequest.type)
    if (!credentials) {
      result.errors.push({
        type: serviceRequest.type,
        error: 'Service not found in scan results',
      })
      result.skipped++
      continue
    }

    try {
      // Integration Hub 타입으로 매핑
      const hubType = mapToIntegrationHubType(serviceRequest.type) as ServiceType

      // custom 타입인 경우 원본 타입을 metadata에 저장
      const metadata =
        hubType === 'custom'
          ? { originalType: serviceRequest.type }
          : undefined

      // 계정 생성
      const account = await createServiceAccount(
        hubType,
        serviceRequest.name,
        credentials,
        metadata
      )

      result.created++
      result.accounts.push({
        id: account.id,
        type: hubType,
        name: serviceRequest.name,
      })
    } catch (error) {
      result.errors.push({
        type: serviceRequest.type,
        error: (error as Error).message,
      })
      result.skipped++
    }
  }

  // 캐시 정리
  scanCache.delete(projectPath)

  return result
}

/**
 * 캐시 정리
 */
export function clearScanCache(projectPath?: string): void {
  if (projectPath) {
    scanCache.delete(projectPath)
  } else {
    scanCache.clear()
  }
}

// =============================================
// .env 파일 목록 조회
// =============================================

/**
 * 프로젝트의 .env 파일 목록과 정보 조회
 */
export async function listEnvFiles(projectPath: string): Promise<EnvFileInfo[]> {
  return getEnvFileInfos(projectPath)
}
