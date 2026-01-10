/**
 * Slack Notification Service
 *
 * Slack Incoming Webhook을 통한 알림 발송
 * - Block Kit 메시지 빌더
 * - 심각도별 색상
 * - 채널 라우팅 (#zellyy-alerts, #jayoo-alerts)
 * - Rate limiting (1 msg/sec)
 */

import { getSqlite } from '../tasks/db/client.js'
import { safeDecrypt } from '../utils/crypto.js'
import type { AlertSeverity, AlertSource } from '../tasks/db/schema.js'

// =============================================
// Types
// =============================================

interface SlackNotificationParams {
  alertId: string
  source: AlertSource
  severity: AlertSeverity
  projectName: string
  title: string
  message: string
  externalUrl?: string
}

interface SlackBlock {
  type: string
  text?: {
    type: string
    text: string
    emoji?: boolean
  }
  elements?: Array<{
    type: string
    text?: string | { type: string; text: string; emoji?: boolean }
    url?: string
    action_id?: string
  }>
  accessory?: {
    type: string
    text: { type: string; text: string; emoji?: boolean }
    url?: string
    action_id?: string
  }
}

interface SlackMessage {
  channel?: string
  username?: string
  icon_emoji?: string
  attachments?: Array<{
    color: string
    blocks: SlackBlock[]
  }>
  blocks?: SlackBlock[]
}

interface NotificationConfigRow {
  id: string
  slack_webhook_url: string | null
  slack_channel: string | null
  notification_level: string
  enabled: boolean
}

// =============================================
// Constants
// =============================================

// 심각도별 색상
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: '#FF0000', // 빨강
  warning: '#FFA500',  // 주황
  info: '#0000FF',     // 파랑
}

// 심각도별 이모지
const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: ':red_circle:',
  warning: ':warning:',
  info: ':information_source:',
}

// 소스별 이모지
const SOURCE_EMOJI: Record<AlertSource, string> = {
  github: ':github:',
  vercel: ':vercel:',
  sentry: ':sentry:',
  supabase: ':supabase:',
  custom: ':bell:',
}

// 젤리 프로젝트 목록
const ZELLY_PROJECTS = ['zellyy-money', 'zellyy-admin', 'zyflow']

// Rate limiting
let lastSentTime = 0
const RATE_LIMIT_MS = 1000 // 1초에 1개

// =============================================
// Helper Functions
// =============================================

/**
 * 프로젝트 그룹 판별
 */
function getProjectGroup(projectName: string): 'zellyy' | 'jayoo' {
  return ZELLY_PROJECTS.some(p =>
    projectName.toLowerCase().includes(p.toLowerCase())
  )
    ? 'zellyy'
    : 'jayoo'
}

/**
 * 채널 결정
 */
function getChannel(projectName: string, isAutoFix = false): string {
  const group = getProjectGroup(projectName)
  const suffix = isAutoFix ? '-auto-fix' : '-alerts'
  return `#${group}${suffix}`
}

/**
 * Notification config 조회
 */
function getNotificationConfig(): NotificationConfigRow | null {
  try {
    const sqlite = getSqlite()
    const config = sqlite
      .prepare('SELECT * FROM notification_config WHERE id = ?')
      .get('default') as NotificationConfigRow | undefined

    return config || null
  } catch {
    return null
  }
}

/**
 * Rate limiting 대기
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastSentTime

  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed))
  }

  lastSentTime = Date.now()
}

// =============================================
// Message Builder
// =============================================

/**
 * Slack Block Kit 메시지 빌드
 */
function buildSlackMessage(params: SlackNotificationParams): SlackMessage {
  const { alertId, source, severity, projectName, title, message, externalUrl } = params

  const blocks: SlackBlock[] = [
    // 헤더
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${SEVERITY_EMOJI[severity]} *${title}*`,
      },
    },
    // 상세 정보
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*Project:* ${projectName}`,
          `*Source:* ${source}`,
          `*Severity:* ${severity}`,
          message ? `\n${message}` : '',
        ].filter(Boolean).join('\n'),
      },
    },
  ]

  // 외부 링크 버튼
  if (externalUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ' ', // 빈 텍스트 (accessory만 사용)
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Details',
          emoji: true,
        },
        url: externalUrl,
        action_id: `view_${alertId}`,
      },
    })
  }

  // 컨텍스트 (타임스탬프)
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Alert ID: \`${alertId.substring(0, 8)}\` | ${new Date().toISOString()}`,
      },
    ],
  })

  return {
    username: 'ZyFlow Alerts',
    icon_emoji: ':robot_face:',
    attachments: [
      {
        color: SEVERITY_COLORS[severity],
        blocks,
      },
    ],
  }
}

/**
 * Auto-fix 결과 메시지 빌드
 */
export function buildAutoFixMessage(params: {
  alertId: string
  projectName: string
  status: 'started' | 'success' | 'failed'
  prUrl?: string
  error?: string
}): SlackMessage {
  const { alertId, projectName, status, prUrl, error } = params

  const statusEmoji: Record<string, string> = {
    started: ':hourglass_flowing_sand:',
    success: ':white_check_mark:',
    failed: ':x:',
  }

  const statusText: Record<string, string> = {
    started: '자동 수정 시작',
    success: '자동 수정 완료',
    failed: '자동 수정 실패',
  }

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji[status]} *${statusText[status]}*`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Project:* ${projectName}\n*Alert:* \`${alertId.substring(0, 8)}\``,
      },
    },
  ]

  if (prUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*PR:* <${prUrl}|View Pull Request>`,
      },
    })
  }

  if (error) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Error:* ${error}`,
      },
    })
  }

  const color = status === 'success' ? '#00FF00' : status === 'failed' ? '#FF0000' : '#FFA500'

  return {
    username: 'ZyFlow Auto-Fix',
    icon_emoji: ':wrench:',
    attachments: [
      {
        color,
        blocks,
      },
    ],
  }
}

// =============================================
// Main Functions
// =============================================

/**
 * Slack 알림 발송
 */
export async function sendSlackNotification(
  params: SlackNotificationParams
): Promise<boolean> {
  const config = getNotificationConfig()

  // 설정 확인
  if (!config || !config.enabled) {
    console.log('[Slack] Notifications disabled')
    return false
  }

  if (!config.slack_webhook_url) {
    console.log('[Slack] Webhook URL not configured')
    return false
  }

  // 알림 레벨 확인
  const levelPriority: Record<string, number> = {
    all: 0,
    warning: 1,
    critical: 2,
  }
  const severityPriority: Record<AlertSeverity, number> = {
    info: 0,
    warning: 1,
    critical: 2,
  }

  const configLevel = config.notification_level || 'all'
  if (severityPriority[params.severity] < levelPriority[configLevel]) {
    console.log(`[Slack] Notification filtered: ${params.severity} < ${configLevel}`)
    return false
  }

  // Rate limiting
  await waitForRateLimit()

  // Webhook URL 복호화
  const webhookUrl = safeDecrypt(config.slack_webhook_url)

  // 메시지 빌드
  const message = buildSlackMessage(params)

  // 채널 오버라이드
  if (config.slack_channel) {
    message.channel = config.slack_channel
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`[Slack] Failed to send notification: ${response.status} ${text}`)
      return false
    }

    console.log(`[Slack] Notification sent for alert ${params.alertId}`)
    return true
  } catch (error) {
    console.error('[Slack] Error sending notification:', error)
    return false
  }
}

/**
 * Auto-fix 알림 발송
 */
export async function sendAutoFixNotification(params: {
  alertId: string
  projectName: string
  status: 'started' | 'success' | 'failed'
  prUrl?: string
  error?: string
}): Promise<boolean> {
  const config = getNotificationConfig()

  if (!config || !config.enabled || !config.slack_webhook_url) {
    return false
  }

  await waitForRateLimit()

  const webhookUrl = safeDecrypt(config.slack_webhook_url)
  const message = buildAutoFixMessage(params)

  // Auto-fix 채널로 라우팅
  message.channel = getChannel(params.projectName, true)

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    return response.ok
  } catch (error) {
    console.error('[Slack] Error sending auto-fix notification:', error)
    return false
  }
}

/**
 * 테스트 알림 발송
 */
export async function sendTestNotification(webhookUrl: string): Promise<{
  success: boolean
  error?: string
}> {
  const testMessage: SlackMessage = {
    username: 'ZyFlow Test',
    icon_emoji: ':test_tube:',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':white_check_mark: *ZyFlow Slack 연동 테스트 성공!*\n\n이 메시지가 보이면 Slack 알림이 정상적으로 설정된 것입니다.',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sent at ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMessage),
    })

    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: `${response.status}: ${text}` }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
