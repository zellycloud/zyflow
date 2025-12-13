# Post-Task Agent 자동화

## Summary

작업 완료 후 자동으로 코드 품질 점검, CI/CD 오류 수정, 프로덕션 모니터링을 수행하는 Post-Task Agent 시스템을 추가합니다.

## Motivation

현재 개발 워크플로우에서 작업 완료 후 수동으로 수행해야 하는 반복적인 점검 작업들이 있습니다:
- 린트/타입 오류 확인 및 수정
- GitHub Actions 실패 분석
- Sentry 에러 확인
- 보안 취약점 점검

이러한 작업들을 AI Agent에게 위임하여 개발자의 부담을 줄이고, 코드 품질을 일관되게 유지할 수 있습니다.

## Proposed Solution

### Post-Task Agent 시스템

작업 유형별로 분류된 자동화 Agent를 제공합니다:

```
┌──────────────────────────────────────────────────────┐
│  Post-Task Agent                                     │
├──────────────────────────────────────────────────────┤
│  Trigger                                             │
│  ├─ Manual: 사용자가 "점검 실행" 요청                  │
│  ├─ Scheduled: 정기 실행 (cron)                      │
│  └─ Event: PR merge, deploy 완료 시                  │
├──────────────────────────────────────────────────────┤
│  Category: Code Quality (자동 수정)                   │
│  ├─ lint-fix       → ESLint 오류 자동 수정            │
│  ├─ type-check     → TypeScript 오류 수정            │
│  ├─ dead-code      → 미사용 코드 격리/정리            │
│  ├─ todo-cleanup   → 해결된 TODO 제거                │
│  └─ refactor-suggest → 리팩토링 제안 리포트          │
├──────────────────────────────────────────────────────┤
│  Category: CI/CD (분석 + 수정 시도)                   │
│  ├─ ci-fix         → GitHub Actions 실패 분석/수정    │
│  ├─ dep-audit      → npm audit 취약점 패치           │
│  └─ bundle-check   → 번들 사이즈 이상 감지            │
├──────────────────────────────────────────────────────┤
│  Category: Production (분석 + 보고)                   │
│  ├─ sentry-triage  → 에러 분석 및 수정안 제시         │
│  ├─ security-audit → Supabase 보안 로그 분석         │
│  └─ api-validate   → API 스키마 불일치 감지           │
├──────────────────────────────────────────────────────┤
│  Category: Maintenance (리마인드)                     │
│  ├─ todo-remind    → 오래된 TODO 알림                │
│  └─ coverage-check → 테스트 커버리지 모니터링         │
└──────────────────────────────────────────────────────┘
```

### Dead Code 격리 시스템

삭제가 애매한 코드는 바로 삭제하지 않고 `.quarantine/` 폴더로 격리합니다:

```
project/
├── src/
│   └── ... (정상 코드)
├── .quarantine/
│   ├── 2024-12-13/
│   │   ├── manifest.json     # 원본 위치, 격리 사유 기록
│   │   ├── utils/
│   │   │   └── oldHelper.ts
│   │   └── components/
│   │       └── UnusedModal.tsx
│   └── 2024-12-10/
│       └── ...
```

**격리 정책:**
| 상태 | 기간 | 액션 |
|------|------|------|
| 격리됨 | 0~14일 | 문제 발생 시 즉시 복구 가능 |
| 격리 유지 | 14~30일 | 문제 없으면 삭제 가능 표시 |
| 최종 삭제 | 30일+ | Agent가 자동 삭제 또는 확인 요청 |

## Scope

### In Scope
- Post-Task Agent 타입 정의 및 MCP 도구
- Code Quality 카테고리 Agent 구현 (lint-fix, type-check, dead-code, todo-cleanup)
- CI/CD 카테고리 Agent 구현 (ci-fix, dep-audit)
- Production 카테고리 Agent 구현 (sentry-triage, security-audit)
- .quarantine 격리 시스템
- Agent 실행 결과 리포트 생성

### Out of Scope
- 스케줄러 (cron) 구현 - 별도 제안으로 분리
- GitHub/Sentry webhook 연동 - 별도 제안으로 분리
- UI 대시보드 - 기존 Agent UI 재사용

## Success Criteria

1. `post_task_run` MCP 도구로 원하는 점검 작업을 실행할 수 있다
2. lint/type 오류가 자동으로 수정되고 커밋된다
3. 미사용 코드가 `.quarantine/`로 안전하게 격리된다
4. GitHub Actions 실패 시 원인 분석 및 수정안이 제시된다
5. 각 실행 결과가 구조화된 리포트로 저장된다

## Affected Components

- `mcp-server/` - 새로운 post-task 도구 추가
- `server/` - 격리 시스템 API
- 새 파일: `.quarantine/` 디렉토리 구조
