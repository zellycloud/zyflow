## ADDED Requirements

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

#### Scenario: 프로젝트 컨텍스트 조회

- **GIVEN** 프로젝트 "zywiki"에 GitHub, Supabase가 연결되어 있다
- **WHEN** AI가 `integration_context` 도구를 호출한다
- **THEN** 연결된 서비스 정보(토큰 제외), 환경 목록, 테스트 계정 이메일이 반환된다

#### Scenario: Git 설정 자동 적용

- **GIVEN** 프로젝트 "admin-console"이 GitHub "hansooha"에 연결되어 있다
- **WHEN** AI가 `integration_apply_git` 도구를 호출한다
- **THEN** 해당 디렉토리의 git config가 hansooha 계정으로 설정된다

---

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
