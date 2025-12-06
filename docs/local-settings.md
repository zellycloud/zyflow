# 프로젝트 로컬 설정 (.zyflow)

프로젝트별 독립적인 설정 관리를 위한 로컬 저장소 구조입니다.

## 개요

ZyFlow는 두 가지 설정 저장소를 지원합니다:

| 저장소 | 위치 | 용도 |
|--------|------|------|
| **전역** | `~/.zyflow/integrations.db` | 서비스 계정 (토큰, API 키) |
| **로컬** | `프로젝트/.zyflow/` | 프로젝트별 설정 |

로컬 설정이 있으면 **로컬 우선**으로 조회하고, 없으면 전역 DB로 fallback합니다.

## 디렉토리 구조

```
프로젝트/
├── .zyflow/                    # 로컬 설정 디렉토리
│   ├── settings.json           # 계정 매핑 및 기본 설정
│   ├── environments/           # 환경별 변수 파일
│   │   ├── local.env           # 로컬 개발 환경
│   │   ├── staging.env         # 스테이징 환경
│   │   └── production.env      # 프로덕션 환경
│   └── test-accounts.json      # 테스트 계정 (암호화)
└── ...
```

## 파일 형식

### settings.json

계정 매핑과 기본 설정을 저장합니다.

```json
{
  "version": 1,
  "integrations": {
    "github": "uuid-of-github-account",
    "supabase": "uuid-of-supabase-account",
    "vercel": "uuid-of-vercel-account",
    "sentry": "uuid-of-sentry-account",
    "custom": {
      "stripe": "uuid-of-stripe-account"
    }
  },
  "defaultEnvironment": "local",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**주요 필드:**
- `integrations`: 서비스별 계정 UUID (전역 DB의 계정 참조)
- `defaultEnvironment`: 기본 환경 이름
- `version`: 스키마 버전 (마이그레이션용)

### environments/*.env

표준 `.env` 형식의 환경 변수 파일입니다.

```env
# local.env
DATABASE_URL=postgres://localhost:5432/myapp_dev
API_KEY=dev-api-key-12345
REDIS_URL=redis://localhost:6379

# 멀티라인 값은 따옴표로 감싸기
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE..."
```

### test-accounts.json

테스트용 계정 정보를 암호화하여 저장합니다.

```json
{
  "version": 1,
  "accounts": [
    {
      "id": "acc-1",
      "role": "admin",
      "email": "admin@test.com",
      "password": "iv:encrypted-password",
      "description": "관리자 테스트 계정"
    },
    {
      "id": "acc-2",
      "role": "user",
      "email": "user@test.com",
      "password": "iv:encrypted-password"
    }
  ]
}
```

**보안:**
- 비밀번호는 전역 마스터 키로 암호화됨
- IV(초기화 벡터)가 비밀번호 앞에 포함됨

## .gitignore 권장 패턴

`.zyflow/` 디렉토리 중 민감한 정보는 버전 관리에서 제외해야 합니다.

```gitignore
# .zyflow 로컬 설정
# 환경 변수 파일 (민감 정보 포함)
.zyflow/environments/*.env

# 테스트 계정 (암호화되어 있지만 제외 권장)
.zyflow/test-accounts.json

# settings.json은 커밋 가능 (UUID만 포함)
# !.zyflow/settings.json
```

### 권장 설정

| 파일 | Git 포함 | 이유 |
|------|----------|------|
| `settings.json` | O | UUID만 포함, 실제 토큰 없음 |
| `environments/*.env` | X | API 키, DB 비밀번호 등 포함 |
| `test-accounts.json` | X | 암호화되어 있지만 보안상 제외 |

## 사용 방법

### 1. 로컬 설정 초기화

```bash
# MCP 도구 사용
integration_init_local(projectPath: "/path/to/project")
```

또는 UI에서:
1. 설정 > 프로젝트 관리
2. 프로젝트 옆 다운로드 버튼 클릭
3. "내보내기" 확인

### 2. 전역 설정을 로컬로 내보내기

```bash
# MCP 도구 사용
integration_export_to_local(
  projectPath: "/path/to/project",
  projectId: "project-uuid"
)
```

### 3. 설정 조회 (자동 fallback)

```bash
# projectPath가 있으면 로컬 우선 조회
integration_context(
  projectId: "project-uuid",
  projectPath: "/path/to/project"  # 선택
)
```

## API 응답의 source 필드

API 응답에는 설정 소스가 표시됩니다:

```json
{
  "context": { ... },
  "source": "local",      // "local" | "global"
  "sources": {            // 세부 소스 (하이브리드 시)
    "integrations": "local",
    "environments": "local",
    "testAccounts": "global"
  }
}
```

## 마이그레이션

### 전역에서 로컬로 전환

1. UI에서 "Export to Project" 클릭
2. `.zyflow/` 디렉토리가 생성됨
3. 이후 로컬 설정이 우선 적용됨

### 로컬에서 전역으로 복귀

1. `.zyflow/` 디렉토리 삭제
2. 자동으로 전역 DB로 fallback

## 관련 MCP 도구

| 도구 | 설명 |
|------|------|
| `integration_init_local` | .zyflow 디렉토리 초기화 |
| `integration_export_to_local` | 전역 → 로컬 내보내기 |
| `integration_context` | 프로젝트 컨텍스트 조회 (로컬 우선) |
| `integration_get_env` | 환경 변수 조회 (로컬 우선) |
| `integration_get_test_account` | 테스트 계정 조회 (로컬 우선) |

## 주의사항

1. **계정 토큰은 여전히 전역 DB에 저장됨**
   - 로컬 `settings.json`에는 UUID만 저장
   - 실제 토큰은 `~/.zyflow/integrations.db`에서 조회

2. **암호화 키는 전역 마스터 키 사용**
   - 테스트 계정 비밀번호 복호화에 필요
   - `~/.zyflow/.master-key` 파일 필요

3. **프로젝트 이동 시**
   - `.zyflow/` 폴더는 함께 이동
   - 새 머신에서는 전역 계정 재설정 필요
