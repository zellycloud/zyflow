/**
 * 서비스별 환경변수 패턴 정의 및 매칭 로직
 * 환경변수에서 서비스를 자동 감지하고 credential을 추출
 */

import type { EnvVariable } from './env-parser.js'

// =============================================
// 확장된 서비스 타입 정의
// =============================================

export type ExtendedServiceType =
  // 기존 타입
  | 'github'
  | 'supabase'
  | 'vercel'
  | 'sentry'
  // 클라우드 인프라
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'cloudflare'
  // AI/ML
  | 'openai'
  | 'anthropic'
  | 'cohere'
  | 'replicate'
  | 'huggingface'
  // 데이터베이스
  | 'postgresql'
  | 'mysql'
  | 'mongodb'
  | 'redis'
  | 'planetscale'
  | 'neon'
  | 'upstash'
  // BaaS
  | 'firebase'
  | 'appwrite'
  | 'pocketbase'
  // 결제
  | 'stripe'
  | 'paypal'
  | 'paddle'
  // 이메일
  | 'sendgrid'
  | 'resend'
  | 'postmark'
  | 'mailgun'
  // 인증
  | 'clerk'
  | 'auth0'
  | 'nextauth'
  // 메시징
  | 'twilio'
  | 'vonage'
  // 스토리지
  | 's3'
  | 'r2'
  | 'uploadthing'
  // 검색
  | 'algolia'
  | 'typesense'
  | 'meilisearch'
  // 기타
  | 'google'
  | 'custom'

// =============================================
// 서비스별 패턴 정의
// =============================================

interface ServicePattern {
  type: ExtendedServiceType
  displayName: string
  patterns: Array<{
    envKey: string | RegExp
    credentialKey: string
    required?: boolean
    transform?: (value: string) => string
  }>
  // URL 스키마로 타입 추론 (DATABASE_URL 등)
  urlSchemas?: string[]
  // 필수 credential 키
  requiredCredentials?: string[]
}

// 접두사 정규화 (NEXT_PUBLIC_, VITE_, NUXT_ 등 제거)
function normalizeEnvKey(key: string): string {
  return key
    .replace(/^NEXT_PUBLIC_/, '')
    .replace(/^VITE_/, '')
    .replace(/^NUXT_/, '')
    .replace(/^REACT_APP_/, '')
    .replace(/^VUE_APP_/, '')
}

export const SERVICE_PATTERNS: ServicePattern[] = [
  // =============================================
  // Git & 버전 관리
  // =============================================
  {
    type: 'github',
    displayName: 'GitHub',
    patterns: [
      { envKey: /^(GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)$/, credentialKey: 'token', required: true },
      { envKey: /^(GITHUB_USERNAME|GH_USER)$/, credentialKey: 'username' },
      { envKey: /^(GITHUB_EMAIL|GH_EMAIL)$/, credentialKey: 'email' },
    ],
    requiredCredentials: ['token'],
  },

  // =============================================
  // BaaS (Backend as a Service)
  // =============================================
  {
    type: 'supabase',
    displayName: 'Supabase',
    patterns: [
      { envKey: /^SUPABASE_URL$/, credentialKey: 'projectUrl', required: true },
      { envKey: /^SUPABASE_ANON_KEY$/, credentialKey: 'anonKey', required: true },
      { envKey: /^SUPABASE_SERVICE_ROLE_KEY$/, credentialKey: 'serviceRoleKey' },
    ],
    requiredCredentials: ['projectUrl', 'anonKey'],
  },
  {
    type: 'firebase',
    displayName: 'Firebase',
    patterns: [
      { envKey: /^FIREBASE_API_KEY$/, credentialKey: 'apiKey', required: true },
      { envKey: /^FIREBASE_AUTH_DOMAIN$/, credentialKey: 'authDomain' },
      { envKey: /^FIREBASE_PROJECT_ID$/, credentialKey: 'projectId' },
      { envKey: /^FIREBASE_STORAGE_BUCKET$/, credentialKey: 'storageBucket' },
      { envKey: /^FIREBASE_MESSAGING_SENDER_ID$/, credentialKey: 'messagingSenderId' },
      { envKey: /^FIREBASE_APP_ID$/, credentialKey: 'appId' },
    ],
    requiredCredentials: ['apiKey'],
  },
  {
    type: 'appwrite',
    displayName: 'Appwrite',
    patterns: [
      { envKey: /^APPWRITE_ENDPOINT$/, credentialKey: 'endpoint', required: true },
      { envKey: /^APPWRITE_PROJECT(_ID)?$/, credentialKey: 'projectId', required: true },
      { envKey: /^APPWRITE_API_KEY$/, credentialKey: 'apiKey' },
    ],
    requiredCredentials: ['endpoint', 'projectId'],
  },

  // =============================================
  // 배포 플랫폼
  // =============================================
  {
    type: 'vercel',
    displayName: 'Vercel',
    patterns: [
      { envKey: /^VERCEL_TOKEN$/, credentialKey: 'token', required: true },
      { envKey: /^VERCEL_(TEAM_ID|ORG_ID)$/, credentialKey: 'teamId' },
    ],
    requiredCredentials: ['token'],
  },
  {
    type: 'cloudflare',
    displayName: 'Cloudflare',
    patterns: [
      { envKey: /^CLOUDFLARE_API_TOKEN$/, credentialKey: 'apiToken', required: true },
      { envKey: /^CLOUDFLARE_ACCOUNT_ID$/, credentialKey: 'accountId' },
      { envKey: /^CLOUDFLARE_ZONE_ID$/, credentialKey: 'zoneId' },
    ],
    requiredCredentials: ['apiToken'],
  },

  // =============================================
  // 클라우드 인프라
  // =============================================
  {
    type: 'aws',
    displayName: 'AWS',
    patterns: [
      { envKey: /^AWS_ACCESS_KEY_ID$/, credentialKey: 'accessKeyId', required: true },
      { envKey: /^AWS_SECRET_ACCESS_KEY$/, credentialKey: 'secretAccessKey', required: true },
      { envKey: /^AWS_REGION$/, credentialKey: 'region' },
      { envKey: /^AWS_SESSION_TOKEN$/, credentialKey: 'sessionToken' },
    ],
    requiredCredentials: ['accessKeyId', 'secretAccessKey'],
  },
  {
    type: 'gcp',
    displayName: 'Google Cloud',
    patterns: [
      { envKey: /^GOOGLE_CLOUD_PROJECT(_ID)?$/, credentialKey: 'projectId', required: true },
      { envKey: /^GOOGLE_APPLICATION_CREDENTIALS$/, credentialKey: 'credentialsPath' },
      { envKey: /^GOOGLE_CLOUD_REGION$/, credentialKey: 'region' },
    ],
    requiredCredentials: ['projectId'],
  },
  {
    type: 'azure',
    displayName: 'Azure',
    patterns: [
      { envKey: /^AZURE_CLIENT_ID$/, credentialKey: 'clientId', required: true },
      { envKey: /^AZURE_CLIENT_SECRET$/, credentialKey: 'clientSecret' },
      { envKey: /^AZURE_TENANT_ID$/, credentialKey: 'tenantId' },
      { envKey: /^AZURE_SUBSCRIPTION_ID$/, credentialKey: 'subscriptionId' },
    ],
    requiredCredentials: ['clientId'],
  },

  // =============================================
  // AI/ML
  // =============================================
  {
    type: 'openai',
    displayName: 'OpenAI',
    patterns: [
      { envKey: /^OPENAI_API_KEY$/, credentialKey: 'apiKey', required: true },
      { envKey: /^OPENAI_ORG(_ID)?$/, credentialKey: 'orgId' },
    ],
    requiredCredentials: ['apiKey'],
  },
  {
    type: 'anthropic',
    displayName: 'Anthropic',
    patterns: [
      { envKey: /^ANTHROPIC_API_KEY$/, credentialKey: 'apiKey', required: true },
    ],
    requiredCredentials: ['apiKey'],
  },
  {
    type: 'cohere',
    displayName: 'Cohere',
    patterns: [
      { envKey: /^COHERE_API_KEY$/, credentialKey: 'apiKey', required: true },
    ],
    requiredCredentials: ['apiKey'],
  },
  {
    type: 'replicate',
    displayName: 'Replicate',
    patterns: [
      { envKey: /^REPLICATE_API_TOKEN$/, credentialKey: 'apiToken', required: true },
    ],
    requiredCredentials: ['apiToken'],
  },
  {
    type: 'huggingface',
    displayName: 'Hugging Face',
    patterns: [
      { envKey: /^(HUGGINGFACE|HF)_(API_)?TOKEN$/, credentialKey: 'token', required: true },
    ],
    requiredCredentials: ['token'],
  },

  // =============================================
  // 데이터베이스
  // =============================================
  {
    type: 'postgresql',
    displayName: 'PostgreSQL',
    patterns: [
      { envKey: /^(POSTGRES_URL|POSTGRESQL_URL)$/, credentialKey: 'uri', required: true },
    ],
    urlSchemas: ['postgres://', 'postgresql://'],
    requiredCredentials: ['uri'],
  },
  {
    type: 'mysql',
    displayName: 'MySQL',
    patterns: [
      { envKey: /^MYSQL_URL$/, credentialKey: 'uri', required: true },
    ],
    urlSchemas: ['mysql://'],
    requiredCredentials: ['uri'],
  },
  {
    type: 'mongodb',
    displayName: 'MongoDB',
    patterns: [
      { envKey: /^(MONGODB_URI|MONGO_URL)$/, credentialKey: 'uri', required: true },
    ],
    urlSchemas: ['mongodb://', 'mongodb+srv://'],
    requiredCredentials: ['uri'],
  },
  {
    type: 'redis',
    displayName: 'Redis',
    patterns: [
      { envKey: /^REDIS_(URL|URI)$/, credentialKey: 'uri', required: true },
    ],
    urlSchemas: ['redis://', 'rediss://'],
    requiredCredentials: ['uri'],
  },
  {
    type: 'neon',
    displayName: 'Neon',
    patterns: [
      { envKey: /^NEON_DATABASE_URL$/, credentialKey: 'uri', required: true },
    ],
    urlSchemas: ['postgres://ep-'],
    requiredCredentials: ['uri'],
  },
  {
    type: 'planetscale',
    displayName: 'PlanetScale',
    patterns: [
      { envKey: /^PLANETSCALE_DATABASE_URL$/, credentialKey: 'uri', required: true },
    ],
    urlSchemas: ['mysql://aws.connect.psdb.cloud'],
    requiredCredentials: ['uri'],
  },
  {
    type: 'upstash',
    displayName: 'Upstash',
    patterns: [
      { envKey: /^UPSTASH_REDIS_REST_URL$/, credentialKey: 'restUrl', required: true },
      { envKey: /^UPSTASH_REDIS_REST_TOKEN$/, credentialKey: 'restToken', required: true },
    ],
    requiredCredentials: ['restUrl', 'restToken'],
  },

  // =============================================
  // 모니터링
  // =============================================
  {
    type: 'sentry',
    displayName: 'Sentry',
    patterns: [
      { envKey: /^SENTRY_DSN$/, credentialKey: 'dsn', required: true },
      { envKey: /^SENTRY_AUTH_TOKEN$/, credentialKey: 'authToken' },
      { envKey: /^SENTRY_ORG$/, credentialKey: 'orgSlug' },
      { envKey: /^SENTRY_PROJECT$/, credentialKey: 'projectSlug' },
    ],
    requiredCredentials: ['dsn'],
  },

  // =============================================
  // 결제
  // =============================================
  {
    type: 'stripe',
    displayName: 'Stripe',
    patterns: [
      { envKey: /^STRIPE_(SECRET_KEY|API_KEY)$/, credentialKey: 'secretKey', required: true },
      { envKey: /^STRIPE_PUBLISHABLE_KEY$/, credentialKey: 'publishableKey' },
      { envKey: /^STRIPE_WEBHOOK_SECRET$/, credentialKey: 'webhookSecret' },
    ],
    requiredCredentials: ['secretKey'],
  },
  {
    type: 'paypal',
    displayName: 'PayPal',
    patterns: [
      { envKey: /^PAYPAL_CLIENT_ID$/, credentialKey: 'clientId', required: true },
      { envKey: /^PAYPAL_CLIENT_SECRET$/, credentialKey: 'clientSecret' },
    ],
    requiredCredentials: ['clientId'],
  },
  {
    type: 'paddle',
    displayName: 'Paddle',
    patterns: [
      { envKey: /^PADDLE_VENDOR_ID$/, credentialKey: 'vendorId', required: true },
      { envKey: /^PADDLE_API_KEY$/, credentialKey: 'apiKey' },
    ],
    requiredCredentials: ['vendorId'],
  },

  // =============================================
  // 이메일
  // =============================================
  {
    type: 'sendgrid',
    displayName: 'SendGrid',
    patterns: [
      { envKey: /^SENDGRID_API_KEY$/, credentialKey: 'apiKey', required: true },
    ],
    requiredCredentials: ['apiKey'],
  },
  {
    type: 'resend',
    displayName: 'Resend',
    patterns: [
      { envKey: /^RESEND_API_KEY$/, credentialKey: 'apiKey', required: true },
    ],
    requiredCredentials: ['apiKey'],
  },
  {
    type: 'postmark',
    displayName: 'Postmark',
    patterns: [
      { envKey: /^POSTMARK_(API_TOKEN|SERVER_TOKEN)$/, credentialKey: 'apiToken', required: true },
    ],
    requiredCredentials: ['apiToken'],
  },
  {
    type: 'mailgun',
    displayName: 'Mailgun',
    patterns: [
      { envKey: /^MAILGUN_API_KEY$/, credentialKey: 'apiKey', required: true },
      { envKey: /^MAILGUN_DOMAIN$/, credentialKey: 'domain' },
    ],
    requiredCredentials: ['apiKey'],
  },

  // =============================================
  // 인증
  // =============================================
  {
    type: 'clerk',
    displayName: 'Clerk',
    patterns: [
      { envKey: /^CLERK_SECRET_KEY$/, credentialKey: 'secretKey', required: true },
      { envKey: /^CLERK_PUBLISHABLE_KEY$/, credentialKey: 'publishableKey' },
    ],
    requiredCredentials: ['secretKey'],
  },
  {
    type: 'auth0',
    displayName: 'Auth0',
    patterns: [
      { envKey: /^AUTH0_SECRET$/, credentialKey: 'secret', required: true },
      { envKey: /^AUTH0_CLIENT_ID$/, credentialKey: 'clientId' },
      { envKey: /^AUTH0_CLIENT_SECRET$/, credentialKey: 'clientSecret' },
      { envKey: /^AUTH0_ISSUER(_BASE)?_URL$/, credentialKey: 'issuerBaseUrl' },
      { envKey: /^AUTH0_BASE_URL$/, credentialKey: 'baseUrl' },
    ],
    requiredCredentials: ['secret'],
  },
  {
    type: 'nextauth',
    displayName: 'NextAuth',
    patterns: [
      { envKey: /^NEXTAUTH_SECRET$/, credentialKey: 'secret', required: true },
      { envKey: /^NEXTAUTH_URL$/, credentialKey: 'url' },
    ],
    requiredCredentials: ['secret'],
  },

  // =============================================
  // 메시징
  // =============================================
  {
    type: 'twilio',
    displayName: 'Twilio',
    patterns: [
      { envKey: /^TWILIO_ACCOUNT_SID$/, credentialKey: 'accountSid', required: true },
      { envKey: /^TWILIO_AUTH_TOKEN$/, credentialKey: 'authToken', required: true },
    ],
    requiredCredentials: ['accountSid', 'authToken'],
  },
  {
    type: 'vonage',
    displayName: 'Vonage',
    patterns: [
      { envKey: /^VONAGE_API_KEY$/, credentialKey: 'apiKey', required: true },
      { envKey: /^VONAGE_API_SECRET$/, credentialKey: 'apiSecret' },
    ],
    requiredCredentials: ['apiKey'],
  },

  // =============================================
  // 스토리지
  // =============================================
  {
    type: 's3',
    displayName: 'Amazon S3',
    patterns: [
      { envKey: /^S3_BUCKET(_NAME)?$/, credentialKey: 'bucket', required: true },
      { envKey: /^S3_REGION$/, credentialKey: 'region' },
      { envKey: /^S3_ACCESS_KEY(_ID)?$/, credentialKey: 'accessKeyId' },
      { envKey: /^S3_SECRET(_ACCESS)?_KEY$/, credentialKey: 'secretAccessKey' },
    ],
    requiredCredentials: ['bucket'],
  },
  {
    type: 'r2',
    displayName: 'Cloudflare R2',
    patterns: [
      { envKey: /^R2_ACCOUNT_ID$/, credentialKey: 'accountId', required: true },
      { envKey: /^R2_ACCESS_KEY_ID$/, credentialKey: 'accessKeyId' },
      { envKey: /^R2_SECRET_ACCESS_KEY$/, credentialKey: 'secretAccessKey' },
      { envKey: /^R2_BUCKET(_NAME)?$/, credentialKey: 'bucket' },
    ],
    requiredCredentials: ['accountId'],
  },
  {
    type: 'uploadthing',
    displayName: 'UploadThing',
    patterns: [
      { envKey: /^UPLOADTHING_SECRET$/, credentialKey: 'secret', required: true },
      { envKey: /^UPLOADTHING_APP_ID$/, credentialKey: 'appId' },
    ],
    requiredCredentials: ['secret'],
  },

  // =============================================
  // 검색
  // =============================================
  {
    type: 'algolia',
    displayName: 'Algolia',
    patterns: [
      { envKey: /^ALGOLIA_APP_ID$/, credentialKey: 'appId', required: true },
      { envKey: /^ALGOLIA_API_KEY$/, credentialKey: 'apiKey' },
      { envKey: /^ALGOLIA_SEARCH_KEY$/, credentialKey: 'searchKey' },
    ],
    requiredCredentials: ['appId'],
  },
  {
    type: 'typesense',
    displayName: 'Typesense',
    patterns: [
      { envKey: /^TYPESENSE_API_KEY$/, credentialKey: 'apiKey', required: true },
      { envKey: /^TYPESENSE_HOST$/, credentialKey: 'host' },
    ],
    requiredCredentials: ['apiKey'],
  },
  {
    type: 'meilisearch',
    displayName: 'Meilisearch',
    patterns: [
      { envKey: /^MEILI(SEARCH)?_MASTER_KEY$/, credentialKey: 'masterKey', required: true },
      { envKey: /^MEILI(SEARCH)?_HOST$/, credentialKey: 'host' },
    ],
    requiredCredentials: ['masterKey'],
  },

  // =============================================
  // OAuth / Google
  // =============================================
  {
    type: 'google',
    displayName: 'Google OAuth',
    patterns: [
      { envKey: /^GOOGLE_CLIENT_ID$/, credentialKey: 'clientId', required: true },
      { envKey: /^GOOGLE_CLIENT_SECRET$/, credentialKey: 'clientSecret' },
    ],
    requiredCredentials: ['clientId'],
  },
]

// =============================================
// 매칭 결과 타입
// =============================================

export interface DetectedService {
  type: ExtendedServiceType
  displayName: string
  credentials: Record<string, string>
  missingRequired: string[]
  sources: string[] // 어떤 .env 파일에서 왔는지
  isComplete: boolean // 필수 credential 모두 있는지
}

export interface ScanResult {
  services: DetectedService[]
  unmatchedVariables: EnvVariable[]
  files: string[]
}

// =============================================
// 매칭 로직
// =============================================

/**
 * DATABASE_URL 등의 값에서 데이터베이스 타입 추론
 */
function inferDatabaseType(value: string): ExtendedServiceType | null {
  // Neon (postgres://ep-)
  if (value.startsWith('postgres://ep-') || value.includes('neon.tech')) {
    return 'neon'
  }
  // PlanetScale
  if (value.includes('psdb.cloud') || value.includes('planetscale')) {
    return 'planetscale'
  }
  // Supabase
  if (value.includes('supabase.co')) {
    return 'postgresql' // Supabase는 별도로 감지
  }
  // PostgreSQL
  if (value.startsWith('postgres://') || value.startsWith('postgresql://')) {
    return 'postgresql'
  }
  // MySQL
  if (value.startsWith('mysql://')) {
    return 'mysql'
  }
  // MongoDB
  if (value.startsWith('mongodb://') || value.startsWith('mongodb+srv://')) {
    return 'mongodb'
  }
  // Redis
  if (value.startsWith('redis://') || value.startsWith('rediss://')) {
    return 'redis'
  }
  return null
}

/**
 * 환경변수에서 서비스 감지
 */
export function detectServices(variables: EnvVariable[]): ScanResult {
  const serviceMap = new Map<ExtendedServiceType, DetectedService>()
  const matchedKeys = new Set<string>()

  // 각 변수를 정규화된 키로 변환
  const normalizedVars = variables.map((v) => ({
    ...v,
    normalizedKey: normalizeEnvKey(v.key),
  }))

  // DATABASE_URL 특별 처리
  const databaseUrl = normalizedVars.find(
    (v) => v.normalizedKey === 'DATABASE_URL' || v.key === 'DATABASE_URL'
  )
  if (databaseUrl) {
    const dbType = inferDatabaseType(databaseUrl.value)
    if (dbType) {
      const existing = serviceMap.get(dbType) || {
        type: dbType,
        displayName: SERVICE_PATTERNS.find((p) => p.type === dbType)?.displayName || dbType,
        credentials: {},
        missingRequired: [],
        sources: [],
        isComplete: false,
      }
      existing.credentials['uri'] = databaseUrl.value
      if (!existing.sources.includes(databaseUrl.source)) {
        existing.sources.push(databaseUrl.source)
      }
      existing.isComplete = true
      existing.missingRequired = []
      serviceMap.set(dbType, existing)
      matchedKeys.add(databaseUrl.key)
    }
  }

  // 각 서비스 패턴 매칭
  for (const pattern of SERVICE_PATTERNS) {
    const service: DetectedService = {
      type: pattern.type,
      displayName: pattern.displayName,
      credentials: {},
      missingRequired: [],
      sources: [],
      isComplete: false,
    }

    for (const p of pattern.patterns) {
      for (const v of normalizedVars) {
        const keyToMatch = v.normalizedKey
        const matches =
          typeof p.envKey === 'string'
            ? keyToMatch === p.envKey || v.key === p.envKey
            : p.envKey.test(keyToMatch) || p.envKey.test(v.key)

        if (matches) {
          const value = p.transform ? p.transform(v.value) : v.value
          service.credentials[p.credentialKey] = value
          if (!service.sources.includes(v.source)) {
            service.sources.push(v.source)
          }
          matchedKeys.add(v.key)
        }
      }
    }

    // 필수 credential 확인
    if (pattern.requiredCredentials) {
      service.missingRequired = pattern.requiredCredentials.filter(
        (key) => !service.credentials[key]
      )
      service.isComplete = service.missingRequired.length === 0
    } else {
      service.isComplete = Object.keys(service.credentials).length > 0
    }

    // 최소 하나의 credential이 있으면 추가
    if (Object.keys(service.credentials).length > 0) {
      // 기존 서비스와 병합 (DATABASE_URL로 이미 추가된 경우)
      const existing = serviceMap.get(pattern.type)
      if (existing) {
        existing.credentials = { ...existing.credentials, ...service.credentials }
        existing.sources = [...new Set([...existing.sources, ...service.sources])]
        existing.missingRequired = service.missingRequired
        existing.isComplete = service.isComplete || existing.isComplete
      } else {
        serviceMap.set(pattern.type, service)
      }
    }
  }

  // 매칭되지 않은 변수
  const unmatchedVariables = variables.filter((v) => !matchedKeys.has(v.key))

  return {
    services: Array.from(serviceMap.values()),
    unmatchedVariables,
    files: [...new Set(variables.map((v) => v.source))],
  }
}

/**
 * 서비스 타입을 기존 Integration Hub 타입으로 매핑
 * (custom으로 폴백)
 */
export function mapToIntegrationHubType(
  type: ExtendedServiceType
): 'github' | 'supabase' | 'vercel' | 'sentry' | 'custom' {
  const directMap: Record<string, 'github' | 'supabase' | 'vercel' | 'sentry'> = {
    github: 'github',
    supabase: 'supabase',
    vercel: 'vercel',
    sentry: 'sentry',
  }
  return directMap[type] || 'custom'
}

/**
 * credential 값 마스킹 (미리보기용)
 */
export function maskCredentialValue(value: string): string {
  if (!value || value.length < 8) {
    return '****'
  }
  const prefix = value.substring(0, 4)
  return `${prefix}...****`
}
