# integration-hub Specification

## Purpose
TBD - created by archiving change add-integration-hub. Update Purpose after archive.
## Requirements
### Requirement: Service Account Management

시스템은 다양한 외부 서비스의 계정 정보를 중앙에서 관리할 수 있어야 한다(SHALL).

시스템은 다음 서비스 타입을 지원해야 한다(MUST):
- GitHub (username, PAT, SSH key path)
- Supabase (project URL, anon key, service role key)
- Vercel (token, team ID)
- Sentry (DSN, auth token, org slug, project slug)
- Custom (사용자 정의 key-value)

#### Scenario: GitHub 계정 등록

- **GIVEN** 사용자가 Integrations 설정 페이지에 있다
- **WHEN** GitHub 서비스 계정을 추가하고 username과 PAT를 입력한다
- **THEN** 계정이 암호화되어 저장되고 목록에 표시된다

#### Scenario: 서비스 계정 수정

- **GIVEN** 등록된 GitHub 계정 "hansooha"가 있다
- **WHEN** 해당 계정의 PAT를 새 값으로 변경한다
- **THEN** 새 토큰이 암호화되어 저장된다

#### Scenario: 서비스 계정 삭제

- **GIVEN** 등록된 계정이 프로젝트에 연결되어 있지 않다
- **WHEN** 계정을 삭제한다
- **THEN** 계정이 영구 삭제된다

#### Scenario: 연결된 계정 삭제 시도

- **GIVEN** 등록된 계정이 하나 이상의 프로젝트에 연결되어 있다
- **WHEN** 계정을 삭제하려고 한다
- **THEN** 경고 메시지가 표시되고 연결된 프로젝트 목록을 보여준다

---

### Requirement: Project Integration Mapping

시스템은 각 프로젝트가 사용할 서비스 계정을 지정할 수 있어야 한다(SHALL).

#### Scenario: 프로젝트에 GitHub 계정 연결

- **GIVEN** 프로젝트 "zywiki"와 GitHub 계정 "zellycloud"가 있다
- **WHEN** 프로젝트 설정에서 GitHub 연동을 "zellycloud"로 선택한다
- **THEN** 해당 프로젝트는 zellycloud 계정을 사용하도록 매핑된다

#### Scenario: 프로젝트 연동 현황 조회

- **GIVEN** 여러 프로젝트가 다양한 서비스에 연결되어 있다
- **WHEN** Settings > Integrations의 Project Mappings 섹션을 본다
- **THEN** 각 프로젝트별로 연결된 서비스 계정이 한눈에 표시된다

---

### Requirement: Environment Configuration

시스템은 프로젝트별로 환경(local, staging, production)에 따른 설정을 관리할 수 있어야 한다(SHALL).

#### Scenario: 환경 설정 추가

- **GIVEN** 프로젝트 "zywiki"가 있다
- **WHEN** staging 환경을 추가하고 서버 URL과 DB URL을 입력한다
- **THEN** 환경 설정이 암호화되어 저장된다

#### Scenario: 현재 환경 선택

- **GIVEN** 프로젝트에 local, staging, production 환경이 설정되어 있다
- **WHEN** 사용자가 "staging"을 현재 환경으로 선택한다
- **THEN** 해당 환경의 설정이 활성화되고 컨텍스트에 반영된다

#### Scenario: 환경 변수 조회

- **GIVEN** staging 환경에 `DATABASE_URL`이 설정되어 있다
- **WHEN** MCP 도구로 환경 변수를 조회한다
- **THEN** 해당 환경의 변수 값이 반환된다

---

### Requirement: Test Account Management

시스템은 프로젝트별 테스트 계정 정보를 저장하고 관리할 수 있어야 한다(SHALL).

#### Scenario: 테스트 계정 등록

- **GIVEN** 프로젝트 "zywiki"가 있다
- **WHEN** admin 역할의 테스트 계정 (email, password)을 등록한다
- **THEN** 비밀번호가 암호화되어 저장된다

#### Scenario: 테스트 계정 조회 (UI)

- **GIVEN** 테스트 계정이 등록되어 있다
- **WHEN** 프로젝트 상세의 Test Accounts 섹션을 본다
- **THEN** 이메일은 보이고 비밀번호는 마스킹(••••)되어 표시된다

#### Scenario: 테스트 계정 비밀번호 복사

- **GIVEN** 테스트 계정의 비밀번호가 마스킹되어 있다
- **WHEN** 복사 버튼을 클릭한다
- **THEN** 원본 비밀번호가 클립보드에 복사된다

---

### Requirement: Secure Credential Storage

시스템은 모든 민감 정보를 암호화하여 저장해야 한다(MUST).

#### Scenario: 토큰 암호화 저장

- **GIVEN** 사용자가 GitHub PAT를 입력한다
- **WHEN** 저장 버튼을 클릭한다
- **THEN** 토큰은 AES-256-GCM으로 암호화되어 데이터베이스에 저장된다

#### Scenario: 마스터 키 관리 (macOS)

- **GIVEN** macOS 환경에서 앱을 처음 실행한다
- **WHEN** 암호화가 필요한 데이터를 저장한다
- **THEN** 마스터 키는 macOS Keychain에 안전하게 저장된다

#### Scenario: 민감 정보 UI 표시

- **GIVEN** 암호화된 API 키가 저장되어 있다
- **WHEN** UI에서 해당 정보를 표시한다
- **THEN** `sk-...****` 형태로 마스킹되어 표시된다

---

### Requirement: MCP Integration Tools

시스템은 AI 어시스턴트가 프로젝트 컨텍스트를 자동으로 조회할 수 있는 MCP 도구를 제공해야 한다(SHALL).

기존 요구사항에 다음 시나리오를 추가한다:

#### Scenario: 설정 소스 표시

- **GIVEN** 프로젝트에 로컬 설정이 있다
- **WHEN** AI가 `integration_context` 도구를 호출한다
- **THEN** 응답에 설정 소스(`local` 또는 `global`)가 포함된다

#### Scenario: 하이브리드 설정 조회

- **GIVEN** 프로젝트의 계정 매핑은 로컬에 있다
- **AND** 테스트 계정은 전역 DB에만 있다
- **WHEN** `integration_context` 도구를 호출한다
- **THEN** 두 소스의 데이터가 병합되어 반환된다
- **AND** 각 섹션별 소스가 표시된다

### Requirement: Automatic Git Configuration

시스템은 프로젝트 디렉토리에서 자동으로 올바른 Git 계정을 설정해야 한다(SHALL).

#### Scenario: Git 계정 자동 감지

- **GIVEN** 프로젝트 "dev-convert"가 GitHub "hansooha"에 연결되어 있다
- **WHEN** 해당 프로젝트 디렉토리에서 git 작업을 수행한다
- **THEN** hansooha 계정의 인증 정보가 사용된다

#### Scenario: 멀티 계정 충돌 방지

- **GIVEN** "zywiki"는 zellycloud, "admin-console"은 hansooha에 연결되어 있다
- **WHEN** 각 프로젝트 디렉토리에서 git push를 수행한다
- **THEN** 각각 올바른 계정으로 인증된다

### Requirement: Project Local Settings

시스템은 프로젝트 디렉토리 내 `.zyflow/` 폴더에 설정을 저장하고 조회할 수 있어야 한다(SHALL).

로컬 설정은 다음 파일로 구성된다(MUST):
- `settings.json` - 계정 매핑 및 기본 환경 설정
- `environments/*.env` - 환경별 변수 파일
- `test-accounts.json` - 테스트 계정 (암호화)

#### Scenario: 로컬 설정 초기화

- **GIVEN** 프로젝트 "/Users/hansoo/myproject"가 있다
- **WHEN** `integration_init_local` 도구를 호출한다
- **THEN** `/Users/hansoo/myproject/.zyflow/` 디렉토리가 생성된다
- **AND** 기본 `settings.json` 파일이 생성된다

#### Scenario: 로컬 설정 우선 조회

- **GIVEN** 프로젝트에 `.zyflow/settings.json`이 있다
- **AND** 전역 DB에도 해당 프로젝트 설정이 있다
- **WHEN** `integration_context` 도구를 호출한다
- **THEN** 로컬 설정이 우선적으로 반환된다
- **AND** 응답에 `source: "local"` 필드가 포함된다

#### Scenario: 전역 설정 Fallback

- **GIVEN** 프로젝트에 `.zyflow/` 폴더가 없다
- **AND** 전역 DB에 해당 프로젝트 설정이 있다
- **WHEN** `integration_context` 도구를 호출한다
- **THEN** 전역 DB에서 설정이 반환된다
- **AND** 응답에 `source: "global"` 필드가 포함된다

---

### Requirement: Local Environment Files

시스템은 프로젝트 로컬의 `.env` 파일에서 환경 변수를 읽을 수 있어야 한다(SHALL).

#### Scenario: 로컬 환경 변수 조회

- **GIVEN** 프로젝트에 `.zyflow/environments/local.env` 파일이 있다
- **AND** 파일에 `DATABASE_URL=postgres://localhost/db`가 정의되어 있다
- **WHEN** `integration_get_env` 도구를 호출한다
- **THEN** `DATABASE_URL` 변수가 반환된다

#### Scenario: 환경 파일 선택

- **GIVEN** 프로젝트에 `local.env`, `staging.env`, `production.env`가 있다
- **AND** `settings.json`의 `defaultEnvironment`가 "staging"이다
- **WHEN** envId 없이 `integration_get_env`를 호출한다
- **THEN** `staging.env`의 변수가 반환된다

---

### Requirement: Export to Local

시스템은 전역 DB의 설정을 프로젝트 로컬로 내보낼 수 있어야 한다(SHALL).

#### Scenario: 전역 설정 내보내기

- **GIVEN** 전역 DB에 프로젝트 "myproject"의 설정이 있다
- **WHEN** UI에서 "Export to Project" 버튼을 클릭한다
- **THEN** 프로젝트의 `.zyflow/` 폴더에 설정 파일이 생성된다
- **AND** 환경 변수는 개별 `.env` 파일로 저장된다
- **AND** 테스트 계정은 암호화되어 저장된다

#### Scenario: MCP 도구로 내보내기

- **GIVEN** 전역 DB에 프로젝트 설정이 있다
- **WHEN** `integration_export_to_local` 도구를 호출한다
- **THEN** 로컬 설정 파일이 생성된다
- **AND** 생성된 파일 목록이 반환된다

