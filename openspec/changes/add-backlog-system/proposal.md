# Backlog.md 기반 태스크 관리 시스템

## Summary

Backlog.md 패턴을 도입하여 Git-native, human-readable 태스크 저장소를 구현합니다. 마크다운 파일이 소스 오브 트루스(SSOT)이고, SQLite DB는 캐시로 동작합니다.

## Motivation

### 현재 Inbox의 한계점

| 부족한 기능 | 현재 상태 | 영향 |
|------------|----------|------|
| **서브태스크** | 미구현 | 복잡한 작업 분해 불가 |
| **의존성** | 미구현 | 작업 간 관계 표현 불가 |
| **Acceptance Criteria** | 미구현 | "완료" 정의 불명확 |
| **계획 섹션** | 미구현 | 구현 방법 기록 불가 |
| **노트 섹션** | 미구현 | 진행 상황/논의 기록 불가 |
| **마감일** | 미구현 | 데드라인 추적 불가 |
| **Git 히스토리** | 없음 | 변경 이력 추적 불가 |

### Backlog.md의 장점

1. **Git 네이티브**: 모든 변경이 Git 히스토리로 보존
2. **AI 에이전트 친화적**: Claude가 직접 파일 읽기/쓰기 가능
3. **Human-readable**: 에디터에서 직접 편집 가능
4. **풍부한 메타데이터**: Plan, Acceptance Criteria, Notes 섹션

## Proposed Solution

### 아키텍처

```
backlog/*.md  →  Server Parser  →  SQLite (캐시)  →  REST API  →  ZyFlow UI
    (소스)           ↑                  ↑              ↑
               파일 와처가         React Query가    기존 Kanban
               변경 감지시         자동 리페치       컴포넌트 재사용
               자동 동기화
```

### 태스크 파일 구조

```yaml
---
id: task-007
title: OAuth2 인증 구현
status: In Progress
assignees: [@alice]
labels: [auth, backend, security]
priority: high
blocked_by: [task-003]
parent: task-001
due_date: 2024-01-15
milestone: Sprint 3
---

## Description
OAuth2 기반 소셜 로그인 구현

## Plan
1. Google OAuth 설정
2. 토큰 관리 로직
3. 세션 연동

## Acceptance Criteria
- [ ] Google 로그인 동작
- [ ] 토큰 갱신 자동화
- [ ] 에러 처리 완료

## Notes
- 2024-01-03: API 키 발급 완료
- 2024-01-04: 토큰 로직 50% 완료
```

### 핵심 기능

1. **YAML Frontmatter 파싱**: 태스크 메타데이터 추출
2. **마크다운 섹션 파싱**: Description, Plan, AC, Notes 추출
3. **단방향 동기화**: `backlog/*.md → DB` (마크다운이 진실의 소스)
4. **Origin 분리**: `origin='backlog'`로 Inbox와 구분
5. **Inbox 마이그레이션**: 기존 태스크를 backlog 파일로 변환

## Design Decisions

| 항목 | 결정 | 이유 |
|------|------|------|
| 동기화 방향 | 단방향 (파일→DB) | 마크다운이 SSOT, 충돌 방지 |
| ID 형식 | `task-NNN` | 파일명에 사용, 순차 증가 |
| origin 값 | `'backlog'` | Inbox(`'inbox'`)와 분리 |
| 상태 매핑 | 5단계 정규화 | 다양한 표현 수용 |

## Related Specs

- [backlog-system spec](specs/backlog-system/spec.md)

## References

- [Backlog.md Project](https://github.com/backlog-md/backlog)
- [YAML Frontmatter Spec](https://jekyllrb.com/docs/front-matter/)
