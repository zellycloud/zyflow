# Post-Task Agent 설계

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Post-Task Agent System                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ MCP Tools   │───▶│ Task Runner  │───▶│ Report Gen    │  │
│  │             │    │              │    │               │  │
│  │ post_task_* │    │ - lint-fix   │    │ - JSON        │  │
│  │             │    │ - type-check │    │ - Markdown    │  │
│  └─────────────┘    │ - dead-code  │    └───────────────┘  │
│                     │ - ci-fix     │            │          │
│                     │ - ...        │            ▼          │
│                     └──────────────┘    ┌───────────────┐  │
│                            │            │ .zyflow/      │  │
│                            ▼            │ reports/      │  │
│                     ┌──────────────┐    └───────────────┘  │
│                     │ Quarantine   │                       │
│                     │ Manager      │                       │
│                     │              │                       │
│                     │ .quarantine/ │                       │
│                     └──────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Decision 0: 트리거 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     Trigger System                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │  Git Hooks   │   │  Scheduler   │   │  Event Listener      │ │
│  │              │   │              │   │                      │ │
│  │ .git/hooks/  │   │ node-cron    │   │ polling (gh, sentry) │ │
│  │ husky        │   │ or pm2       │   │ file watcher         │ │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘ │
│         │                  │                      │              │
│         └──────────────────┼──────────────────────┘              │
│                            ▼                                     │
│                   ┌────────────────┐                             │
│                   │ Trigger Router │                             │
│                   │                │                             │
│                   │ - task mapping │                             │
│                   │ - dedup check  │                             │
│                   │ - queue        │                             │
│                   └────────┬───────┘                             │
│                            ▼                                     │
│                   ┌────────────────┐                             │
│                   │  Task Runner   │                             │
│                   └────────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**트리거 설정 파일 (`.zyflow/triggers.json`):**
```json
{
  "hooks": {
    "pre-commit": ["lint-fix", "type-check"],
    "pre-push": ["test-fix"],
    "post-commit": ["test-gen"],
    "post-merge": ["dep-audit", "dead-code"]
  },
  "schedule": [
    { "cron": "0 9 * * *", "tasks": ["sentry-triage", "security-audit"] },
    { "cron": "0 9 * * 1", "tasks": ["dead-code", "e2e-expand"] },
    { "cron": "0 9 1 * *", "tasks": ["refactor-suggest"] }
  ],
  "events": {
    "ci-failure": ["ci-fix", "test-fix"],
    "pr-created": ["lint-fix", "type-check", "test-gen"],
    "pr-merged": ["dead-code", "coverage-check"],
    "deploy-complete": ["e2e-expand", "api-validate"],
    "sentry-issue": ["sentry-triage"]
  },
  "polling": {
    "github-ci": { "interval": "5m", "enabled": true },
    "sentry": { "interval": "15m", "enabled": true }
  }
}
```

### Decision 1: Task 카테고리별 자동화 수준

각 카테고리는 위험도에 따라 다른 자동화 수준을 가집니다:

| 카테고리 | 자동화 수준 | 이유 |
|----------|------------|------|
| Code Quality | **자동 수정 + 커밋** | 기계적이고 안전함 |
| Testing | **생성 + 확인 후 적용** | 테스트 품질 검증 필요 |
| CI/CD | **분석 + 수정 시도** | 환경 차이로 실패 가능 |
| Production | **분석 + 보고만** | 프로덕션 변경은 위험 |
| Maintenance | **리마인드만** | 사람의 판단 필요 |

### Decision 2: Dead Code 격리 전략

**Why Quarantine?**
- 즉시 삭제는 동적 import, 테스트 전용 코드 등을 잘못 삭제할 위험
- Git history에서 복구 가능하지만 불편함
- 격리 폴더로 옮기면 빠른 복구 + 검토 용이

**Quarantine 구조:**
```
.quarantine/
├── 2024-12-13/
│   ├── manifest.json
│   └── [original-path-structure]/
│       └── file.ts
```

**manifest.json 스키마:**
```typescript
interface QuarantineManifest {
  date: string;              // ISO date
  reason: string;            // 격리 사유 (예: "dead-code-cleanup")
  items: QuarantineItem[];
}

interface QuarantineItem {
  id: string;                // UUID
  original: string;          // 원본 경로
  reason: string;            // 상세 사유
  detectedBy: string;        // 감지 도구 (예: "ts-prune", "eslint")
  confidence: 'high' | 'medium' | 'low';
  lastUsed?: string;         // 마지막 사용일 (git log 기반)
  restoredAt?: string;       // 복구된 경우 날짜
}
```

### Decision 3: 리포트 저장 구조

모든 실행 결과는 `.zyflow/reports/`에 저장됩니다:

```
.zyflow/
├── reports/
│   ├── post-task/
│   │   ├── 2024-12-13T10-30-00_lint-fix.json
│   │   ├── 2024-12-13T10-30-00_lint-fix.md
│   │   ├── 2024-12-13T11-00-00_ci-fix.json
│   │   └── ...
│   └── summary/
│       ├── weekly-2024-W50.md
│       └── ...
```

### Decision 4: 모델 선택 전략

작업 복잡도에 따라 적절한 모델을 선택하여 비용과 속도를 최적화합니다:

| 작업 | 권장 모델 | 이유 |
|------|----------|------|
| lint-fix | haiku / qwen | 단순 패턴 수정, 빠른 처리 |
| type-check | haiku / qwen | 타입 오류는 명확함 |
| dead-code | sonnet | 의존성 분석 필요 |
| todo-cleanup | haiku | 단순 텍스트 처리 |
| ci-fix | sonnet | 복잡한 로그 분석 |
| dep-audit | haiku | 버전 비교만 필요 |
| sentry-triage | sonnet / opus | 스택트레이스 심층 분석 |
| security-audit | opus | 보안 컨텍스트 이해 필요 |
| refactor-suggest | sonnet | 코드 구조 이해 필요 |
| test-fix | sonnet | 테스트 로직 이해 필요 |
| test-gen | sonnet | 코드 분석 + 테스트 설계 |
| e2e-expand | sonnet | 사용자 플로우 이해 필요 |
| coverage-fix | balanced | 커버리지 분석 + 테스트 생성 |
| snapshot-update | haiku | 단순 비교 작업 |
| flaky-detect | sonnet | 비결정적 패턴 분석 |

**CLI별 모델 매핑:**
```typescript
type ModelTier = 'fast' | 'balanced' | 'powerful';

const CLI_MODELS: Record<string, Record<ModelTier, string>> = {
  'claude': {
    fast: 'claude-haiku',
    balanced: 'claude-sonnet',
    powerful: 'claude-opus'
  },
  'gemini': {
    fast: 'gemini-flash',
    balanced: 'gemini-pro',
    powerful: 'gemini-ultra'
  },
  'qwen': {
    fast: 'qwen-turbo',
    balanced: 'qwen-plus',
    powerful: 'qwen-max'
  },
  'openai': {
    fast: 'gpt-4o-mini',
    balanced: 'gpt-4o',
    powerful: 'o1'
  }
};
```

**사용자 오버라이드:**
```typescript
// 기본 모델로 실행
post_task_run({ tasks: ['lint-fix'] })

// 특정 모델 지정
post_task_run({
  tasks: ['sentry-triage'],
  model: 'opus'  // 또는 'powerful'
})

// CLI 지정
post_task_run({
  tasks: ['lint-fix'],
  cli: 'qwen',
  model: 'fast'
})
```

### Decision 5: MCP 도구 설계

**단일 진입점 + 카테고리 필터:**
```typescript
// 전체 점검 실행
post_task_run({ category: 'all' })

// 특정 카테고리만
post_task_run({ category: 'code-quality' })

// 특정 작업만
post_task_run({ tasks: ['lint-fix', 'type-check'] })

// 모델/CLI 지정
post_task_run({
  tasks: ['lint-fix'],
  cli: 'qwen',
  model: 'fast'
})
```

**개별 도구도 제공:**
```typescript
post_task_lint_fix({ model: 'haiku' })
post_task_type_check({ cli: 'gemini' })
post_task_dead_code()
// ...
```

### Decision 6: 외부 서비스 연동

| 서비스 | 연동 방식 | 필요 설정 |
|--------|----------|----------|
| GitHub | `gh` CLI | 로그인 필요 |
| Sentry | REST API | SENTRY_AUTH_TOKEN |
| Supabase | `supabase` CLI | 프로젝트 연결 |

**Integration Hub 연동:**
기존 `integration-tools.ts`의 계정 정보를 활용하여 토큰을 자동으로 가져옵니다.

## Task Implementation Details

### lint-fix
```bash
# 1. 린트 실행
npm run lint -- --format json > lint-result.json

# 2. 자동 수정 가능한 것 수정
npm run lint -- --fix

# 3. 수정 불가능한 것은 리포트에 포함
```

### type-check
```bash
# 1. 타입 체크
npx tsc --noEmit 2>&1 | tee type-errors.txt

# 2. 에러 분석 및 수정 시도
# - missing import → 자동 추가
# - type mismatch → 수정안 제시
```

### dead-code
```bash
# 1. 미사용 export 감지
npx ts-prune > unused-exports.txt

# 2. 미사용 의존성 감지
npx depcheck

# 3. 신뢰도별 처리
# - high confidence → .quarantine/로 이동
# - low confidence → 리포트에만 포함
```

### ci-fix
```bash
# 1. 최근 실패한 workflow 확인
gh run list --status failure --limit 5

# 2. 실패 로그 분석
gh run view <run-id> --log-failed

# 3. 패턴 매칭으로 원인 분류
# - dependency issue
# - test failure
# - build error
# - environment issue
```

### sentry-triage
```bash
# 1. 최근 이슈 조회
curl -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/{org}/{project}/issues/"

# 2. 스택트레이스 분석
# 3. 코드 위치 찾기
# 4. 수정안 제시 (자동 수정 안 함)
```

## Testing Automation Details

### test-fix
```bash
# 1. 테스트 실행 및 결과 수집
npm run test -- --json --outputFile=test-results.json

# 2. 실패 분석
# - assertion 실패: 기대값 vs 실제값 비교
# - 타입 에러: 테스트 코드 타입 수정
# - mock 문제: mock 데이터 업데이트
# - 환경 문제: 설정 확인

# 3. 수정안 적용 (확인 후)
```

### test-gen
```bash
# 1. 최근 변경 파일 감지
git diff HEAD~1 --name-only --diff-filter=A  # 새로 추가된 파일
git diff HEAD~1 --name-only --diff-filter=M  # 수정된 파일

# 2. 테스트 없는 파일 식별
# - src/utils/foo.ts → src/utils/__tests__/foo.test.ts 확인

# 3. 테스트 자동 생성
# - 함수 시그니처 분석
# - 엣지 케이스 추론
# - vitest/jest 템플릿 적용
```

### e2e-expand
```bash
# 1. 현재 E2E 커버리지 분석
npx playwright test --list  # 현재 테스트 목록

# 2. 라우트/페이지 분석
# - src/pages/, src/routes/ 스캔
# - 커버되지 않은 페이지 식별

# 3. E2E 테스트 생성
# - Playwright 템플릿 적용
# - 주요 사용자 플로우 커버
```

### coverage-fix
```bash
# 1. 커버리지 리포트 생성
npm run test -- --coverage --json

# 2. 커버리지 부족 영역 식별
# - line coverage < 80%
# - branch coverage < 70%
# - 중요 함수 미테스트

# 3. 타겟 테스트 생성
```

### snapshot-update
```bash
# 1. 스냅샷 테스트 실행
npm run test -- --testNamePattern="snapshot"

# 2. 실패한 스냅샷 분석
# - 의도된 변경: 스냅샷 업데이트
# - 버그: 코드 수정 제안

# 3. 업데이트 (확인 후)
npm run test -- -u
```

### flaky-detect
```bash
# 1. 테스트 반복 실행
for i in {1..10}; do npm run test -- --json >> flaky-results.json; done

# 2. 불안정 패턴 감지
# - 랜덤 실패
# - 타이밍 의존성
# - 상태 공유 문제

# 3. 수정안 제시
# - waitFor 추가
# - mock 격리
# - 병렬 실행 비활성화
```

## Error Handling

### 복구 가능한 에러
- 네트워크 타임아웃 → 재시도
- 임시 파일 충돌 → 정리 후 재시도

### 중단해야 하는 에러
- 인증 실패 → 리포트에 기록, 사용자에게 알림
- 파일 시스템 권한 에러 → 즉시 중단

### 격리 복구
```typescript
// 잘못 격리된 파일 복구
quarantine_restore({
  date: '2024-12-13',
  itemId: 'abc-123'
})
```

## Future Considerations

1. **스케줄러**: cron 기반 정기 실행 (별도 제안)
2. **Webhook**: GitHub/Sentry 이벤트 트리거 (별도 제안)
3. **Dashboard**: 실행 히스토리 시각화 (기존 UI 확장)
4. **Custom Rules**: 프로젝트별 점검 규칙 설정
