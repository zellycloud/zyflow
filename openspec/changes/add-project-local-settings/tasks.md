# Tasks: add-project-local-settings

## 1. 로컬 설정 파일 구조 정의

### 1.1 타입 및 스키마 정의
- [x] `LocalSettings` 타입 정의 (settings.json 구조)
- [x] `LocalTestAccounts` 타입 정의
- [x] 환경 변수 파일 파서 구현

### 1.2 파일 유틸리티
- [x] `getProjectZyflowPath(projectPath)` - .zyflow 경로 반환
- [x] `ensureZyflowDir(projectPath)` - 디렉토리 생성
- [x] `loadLocalSettings(projectPath)` - settings.json 읽기
- [x] `loadLocalEnvironment(projectPath, envName)` - .env 파일 읽기
- [x] `loadLocalTestAccounts(projectPath)` - test-accounts.json 읽기

## 2. Settings Resolver 구현

### 2.1 통합 리졸버
- [x] `SettingsResolver` 클래스 생성
- [x] 로컬 → 전역 fallback 로직 구현
- [x] 계정 UUID → 실제 credential 해석

### 2.2 기존 서비스 통합
- [ ] `getProjectIntegration()` 수정 - 로컬 우선 조회
- [ ] `getProjectEnvironments()` 수정 - 로컬 환경 파일 지원
- [ ] `getProjectTestAccounts()` 수정 - 로컬 파일 지원

## 3. MCP 도구 업데이트

### 3.1 컨텍스트 조회 수정
- [x] `integration_context` - 로컬 설정 우선 조회
- [x] `integration_get_env` - 로컬 환경 파일 지원
- [x] `integration_get_test_account` - 로컬 파일 지원

### 3.2 새 도구 추가
- [ ] `integration_init_local` - 프로젝트에 .zyflow 초기화
- [ ] `integration_export_to_local` - 전역에서 로컬로 내보내기

## 4. API 라우트 수정

### 4.1 조회 API 수정
- [ ] `GET /projects/:projectId/context` - 로컬 우선
- [ ] `GET /projects/:projectId/environments` - 로컬 환경 파일 포함
- [ ] `GET /projects/:projectId/test-accounts` - 로컬 파일 포함

### 4.2 설정 소스 표시
- [ ] 응답에 `source: 'local' | 'global'` 필드 추가
- [ ] 하이브리드 상태 표시 (일부 로컬, 일부 전역)

## 5. UI 업데이트

### 5.1 설정 소스 표시
- [ ] 프로젝트 설정에서 로컬/전역 배지 표시
- [ ] 환경 목록에서 소스 구분

### 5.2 내보내기 기능
- [ ] "Export to Project" 버튼 추가
- [ ] 내보내기 확인 다이얼로그
- [ ] 내보내기 결과 표시

## 6. 테스트 및 문서

### 6.1 테스트
- [ ] 로컬 설정 파일 읽기 테스트
- [ ] Fallback 로직 테스트
- [ ] 마이그레이션 시나리오 테스트

### 6.2 문서
- [ ] .zyflow 디렉토리 구조 문서화
- [ ] .gitignore 권장 패턴 문서화
