# UI Components Spec

## ADDED Requirements

### Requirement: 사이드바에 프로젝트 Settings 메뉴 추가

시스템은 프로젝트 확장 시 Inbox 아래에 Settings 메뉴 항목을 추가해야 합니다(SHALL).

**메뉴 순서**: Changes → Inbox → Settings

#### Scenario: Settings 메뉴 클릭

- Given: 프로젝트가 확장된 상태
- When: Settings 메뉴 클릭
- Then: 해당 프로젝트의 Settings 페이지가 StageContent에 표시됨

#### Scenario: 다른 프로젝트 선택 시

- Given: 프로젝트 A의 Settings 페이지가 표시된 상태
- When: 프로젝트 B 선택
- Then: Settings 상태가 초기화됨

---

### Requirement: ProjectSettings 페이지 컴포넌트

시스템은 프로젝트별 설정을 관리하는 페이지 컴포넌트를 제공해야 합니다(SHALL).

**구성 섹션**:
- Integrations: 서비스 연결 상태
- Environments: 환경 변수 파일
- Test Accounts: 테스트 계정

#### Scenario: Settings 페이지 렌더링

- Given: 프로젝트 ID가 선택된 상태
- When: ProjectSettings 컴포넌트 마운트
- Then: 해당 프로젝트의 Integration 정보가 표시됨

#### Scenario: 로컬/전역 source 표시

- Given: 프로젝트에 로컬 설정(`.zyflow/`)이 있음
- When: Settings 페이지 로드
- Then: 각 항목에 "Local" 또는 "Global" 배지가 표시됨

---

### Requirement: Integrations 섹션

시스템은 서비스별 연결 상태를 표시하는 섹션을 제공해야 합니다(SHALL).

**표시 항목**:
- GitHub 연결 상태
- Supabase 연결 상태
- Vercel 연결 상태
- Sentry 연결 상태

#### Scenario: 연결된 서비스 표시

- Given: GitHub 계정이 프로젝트에 연결됨
- When: Integrations 섹션 로드
- Then: GitHub이 "connected" 상태로 표시됨

#### Scenario: 미연결 서비스 표시

- Given: Sentry 계정이 연결되지 않음
- When: Integrations 섹션 로드
- Then: Sentry가 "not connected" 상태로 표시됨

---

### Requirement: Environments 섹션

시스템은 프로젝트 환경 변수 파일 목록을 표시하는 섹션을 제공해야 합니다(SHALL).

#### Scenario: 환경 목록 표시

- Given: `.zyflow/environments/`에 local.env, staging.env 파일 존재
- When: Environments 섹션 로드
- Then: local, staging 환경이 목록에 표시됨

#### Scenario: 환경 변수 개수 표시

- Given: local.env에 5개의 변수 정의됨
- When: Environments 섹션 로드
- Then: "local (5 variables)"로 표시됨

---

### Requirement: Test Accounts 섹션

시스템은 테스트 계정 목록을 표시하는 섹션을 제공해야 합니다(SHALL).

#### Scenario: 테스트 계정 목록 표시

- Given: test-accounts.json에 admin, user 계정 정의됨
- When: Test Accounts 섹션 로드
- Then: 두 계정이 역할과 함께 표시됨

---

## MODIFIED Requirements

### Requirement: StageContent 렌더링 조건 추가

StageContent는 selectedProjectSettings 상태에 따라 ProjectSettings 컴포넌트를 렌더링해야 합니다(SHALL).

#### Scenario: Settings 페이지 렌더링

- Given: selectedProjectSettings가 설정됨
- When: StageContent 렌더링
- Then: ProjectSettings 컴포넌트가 표시됨

#### Scenario: 다른 콘텐츠 선택 시

- Given: Settings 페이지가 표시된 상태
- When: Change 선택
- Then: Change 페이지가 표시되고 Settings 상태 초기화됨

---

### Requirement: 앱 상태 확장

AppState는 프로젝트 Settings 관련 상태를 포함해야 합니다(SHALL).

#### Scenario: Settings 상태 설정

- Given: 초기 상태 (selectedProjectSettings: null)
- When: selectProjectSettings("project-123") 호출
- Then: selectedProjectSettings가 "project-123"으로 설정됨

#### Scenario: Settings 상태 초기화

- Given: selectedProjectSettings가 설정된 상태
- When: clearProjectSettings() 호출
- Then: selectedProjectSettings가 null로 초기화됨
