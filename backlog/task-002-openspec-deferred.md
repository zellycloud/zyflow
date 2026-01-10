---
id: task-002
title: OpenSpec 미완료 태스크 백로그
status: todo
priority: high
labels: [openspec, deferred, backlog]
milestone: backlog
---

## Description

OpenSpec changes에서 완료되지 않은 태스크들을 통합 관리합니다.
각 섹션은 원래 change와 그룹 정보를 유지하여 추적성을 보장합니다.

---

# Priority: HIGH - add-integration-hub (34개)

> Integration Hub: 서비스 계정 통합 관리 시스템

## 1.1 SQLite 및 암호화 설정
- [ ] SQLite 데이터베이스 설정 (`~/.zyflow/integrations.db`)
- [ ] 암호화 유틸리티 구현 (AES-256-GCM)
- [ ] 마스터 키 관리 (macOS Keychain 연동)
- [ ] 스키마 정의 (service_accounts, environments, test_accounts, project_integrations)

## 2.1 계정 CRUD 및 서비스 타입
- [ ] 서비스 계정 CRUD API 엔드포인트
- [ ] GitHub 계정 타입 지원 (username, PAT, SSH key path)
- [ ] Supabase 계정 타입 지원 (project URL, anon key, service role key)
- [ ] Vercel 계정 타입 지원 (token, team ID)
- [ ] Sentry 계정 타입 지원 (DSN, auth token, org/project slug)
- [ ] 커스텀 서비스 타입 지원 (key-value 형식)

## 3.1 프로젝트 매핑 및 환경 설정
- [ ] 프로젝트-서비스 매핑 CRUD API
- [ ] 환경 설정 CRUD API (local/staging/production)
- [ ] 테스트 계정 CRUD API
- [ ] 프로젝트 컨텍스트 조회 API (AI용, 민감정보 제외)

## 4.1 서비스 계정 관리 UI
- [ ] Settings 페이지에 Integrations 탭 추가
- [ ] 서비스 계정 목록 컴포넌트
- [ ] 서비스 계정 추가/수정 모달 (서비스 타입별 폼)
- [ ] 프로젝트 매핑 목록 컴포넌트
- [ ] 민감 정보 마스킹 및 복사 기능

## 5.1 프로젝트별 연동 UI
- [ ] 프로젝트 상세 페이지에 Integrations 섹션 추가
- [ ] 연결된 서비스 표시 및 변경 기능
- [ ] 환경 설정 목록 및 편집 UI
- [ ] 테스트 계정 목록 및 편집 UI
- [ ] 현재 환경 선택 기능

## 6.1 Integration MCP 도구
- [ ] `integration_context` 도구 - 프로젝트 컨텍스트 조회
- [ ] `integration_apply_git` 도구 - Git 설정 자동 적용
- [ ] `integration_list_accounts` 도구 - 등록된 계정 목록
- [ ] `integration_get_env` 도구 - 환경 변수 조회

## 7.1 Git 계정 자동 적용
- [ ] 프로젝트 열 때 해당 GitHub 계정의 git config 자동 적용
- [ ] credential helper 연동 (토큰 기반 인증)
- [ ] SSH 키 기반 인증 지원

## 8.1 테스트 및 문서
- [ ] 암호화 유틸리티 단위 테스트
- [ ] API 엔드포인트 통합 테스트
- [ ] 사용자 가이드 작성 (README 또는 docs/)

---

# Priority: MEDIUM - add-post-task-agent (21개)

> Post-Task Agent: 자동화된 후처리 시스템 (90% 완료)

## Group 3: Quarantine 시스템
- [ ] Quarantine Manager 구현
- [ ] 격리 복구 기능
- [ ] 격리 만료 정책

## Group 4: CI/CD 작업
- [ ] ci-fix 구현
- [ ] dep-audit 구현

## Group 5: Production 작업
- [ ] sentry-triage 구현
- [ ] security-audit 구현

## Group 6: 리포트 시스템
- [ ] Report Generator 구현
- [ ] 리포트 조회 API

## Group 7: MCP 도구
- [ ] post_task_run MCP 도구
- [ ] quarantine MCP 도구들
- [ ] 기존 MCP 서버에 통합

## Group 8: 테스트 및 문서
- [ ] Post-Task 작업 단위 테스트
- [ ] Quarantine 시스템 테스트
- [ ] CLAUDE.md 업데이트

## Group 10: 테스트 및 문서 (중복 항목)
- [ ] Post-Task 작업 단위 테스트
- [ ] Testing 작업 단위 테스트
- [ ] Quarantine 시스템 테스트
- [ ] Trigger 시스템 테스트

---

# Priority: LOW - Cleanup Tasks (6개)

## refactor-flow-ui-architecture
> UI 아키텍처 리팩토링 (거의 완료)

### 테스트
- [ ] UI 컴포넌트 테스트

### 문서화
- [ ] README.md 업데이트
- [ ] API 문서 작성
- [ ] MCP 도구 사용법 업데이트

## add-backlog-system
> Backlog 시스템 (95% 완료)

### Legacy Code
- [ ] Inbox 전용 코드 정리 (Backlog와 통합)
- [ ] 중복 컴포넌트 정리

---

## Plan

1. **Phase 1**: LOW 우선순위 정리 태스크 먼저 완료 (문서화, 정리)
2. **Phase 2**: MEDIUM 우선순위 - Post-Task Agent 마무리
3. **Phase 3**: HIGH 우선순위 - Integration Hub 착수 (별도 change로 분리 권장)

## Acceptance Criteria

- [ ] 모든 deferred 태스크가 추적됨
- [ ] 우선순위별 분류 완료
- [ ] Backlog UI에서 조회 가능
- [ ] 정기적으로 리뷰하여 active change로 승격

## Notes

- 2026-01-09: OpenSpec 미완료 태스크 통합 백로그 생성
- 원본 OpenSpec changes의 tasks.md는 유지 (히스토리 보존)
- 이 파일은 "무엇이 남았는지" 한눈에 보기 위한 용도
