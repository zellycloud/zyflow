# Tasks: Integration Hub

## 1. 데이터베이스 및 암호화 기반

### 1.1 SQLite 및 암호화 설정

- [x] 1.1.1 SQLite 데이터베이스 설정 (`~/.zyflow/integrations.db`)
- [x] 1.1.2 암호화 유틸리티 구현 (AES-256-GCM)
- [x] 1.1.3 마스터 키 관리 (macOS Keychain 연동)
- [x] 1.1.4 스키마 정의 (service_accounts, environments, test_accounts, project_integrations)

## 2. 서비스 계정 관리 API

### 2.1 계정 CRUD 및 서비스 타입

- [x] 2.1.1 서비스 계정 CRUD API 엔드포인트
- [x] 2.1.2 GitHub 계정 타입 지원 (username, PAT, SSH key path)
- [x] 2.1.3 Supabase 계정 타입 지원 (project URL, anon key, service role key)
- [x] 2.1.4 Vercel 계정 타입 지원 (token, team ID)
- [x] 2.1.5 Sentry 계정 타입 지원 (DSN, auth token, org/project slug)
- [x] 2.1.6 커스텀 서비스 타입 지원 (key-value 형식)

## 3. 프로젝트 연동 관리 API

### 3.1 프로젝트 매핑 및 환경 설정

- [x] 3.1.1 프로젝트-서비스 매핑 CRUD API
- [x] 3.1.2 환경 설정 CRUD API (local/staging/production)
- [x] 3.1.3 테스트 계정 CRUD API
- [x] 3.1.4 프로젝트 컨텍스트 조회 API (AI용, 민감정보 제외)

## 4. UI: Settings > Integrations

### 4.1 서비스 계정 관리 UI

- [x] 4.1.1 Settings 페이지에 Integrations 탭 추가
- [x] 4.1.2 서비스 계정 목록 컴포넌트
- [x] 4.1.3 서비스 계정 추가/수정 모달 (서비스 타입별 폼)
- [x] 4.1.4 프로젝트 매핑 목록 컴포넌트
- [x] 4.1.5 민감 정보 마스킹 및 복사 기능

## 5. UI: 프로젝트 상세 > Integrations

### 5.1 프로젝트별 연동 UI

- [x] 5.1.1 프로젝트 상세 페이지에 Integrations 섹션 추가
- [x] 5.1.2 연결된 서비스 표시 및 변경 기능
- [x] 5.1.3 환경 설정 목록 및 편집 UI
- [x] 5.1.4 테스트 계정 목록 및 편집 UI
- [x] 5.1.5 현재 환경 선택 기능

## 6. MCP 도구 연동

### 6.1 Integration MCP 도구

- [x] 6.1.1 `integration_context` 도구 - 프로젝트 컨텍스트 조회
- [x] 6.1.2 `integration_apply_git` 도구 - Git 설정 자동 적용
- [x] 6.1.3 `integration_list_accounts` 도구 - 등록된 계정 목록
- [x] 6.1.4 `integration_get_env` 도구 - 환경 변수 조회
- [x] 6.1.5 `integration_get_test_account` 도구 - 테스트 계정 조회

## 7. Git 자동 설정

### 7.1 Git 계정 자동 적용

- [x] 7.1.1 프로젝트 열 때 해당 GitHub 계정의 git config 자동 적용
- [x] 7.1.2 credential helper 연동 (OS 기본 credential manager 사용)
- [x] 7.1.3 SSH 키 기반 인증 지원 (GitHub 계정에 SSH key path 저장)

## 8. 테스트 및 문서화

### 8.1 테스트 및 문서

- [x] 8.1.1 암호화 유틸리티 단위 테스트
- [x] 8.1.2 API 엔드포인트 통합 테스트 (기능 테스트로 대체)
- [x] 8.1.3 사용자 가이드 작성 (docs/mcp-tools.md)

<!-- All tasks completed: 2025-12-02 -->
