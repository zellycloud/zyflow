# Design: Integration Hub

## Context

개발자가 여러 프로젝트와 서비스를 동시에 사용할 때, 각 프로젝트별로 어떤 계정/환경/설정을 사용해야 하는지 추적하기 어렵습니다. 특히:

- GitHub 계정이 여러 개 (개인/회사)
- 각 프로젝트마다 다른 Supabase/Vercel/Sentry 프로젝트
- staging/production 환경별로 다른 설정
- AI 어시스턴트에게 매번 컨텍스트를 전달해야 함

## Goals / Non-Goals

### Goals
- 서비스 계정을 중앙에서 관리 (GitHub, Supabase, Vercel, Sentry 등)
- 프로젝트별로 어떤 서비스/계정을 사용하는지 매핑
- 환경별 (local/staging/production) 설정 관리
- 테스트 계정 정보 저장 및 AI 컨텍스트 제공
- 민감 정보 보안 저장

### Non-Goals
- 자동 배포 기능 (Vercel/GitHub Actions 대체 아님)
- 서비스 직접 제어 (API 호출로 리소스 생성/삭제 등)
- 팀 협업 기능 (개인 사용 목적)

## Data Model

### 서비스 계정 (Service Account)

```typescript
interface ServiceAccount {
  id: string;                    // UUID
  type: ServiceType;             // 'github' | 'supabase' | 'vercel' | 'sentry' | 'custom'
  name: string;                  // 사용자가 지정한 이름 (예: "hansooha", "zellycloud")
  credentials: EncryptedData;    // 암호화된 인증 정보
  metadata: Record<string, string>; // 추가 정보 (org, team 등)
  createdAt: string;
  updatedAt: string;
}

// 서비스별 credential 구조
interface GitHubCredentials {
  username: string;
  token: string;           // PAT
  sshKeyPath?: string;     // SSH 키 파일 경로
}

interface SupabaseCredentials {
  projectUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
}

interface VercelCredentials {
  token: string;
  teamId?: string;
}

interface SentryCredentials {
  dsn: string;
  authToken?: string;
  orgSlug: string;
  projectSlug: string;
}
```

### 환경 설정 (Environment Config)

```typescript
interface EnvironmentConfig {
  id: string;
  projectId: string;             // 연결된 프로젝트
  name: 'local' | 'staging' | 'production' | string;
  variables: EncryptedData;      // 암호화된 환경 변수
  serverUrl?: string;
  databaseUrl?: string;
  description?: string;
}
```

### 테스트 계정 (Test Account)

```typescript
interface TestAccount {
  id: string;
  projectId: string;
  role: string;                  // 'admin' | 'user' | custom
  email: string;
  password: EncryptedData;
  description?: string;
}
```

### 프로젝트 연동 (Project Integration)

```typescript
interface ProjectIntegration {
  projectId: string;             // zyflow 프로젝트 ID (경로 기반)
  integrations: {
    github?: string;             // ServiceAccount ID
    supabase?: string;
    vercel?: string;
    sentry?: string;
    [key: string]: string | undefined;
  };
  defaultEnvironment?: string;   // 기본 환경
}
```

## Storage Strategy

### Option A: SQLite + 암호화 (선택)

```
~/.zyflow/
├── integrations.db          # SQLite DB (암호화된 필드)
└── .encryption-key          # 마스터 키 (Keychain에서 가져오거나 파일)
```

**장점:**
- 쿼리 용이
- 관계형 데이터에 적합
- 백업/마이그레이션 쉬움

### Option B: 암호화된 JSON 파일

```
~/.zyflow/
├── integrations.json.enc    # 전체 암호화
└── .key                     # 암호화 키
```

**장점:**
- 구현 단순
- 파일 하나로 관리

### 결정: Option A (SQLite)

- 서비스/환경/계정 간의 관계 쿼리가 필요
- 향후 확장성 고려
- `better-sqlite3` 사용 (동기식, 빠름)

## Security

### 암호화 전략

1. **마스터 키**
   - 첫 실행 시 랜덤 생성
   - macOS: Keychain에 저장
   - Linux/Windows: 암호화된 파일

2. **필드 레벨 암호화**
   - 민감 필드만 암호화 (token, password, apiKey)
   - AES-256-GCM 사용

3. **UI 표시**
   - 키 값은 마스킹 (`sk-...****`)
   - 복사 버튼으로만 원본 접근

### 예시: GitHub 토큰 저장

```typescript
// 저장 시
const encrypted = encrypt(masterKey, {
  username: 'hansooha',
  token: 'ghp_xxxxxxxxxxxx'
});
db.exec('INSERT INTO service_accounts (credentials) VALUES (?)', encrypted);

// 조회 시
const row = db.get('SELECT credentials FROM service_accounts WHERE id = ?', id);
const { username, token } = decrypt(masterKey, row.credentials);
```

## API Design

### REST Endpoints

```
# 서비스 계정
GET    /api/integrations/accounts
POST   /api/integrations/accounts
PUT    /api/integrations/accounts/:id
DELETE /api/integrations/accounts/:id

# 프로젝트 연동
GET    /api/integrations/projects/:projectId
PUT    /api/integrations/projects/:projectId

# 환경 설정
GET    /api/integrations/projects/:projectId/environments
POST   /api/integrations/projects/:projectId/environments
PUT    /api/integrations/projects/:projectId/environments/:envId
DELETE /api/integrations/projects/:projectId/environments/:envId

# 테스트 계정
GET    /api/integrations/projects/:projectId/test-accounts
POST   /api/integrations/projects/:projectId/test-accounts
PUT    /api/integrations/projects/:projectId/test-accounts/:id
DELETE /api/integrations/projects/:projectId/test-accounts/:id

# 컨텍스트 조회 (AI용)
GET    /api/integrations/projects/:projectId/context
```

### MCP 도구

```typescript
// AI가 프로젝트 컨텍스트 조회
integration_context(projectPath: string) => {
  github: { username: 'hansooha', /* token 제외 */ },
  supabase: { projectUrl: '...', /* keys 제외 */ },
  environments: ['local', 'staging', 'production'],
  currentEnvironment: 'local',
  testAccounts: [{ role: 'admin', email: 'admin@test.com' }]
}

// Git 설정 적용 (프로젝트 디렉토리에)
integration_apply_git(projectPath: string) => {
  // git config user.name, user.email 설정
  // credential helper 설정
}
```

## UI Design

### Settings > Integrations 탭

```
┌─────────────────────────────────────────────────────────────┐
│ Settings                                                     │
├─────────────────────────────────────────────────────────────┤
│ [General] [Integrations] [Appearance]                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Service Accounts                              [+ Add New]   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🐙 GitHub                                               │ │
│ │   ├─ hansooha (Personal)              [Edit] [Delete]   │ │
│ │   └─ zellycloud (Work)                [Edit] [Delete]   │ │
│ │                                                         │ │
│ │ 🟢 Supabase                                             │ │
│ │   ├─ zywiki-prod                      [Edit] [Delete]   │ │
│ │   └─ zellyy-money-prod                [Edit] [Delete]   │ │
│ │                                                         │ │
│ │ ▲ Vercel                                                │ │
│ │   └─ zellycloud-team                  [Edit] [Delete]   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Project Mappings                                            │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ zywiki           GitHub: zellycloud | Supabase: zywiki  │ │
│ │ zellyy-money     GitHub: zellycloud | Supabase: zellyy  │ │
│ │ admin-console    GitHub: hansooha   | Vercel: jayoo     │ │
│ │ dev-convert      GitHub: hansooha   | -                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 프로젝트 상세 > Integrations 섹션

```
┌─────────────────────────────────────────────────────────────┐
│ zywiki > Integrations                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Connected Services                                          │
│ ┌──────────────┬──────────────────────────────────────────┐ │
│ │ GitHub       │ zellycloud              [Change]         │ │
│ │ Supabase     │ zywiki-prod             [Change]         │ │
│ │ Vercel       │ Not connected           [Connect]        │ │
│ │ Sentry       │ Not connected           [Connect]        │ │
│ └──────────────┴──────────────────────────────────────────┘ │
│                                                             │
│ Environments                                    [+ Add]     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🟢 local (active)                                       │ │
│ │    URL: http://localhost:3000                           │ │
│ │    DB: postgresql://localhost:5432/zywiki_dev           │ │
│ │                                            [Edit]       │ │
│ │                                                         │ │
│ │ 🟡 staging                                              │ │
│ │    URL: https://staging.zywiki.com                      │ │
│ │    DB: postgresql://staging-db.../zywiki                │ │
│ │                                            [Edit]       │ │
│ │                                                         │ │
│ │ 🔴 production                                           │ │
│ │    URL: https://zywiki.com                              │ │
│ │    DB: postgresql://prod-db.../zywiki                   │ │
│ │                                            [Edit]       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Test Accounts                                   [+ Add]     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ admin    admin@test.com    ••••••••    [Copy] [Edit]    │ │
│ │ user     user@test.com     ••••••••    [Copy] [Edit]    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| 보안 키 유출 | 높음 | 암호화 + Keychain 연동 |
| DB 파일 손상 | 중간 | 자동 백업 (일일) |
| 복잡도 증가 | 중간 | 단계별 구현, 핵심 기능 우선 |

## Migration Plan

1. **Phase 1**: 서비스 계정 관리 (GitHub 우선)
2. **Phase 2**: 프로젝트-서비스 매핑
3. **Phase 3**: 환경별 설정
4. **Phase 4**: 테스트 계정
5. **Phase 5**: MCP 도구 연동

기존 프로젝트 설정에는 영향 없음 (신규 기능 추가).

## Open Questions

1. ~~암호화 키 관리: Keychain vs 파일?~~ → macOS는 Keychain, 나머지는 파일
2. OAuth 연동 지원할지? (Vercel, GitHub 등) → Phase 2 이후 검토
3. 팀 공유 기능 필요할지? → Non-goal로 명시, 개인 사용 목적
