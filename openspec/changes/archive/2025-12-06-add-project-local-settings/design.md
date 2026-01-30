# Design: add-project-local-settings

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        MCP Tools                            │
│  integration_context, integration_get_env, ...              │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Settings Resolver                         │
│  1. Check project/.zyflow/ (local)                         │
│  2. Fallback to ~/.zyflow/integrations.db (global)         │
└──────────────┬────────────────────────────┬─────────────────┘
               │                            │
               ▼                            ▼
┌──────────────────────────┐  ┌──────────────────────────────┐
│   Local Settings         │  │   Global Settings            │
│   프로젝트/.zyflow/       │  │   ~/.zyflow/                 │
│                          │  │                              │
│   ├── settings.json      │  │   ├── integrations.db        │
│   ├── environments/      │  │   │   ├── service_accounts   │
│   │   ├── local.env      │  │   │   └── (legacy data)      │
│   │   └── staging.env    │  │   └── .master-key            │
│   └── test-accounts.json │  │                              │
└──────────────────────────┘  └──────────────────────────────┘
```

## File Formats

### settings.json

프로젝트가 어떤 전역 계정을 사용할지 매핑:

```json
{
  "version": 1,
  "integrations": {
    "github": "account-uuid-1",
    "supabase": "account-uuid-2"
  },
  "defaultEnvironment": "local",
  "createdAt": "2024-12-05T00:00:00Z",
  "updatedAt": "2024-12-05T00:00:00Z"
}
```

### environments/*.env

표준 dotenv 형식 (암호화 없음, .gitignore 권장):

```env
# local.env
DATABASE_URL=postgresql://localhost:5432/mydb
API_BASE_URL=http://localhost:3000
DEBUG=true
```

### test-accounts.json

테스트 계정 (비밀번호 암호화):

```json
{
  "version": 1,
  "accounts": [
    {
      "id": "uuid",
      "role": "admin",
      "email": "admin@test.com",
      "password": "encrypted:...",
      "description": "관리자 테스트 계정"
    }
  ]
}
```

## Settings Resolution Flow

```
┌─────────────────────────────────────────────────────────┐
│ Request: Get project integration context                │
│ Input: projectPath = "/Users/hansoo/project"           │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│ Step 1: Check local settings                            │
│ Path: /Users/hansoo/project/.zyflow/settings.json      │
└─────────────────────────────┬───────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────┐          ┌─────────────────────────┐
│ File exists         │          │ File not found          │
│ → Use local config  │          │ → Check global DB       │
└─────────────────────┘          └─────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────────────────────────────────────┐
│ Step 2: Resolve account references                      │
│ Local settings.json has account UUIDs                   │
│ → Fetch actual credentials from global integrations.db │
└─────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│ Step 3: Load environment variables                      │
│ From: project/.zyflow/environments/{active}.env        │
│ Fallback: global DB environments table                  │
└─────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│ Step 4: Load test accounts                              │
│ From: project/.zyflow/test-accounts.json               │
│ Fallback: global DB test_accounts table                │
└─────────────────────────────────────────────────────────┘
```

## Migration Strategy

### Phase 1: Read Support (이번 변경)

- 로컬 설정 파일 읽기 지원
- 전역 DB와 병행 사용 (fallback)
- 기존 API 동작 유지

### Phase 2: Write Support

- UI에서 "Export to Project" 기능
- 새 프로젝트 생성 시 로컬 설정 기본 사용
- MCP 도구에서 로컬 설정 쓰기

### Phase 3: Full Migration (선택적)

- 전역 DB에서 프로젝트별 데이터 제거
- 로컬 전용 모드 옵션

## API Changes

### Existing APIs (변경 없음)

- `GET /api/integrations/projects/:projectId/context`
- `GET /api/integrations/projects/:projectId/environments`
- `GET /api/integrations/projects/:projectId/test-accounts`

### Internal Changes

```typescript
// Before
async function getProjectContext(projectId: string) {
  return await db.query('SELECT * FROM project_integrations WHERE project_id = ?', [projectId]);
}

// After
async function getProjectContext(projectId: string) {
  // 1. Try local settings first
  const localSettings = await loadLocalSettings(projectId);
  if (localSettings) {
    return resolveLocalContext(localSettings);
  }

  // 2. Fallback to global DB
  return await db.query('SELECT * FROM project_integrations WHERE project_id = ?', [projectId]);
}
```

## Security Considerations

### 암호화 전략

| 데이터 | 암호화 방식 | 키 위치 |
|--------|------------|--------|
| 서비스 계정 토큰 | AES-256-GCM | ~/.zyflow/.master-key |
| 테스트 계정 비밀번호 | AES-256-GCM | ~/.zyflow/.master-key |
| 환경 변수 | 없음 (plaintext) | .gitignore 권장 |

### .gitignore 권장 패턴

```gitignore
# .zyflow 민감 정보
.zyflow/environments/*.env
.zyflow/test-accounts.json

# 설정 구조는 공유 가능
!.zyflow/settings.json
```

## Error Handling

| 상황 | 동작 |
|------|------|
| 로컬 설정 파일 손상 | 전역 DB로 fallback, 경고 로그 |
| 참조된 계정 UUID 없음 | null 반환, 경고 메시지 |
| 환경 파일 없음 | 빈 환경 변수 반환 |
| 권한 오류 | 에러 반환 (fallback 없음) |
