# Change: Phase 2 - DB 중심 데이터 레이어 전환

## Summary

tasks.md 파일과 SQLite DB 간의 양방향 동기화(3,600+ LOC)를 제거하고,
DB를 유일한 데이터 소스로 전환합니다.

## Motivation

### 현재 문제
- 파일 편집 → DB sync 지연 → 데이터 불일치
- DB 변경 → 파일 반영 실패 → 데이터 불일치
- 충돌 발생 시 복잡한 recovery 로직 필요
- 원격 프로젝트에서 sync 문제 빈번 발생

### 해결 방안
- DB를 유일한 데이터 소스로 지정
- tasks.md는 Export 산출물로 역할 변경 (단방향)
- 필요 시 수동 Import 기능 제공

## Scope

### 제거할 Sync 코드 (3,621 LOC)

| 파일 | LOC |
|------|-----|
| server/sync.ts | 872 |
| server/sync-recovery.ts | 1,068 |
| server/sync-recovery-strategies.ts | 903 |
| server/sync-failure-detector.ts | 778 |

### 추가할 기능

- Export: DB → tasks.md (수동 실행)
- Import: tasks.md → DB (수동 실행)

## Architecture

### Before
```
┌─────────────────┐     ┌─────────────────┐
│  tasks.md (File)│ ←──→│  SQLite (DB)    │
└─────────────────┘     └─────────────────┘
         ↓                       ↓
   ┌──────────────────────────────┐
   │      Sync Layer (3,600 LOC) │
   └──────────────────────────────┘
```

### After
```
┌─────────────────┐
│  SQLite (DB)    │ ← 유일한 데이터 소스
└─────────────────┘
         ↓
┌──────────────────────────────┐
│   Export Layer (~200 LOC)    │
│   - tasks.md 내보내기 (수동) │
│   - tasks.md 가져오기 (수동) │
└──────────────────────────────┘
```

## Expected Impact

- 3,621 LOC 제거
- 데이터 일관성 보장
- 버그 발생 지점 대폭 감소
- 원격 프로젝트 안정성 향상
