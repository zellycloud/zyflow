/**
 * Webhook Signature Verification Utilities
 *
 * 각 서비스별 Webhook 서명 검증 로직
 * - GitHub: HMAC-SHA256 with X-Hub-Signature-256
 * - Vercel: HMAC-SHA1 with x-vercel-signature
 * - Sentry: HMAC-SHA256 with Sentry-Hook-Signature
 * - Supabase: Custom signature
 */

import { createHmac, timingSafeEqual } from 'crypto'

// 프로덕션 환경 체크
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

// 환경변수에서 시크릿 로드
function getWebhookSecret(service: string): string | null {
  const envKey = `${service.toUpperCase()}_WEBHOOK_SECRET`
  return process.env[envKey] || null
}

/**
 * GitHub Webhook 서명 검증
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGitHubSignature(
  payload: unknown,
  signature: string | undefined
): boolean {
  const secret = getWebhookSecret('GITHUB')

  // 시크릿이 설정되지 않은 경우
  if (!secret) {
    if (isProduction()) {
      console.error('[Webhook] GitHub secret not configured in production - rejecting request')
      return false
    }
    console.warn('[Webhook] GitHub secret not configured, skipping verification (dev mode)')
    return true
  }

  if (!signature) {
    return false
  }

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const expectedSignature = 'sha256=' + createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch {
    return false
  }
}

/**
 * Vercel Webhook 서명 검증
 * @see https://vercel.com/docs/observability/webhooks/webhooks-api#securing-webhooks
 */
export function verifyVercelSignature(
  payload: unknown,
  signature: string | undefined
): boolean {
  const secret = getWebhookSecret('VERCEL')

  if (!secret) {
    if (isProduction()) {
      console.error('[Webhook] Vercel secret not configured in production - rejecting request')
      return false
    }
    console.warn('[Webhook] Vercel secret not configured, skipping verification (dev mode)')
    return true
  }

  if (!signature) {
    return false
  }

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const expectedSignature = createHmac('sha1', secret)
    .update(body)
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch {
    return false
  }
}

/**
 * Sentry Webhook 서명 검증
 * @see https://docs.sentry.io/product/integrations/integration-platform/webhooks/
 */
export function verifySentrySignature(
  payload: unknown,
  signature: string | undefined
): boolean {
  const secret = getWebhookSecret('SENTRY')

  if (!secret) {
    if (isProduction()) {
      console.error('[Webhook] Sentry secret not configured in production - rejecting request')
      return false
    }
    console.warn('[Webhook] Sentry secret not configured, skipping verification (dev mode)')
    return true
  }

  if (!signature) {
    return false
  }

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch {
    return false
  }
}

/**
 * Supabase Webhook 서명 검증
 * Supabase는 공식 Webhook 서명 메커니즘이 없으므로 커스텀 구현
 */
export function verifySupabaseSignature(
  payload: unknown,
  signature: string | undefined
): boolean {
  const secret = getWebhookSecret('SUPABASE')

  if (!secret) {
    if (isProduction()) {
      console.error('[Webhook] Supabase secret not configured in production - rejecting request')
      return false
    }
    console.warn('[Webhook] Supabase secret not configured, skipping verification (dev mode)')
    return true
  }

  if (!signature) {
    return false
  }

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch {
    return false
  }
}

/**
 * 커스텀 Webhook 서명 검증
 */
export function verifyCustomSignature(
  payload: unknown,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false
  }

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch {
    return false
  }
}

/**
 * 서명 생성 (테스트용)
 */
export function generateSignature(
  payload: unknown,
  secret: string,
  algorithm: 'sha256' | 'sha1' = 'sha256'
): string {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return createHmac(algorithm, secret)
    .update(body)
    .digest('hex')
}
