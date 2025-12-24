/**
 * Logger Utility
 *
 * 구조화된 로깅 시스템
 * - 레벨별 로깅 (debug, info, warn, error)
 * - 컨텍스트/모듈별 로깅
 * - 개발/프로덕션 환경 구분
 */

// =============================================
// 타입 정의
// =============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  message: string
  module?: string
  timestamp: string
  data?: unknown
}

export interface LoggerOptions {
  /** 로거 모듈 이름 */
  module?: string
  /** 최소 로그 레벨 */
  minLevel?: LogLevel
  /** 타임스탬프 포함 여부 */
  includeTimestamp?: boolean
}

// =============================================
// 상수
// =============================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '#888888',
  info: '#2196F3',
  warn: '#FF9800',
  error: '#F44336',
}

const LOG_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
}

// =============================================
// 환경 설정
// =============================================

const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV !== 'production'
const DEFAULT_MIN_LEVEL: LogLevel = isDev ? 'debug' : 'warn'

// =============================================
// Logger 클래스
// =============================================

class Logger {
  private module?: string
  private minLevel: LogLevel
  private includeTimestamp: boolean

  constructor(options: LoggerOptions = {}) {
    this.module = options.module
    this.minLevel = options.minLevel ?? DEFAULT_MIN_LEVEL
    this.includeTimestamp = options.includeTimestamp ?? true
  }

  /**
   * 로그 레벨이 활성화되어 있는지 확인
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel]
  }

  /**
   * 타임스탬프 생성
   */
  private getTimestamp(): string {
    return new Date().toISOString()
  }

  /**
   * 포맷된 로그 출력
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return

    const icon = LOG_ICONS[level]
    const color = LOG_COLORS[level]
    const timestamp = this.includeTimestamp ? `[${this.getTimestamp()}]` : ''
    const modulePrefix = this.module ? `[${this.module}]` : ''
    const prefix = `${icon} ${timestamp}${modulePrefix}`.trim()

    // 브라우저 환경
    if (typeof window !== 'undefined') {
      const style = `color: ${color}; font-weight: bold`

      if (data !== undefined) {
        console.groupCollapsed(`%c${prefix} ${message}`, style)
        console.log('Data:', data)
        console.groupEnd()
      } else {
        console.log(`%c${prefix} ${message}`, style)
      }
    }
    // Node.js 환경
    else {
      const logFn = level === 'error' ? console.error :
                    level === 'warn' ? console.warn :
                    console.log

      if (data !== undefined) {
        logFn(`${prefix} ${message}`, data)
      } else {
        logFn(`${prefix} ${message}`)
      }
    }
  }

  /**
   * Debug 레벨 로그
   */
  debug(message: string, data?: unknown): void {
    this.log('debug', message, data)
  }

  /**
   * Info 레벨 로그
   */
  info(message: string, data?: unknown): void {
    this.log('info', message, data)
  }

  /**
   * Warn 레벨 로그
   */
  warn(message: string, data?: unknown): void {
    this.log('warn', message, data)
  }

  /**
   * Error 레벨 로그
   */
  error(message: string, data?: unknown): void {
    this.log('error', message, data)
  }

  /**
   * 성능 측정 시작
   */
  time(label: string): void {
    if (this.shouldLog('debug')) {
      console.time(`${this.module ? `[${this.module}] ` : ''}${label}`)
    }
  }

  /**
   * 성능 측정 종료
   */
  timeEnd(label: string): void {
    if (this.shouldLog('debug')) {
      console.timeEnd(`${this.module ? `[${this.module}] ` : ''}${label}`)
    }
  }

  /**
   * 그룹 시작
   */
  group(label: string): void {
    if (this.shouldLog('debug')) {
      console.group(`${LOG_ICONS.debug} ${this.module ? `[${this.module}] ` : ''}${label}`)
    }
  }

  /**
   * 그룹 종료
   */
  groupEnd(): void {
    if (this.shouldLog('debug')) {
      console.groupEnd()
    }
  }

  /**
   * 테이블 출력
   */
  table(data: unknown): void {
    if (this.shouldLog('debug')) {
      console.table(data)
    }
  }

  /**
   * 자식 로거 생성
   */
  child(childModule: string): Logger {
    const module = this.module
      ? `${this.module}:${childModule}`
      : childModule

    return new Logger({
      module,
      minLevel: this.minLevel,
      includeTimestamp: this.includeTimestamp,
    })
  }
}

// =============================================
// 팩토리 함수
// =============================================

/**
 * 모듈별 로거 생성
 */
export function createLogger(module: string, options?: Omit<LoggerOptions, 'module'>): Logger {
  return new Logger({ module, ...options })
}

// =============================================
// 기본 로거 인스턴스
// =============================================

/** 기본 로거 */
export const logger = new Logger()

// =============================================
// 모듈별 로거 프리셋
// =============================================

/** API 로거 */
export const apiLogger = createLogger('API')

/** UI 로거 */
export const uiLogger = createLogger('UI')

/** Hook 로거 */
export const hookLogger = createLogger('Hook')

/** Store 로거 */
export const storeLogger = createLogger('Store')

/** WebSocket 로거 */
export const wsLogger = createLogger('WS')

// =============================================
// 개발용 유틸리티
// =============================================

/**
 * 개발 환경에서만 실행
 */
export function devOnly(fn: () => void): void {
  if (isDev) {
    fn()
  }
}

/**
 * 개발 환경에서만 로그 출력
 */
export function devLog(message: string, data?: unknown): void {
  if (isDev) {
    logger.debug(message, data)
  }
}

export default logger
