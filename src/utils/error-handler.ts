/**
 * Error Handler Utility
 *
 * 중앙화된 에러 처리 및 사용자 친화적 에러 메시지 변환
 */

import { toast } from 'sonner'

// =============================================
// 에러 타입 정의
// =============================================

/** 애플리케이션 에러 코드 */
export enum ErrorCode {
  // 네트워크 에러
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',

  // 인증/권한 에러
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  // 요청 에러
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // 서버 에러
  SERVER_ERROR = 'SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // 비즈니스 로직 에러
  PROVIDER_NOT_AVAILABLE = 'PROVIDER_NOT_AVAILABLE',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  EXECUTION_FAILED = 'EXECUTION_FAILED',

  // 기타
  UNKNOWN = 'UNKNOWN',
}

/** 애플리케이션 에러 클래스 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode = ErrorCode.UNKNOWN,
    public details?: unknown,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'AppError'
  }

  /** JSON 직렬화 */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      statusCode: this.statusCode,
    }
  }
}

// =============================================
// 에러 메시지 매핑
// =============================================

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: '네트워크 연결을 확인해주세요.',
  [ErrorCode.TIMEOUT]: '요청 시간이 초과되었습니다. 다시 시도해주세요.',
  [ErrorCode.CONNECTION_REFUSED]: '서버에 연결할 수 없습니다.',

  [ErrorCode.UNAUTHORIZED]: '로그인이 필요합니다.',
  [ErrorCode.FORBIDDEN]: '접근 권한이 없습니다.',
  [ErrorCode.SESSION_EXPIRED]: '세션이 만료되었습니다. 다시 로그인해주세요.',

  [ErrorCode.BAD_REQUEST]: '잘못된 요청입니다.',
  [ErrorCode.NOT_FOUND]: '요청한 리소스를 찾을 수 없습니다.',
  [ErrorCode.VALIDATION_ERROR]: '입력값을 확인해주세요.',

  [ErrorCode.SERVER_ERROR]: '서버 오류가 발생했습니다.',
  [ErrorCode.SERVICE_UNAVAILABLE]: '서비스를 일시적으로 사용할 수 없습니다.',

  [ErrorCode.PROVIDER_NOT_AVAILABLE]: 'AI Provider를 사용할 수 없습니다.',
  [ErrorCode.TASK_NOT_FOUND]: '태스크를 찾을 수 없습니다.',
  [ErrorCode.PROJECT_NOT_FOUND]: '프로젝트를 찾을 수 없습니다.',
  [ErrorCode.EXECUTION_FAILED]: '실행에 실패했습니다.',

  [ErrorCode.UNKNOWN]: '알 수 없는 오류가 발생했습니다.',
}

// =============================================
// 에러 변환 함수
// =============================================

/**
 * HTTP 상태 코드를 ErrorCode로 변환
 */
export function httpStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.BAD_REQUEST
    case 401:
      return ErrorCode.UNAUTHORIZED
    case 403:
      return ErrorCode.FORBIDDEN
    case 404:
      return ErrorCode.NOT_FOUND
    case 408:
      return ErrorCode.TIMEOUT
    case 422:
      return ErrorCode.VALIDATION_ERROR
    case 500:
      return ErrorCode.SERVER_ERROR
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE
    default:
      return status >= 500 ? ErrorCode.SERVER_ERROR : ErrorCode.UNKNOWN
  }
}

/**
 * 에러 객체를 AppError로 변환
 */
export function toAppError(error: unknown): AppError {
  // 이미 AppError인 경우
  if (error instanceof AppError) {
    return error
  }

  // API 에러 (src/api/client.ts의 ApiError)
  if (error instanceof Error && error.name === 'ApiError') {
    const apiError = error as Error & { status?: number; code?: string; details?: unknown }
    return new AppError(
      error.message,
      apiError.code ? (apiError.code as ErrorCode) : httpStatusToErrorCode(apiError.status || 0),
      apiError.details,
      apiError.status
    )
  }

  // 일반 Error
  if (error instanceof Error) {
    // 네트워크 에러 감지
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return new AppError(error.message, ErrorCode.NETWORK_ERROR)
    }
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return new AppError(error.message, ErrorCode.TIMEOUT)
    }
    return new AppError(error.message)
  }

  // 문자열
  if (typeof error === 'string') {
    return new AppError(error)
  }

  // 기타 객체
  return new AppError(String(error))
}

/**
 * 사용자 친화적 에러 메시지 반환
 */
export function getErrorMessage(error: unknown): string {
  const appError = toAppError(error)

  // 커스텀 메시지가 있고 의미있는 경우
  if (appError.message && appError.message !== 'Unknown error') {
    return appError.message
  }

  // 코드 기반 메시지
  return ERROR_MESSAGES[appError.code] || ERROR_MESSAGES[ErrorCode.UNKNOWN]
}

// =============================================
// 에러 핸들링 함수
// =============================================

export interface HandleErrorOptions {
  /** 토스트 알림 표시 여부 */
  showToast?: boolean
  /** 콘솔 로깅 여부 */
  logToConsole?: boolean
  /** 커스텀 에러 메시지 */
  customMessage?: string
  /** 컨텍스트 정보 (로깅용) */
  context?: string
}

/**
 * 에러 핸들링 유틸리티
 */
export function handleError(
  error: unknown,
  options: HandleErrorOptions = {}
): AppError {
  const {
    showToast = true,
    logToConsole = true,
    customMessage,
    context,
  } = options

  const appError = toAppError(error)
  const message = customMessage || getErrorMessage(appError)

  // 콘솔 로깅
  if (logToConsole) {
    const prefix = context ? `[${context}]` : '[Error]'
    console.error(`${prefix}`, {
      message: appError.message,
      code: appError.code,
      details: appError.details,
      statusCode: appError.statusCode,
    })
  }

  // 토스트 알림
  if (showToast) {
    toast.error(message)
  }

  return appError
}

// =============================================
// React Query 에러 핸들러
// =============================================

/**
 * React Query onError 콜백용 핸들러
 */
export function createQueryErrorHandler(context: string) {
  return (error: Error) => {
    handleError(error, {
      context,
      showToast: true,
    })
  }
}

/**
 * React Query 전역 에러 핸들러
 */
export function globalQueryErrorHandler(error: unknown) {
  handleError(error, {
    context: 'Query',
    showToast: true,
  })
}

/**
 * React Query 뮤테이션 에러 핸들러
 */
export function globalMutationErrorHandler(error: unknown) {
  handleError(error, {
    context: 'Mutation',
    showToast: true,
  })
}

// =============================================
// 에러 경계 유틸리티
// =============================================

/**
 * 에러 정보 추출 (Error Boundary용)
 */
export function extractErrorInfo(error: unknown): {
  title: string
  message: string
  stack?: string
} {
  const appError = toAppError(error)

  return {
    title: appError.code !== ErrorCode.UNKNOWN
      ? ERROR_MESSAGES[appError.code].split('.')[0]
      : '오류 발생',
    message: getErrorMessage(appError),
    stack: appError.stack,
  }
}

/**
 * 에러 재시도 가능 여부 확인
 */
export function isRetryableError(error: unknown): boolean {
  const appError = toAppError(error)

  const retryableCodes: ErrorCode[] = [
    ErrorCode.NETWORK_ERROR,
    ErrorCode.TIMEOUT,
    ErrorCode.CONNECTION_REFUSED,
    ErrorCode.SERVER_ERROR,
    ErrorCode.SERVICE_UNAVAILABLE,
  ]

  return retryableCodes.includes(appError.code)
}
