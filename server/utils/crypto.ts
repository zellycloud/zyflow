/**
 * Cryptography Utilities
 *
 * 민감한 데이터 암호화/복호화
 * - AES-256-GCM 암호화
 * - 안전한 키 파생 (PBKDF2)
 * - Slack URL, Webhook Secret 등 암호화
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
  createHash,
} from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits
const SALT_LENGTH = 32
const PBKDF2_ITERATIONS = 100000

/**
 * 마스터 키 가져오기
 * 환경변수 SECRET_KEY 또는 기본값 사용
 */
function getMasterKey(): string {
  const key = process.env.SECRET_KEY
  if (!key) {
    console.warn('[Crypto] SECRET_KEY not set, using default (insecure!)')
    return 'zyflow-default-secret-key-change-in-production'
  }
  return key
}

/**
 * 마스터 키에서 암호화 키 파생
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
}

/**
 * 문자열 암호화
 * @returns Base64 인코딩된 암호문 (salt:iv:authTag:ciphertext)
 */
export function encrypt(plaintext: string): string {
  const masterKey = getMasterKey()
  const salt = randomBytes(SALT_LENGTH)
  const key = deriveKey(masterKey, salt)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  // salt:iv:authTag:ciphertext 형식으로 조합
  const combined = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, 'hex'),
  ])

  return combined.toString('base64')
}

/**
 * 문자열 복호화
 * @param ciphertext Base64 인코딩된 암호문
 */
export function decrypt(ciphertext: string): string {
  const masterKey = getMasterKey()
  const combined = Buffer.from(ciphertext, 'base64')

  // 구성요소 분리
  const salt = combined.subarray(0, SALT_LENGTH)
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  )
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH)

  const key = deriveKey(masterKey, salt)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * 암호화 여부 확인
 * 암호화된 데이터는 Base64 형식이고 특정 길이 이상
 */
export function isEncrypted(value: string): boolean {
  try {
    const decoded = Buffer.from(value, 'base64')
    // 최소 길이: salt(32) + iv(16) + authTag(16) + 최소 1바이트
    return decoded.length >= SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1
  } catch {
    return false
  }
}

/**
 * 안전하게 복호화 (암호화되지 않은 값은 그대로 반환)
 */
export function safeDecrypt(value: string): string {
  if (!value) return value
  if (!isEncrypted(value)) return value

  try {
    return decrypt(value)
  } catch {
    // 복호화 실패 시 원본 반환 (이전 평문 데이터 호환)
    return value
  }
}

/**
 * 값 마스킹 (UI 표시용)
 * 예: "https://hooks.slack.com/xxx" → "https://hooks.slack.com/***"
 */
export function maskValue(value: string, visibleChars = 10): string {
  if (!value) return ''
  if (value.length <= visibleChars) return '*'.repeat(value.length)

  const prefix = value.substring(0, visibleChars)
  const masked = '*'.repeat(Math.min(value.length - visibleChars, 20))
  return prefix + masked
}

/**
 * URL 마스킹 (도메인은 보이고 경로는 마스킹)
 */
export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/')
    const maskedPath = pathParts
      .map((part, i) => (i === 0 || part.length < 4 ? part : '***'))
      .join('/')
    return `${parsed.protocol}//${parsed.host}${maskedPath}`
  } catch {
    return maskValue(url)
  }
}

/**
 * 해시 생성 (비가역적, 비교용)
 */
export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * 랜덤 시크릿 생성
 */
export function generateSecret(length = 32): string {
  return randomBytes(length).toString('hex')
}

/**
 * API 키 형식의 시크릿 생성
 * 예: zf_live_xxxx...
 */
export function generateApiKey(prefix = 'zf'): string {
  const timestamp = Date.now().toString(36)
  const random = randomBytes(16).toString('hex')
  return `${prefix}_${timestamp}_${random}`
}
