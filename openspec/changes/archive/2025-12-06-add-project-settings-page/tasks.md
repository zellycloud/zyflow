# Tasks: add-project-settings-page

## 1. 상태 관리 확장

### 1.1 앱 상태 추가
- [x] `SelectedItem` 타입에 `project-settings` 추가
- [x] `FlowSidebar`에서 `handleSelectProjectSettings` 핸들러 추가

## 2. 사이드바 수정

### 2.1 Settings 메뉴 항목 추가
- [x] `FlowSidebar.tsx`에 Settings 메뉴 항목 추가
- [x] Inbox 아래에 Settings 배치 (순서: Changes → Inbox → Settings)
- [x] Settings 아이콘 추가 (`Settings` from lucide-react)
- [x] 클릭 시 `handleSelectProjectSettings(project.id)` 호출

## 3. 프로젝트 Settings 페이지

### 3.1 컴포넌트 생성
- [x] `ProjectSettings.tsx` 생성 - 메인 Settings 페이지
- [x] Integrations, Environments, Test Accounts 섹션 통합

### 3.2 Integrations 섹션 구현
- [x] 서비스 연결 상태 표시 (GitHub, Supabase, Vercel, Sentry)
- [x] 로컬/전역 source 배지 표시
- [x] 계정 매핑 정보 표시

### 3.3 Environments 섹션 구현
- [x] 환경 목록 표시 (local, staging, production 등)
- [x] 각 환경의 변수 유무 표시
- [x] 로컬/전역 source 표시

### 3.4 Test Accounts 섹션 구현
- [x] 테스트 계정 목록 표시
- [x] 역할별 표시 (admin, user 등)
- [x] 로컬/전역 source 표시

## 4. FlowContent 연동

### 4.1 렌더링 조건 추가
- [x] `selectedItem.type === 'project-settings'` 케이스 추가
- [x] ProjectSettings 컴포넌트 렌더링

### 4.2 상태 전환 처리
- [x] 기존 프로젝트 전환 로직 활용 (activeProjectId 체크)

## 5. 기존 코드 정리

### 5.1 ProjectsSettings.tsx 리팩토링
- [x] 프로젝트별 Integration 로직 분리 (선택적)
- [x] 공통 컴포넌트 추출 (IntegrationBadges.tsx) (선택적)

### 5.2 전역 Settings 탭 조정
- [x] Integrations 탭 → Accounts 탭으로 이름 변경 (선택적)
- [x] 프로젝트별 기능 안내 메시지 추가 (선택적)

## 6. 타입 정의

### 6.1 타입 추가
- [x] `SelectedItem` 타입에 `project-settings` 추가 (App.tsx)
- [x] 기존 `SettingsSource`, `LocalSettingsStatus` 타입 재사용

## 7. 테스트 및 검증

### 7.1 기능 테스트
- [x] TypeScript 타입 체크 통과
- [x] ESLint 검사 통과 (새 파일)
- [x] Settings 메뉴 클릭 동작 확인 (수동 테스트)
- [x] 페이지 렌더링 확인 (수동 테스트)

### 7.2 UI 검증
- [x] 로컬/전역 source 배지 표시 확인 (수동 테스트)
- [x] 섹션 펼침/접힘 동작 확인 (수동 테스트)

## 8. 추가 개선 (완료)

### 8.1 서비스 계정 환경 선택 기능
- [x] DB 스키마에 `service_accounts.environment` 컬럼 추가 (staging/production/null)
- [x] 서버 API에 environment 필드 처리 추가 (create, update, list)
- [x] 프론트엔드 타입 수정 (`AccountEnvironment` 타입, `ServiceAccount` 인터페이스)
- [x] ServiceAccountDialog에 환경 선택 드롭다운 추가 (모든 환경/Staging/Production)
- [x] ServiceAccountList에 환경 배지 표시 (Production: 빨간색, Staging: 노란색)
