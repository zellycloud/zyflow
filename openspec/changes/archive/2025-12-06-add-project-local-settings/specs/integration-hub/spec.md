# integration-hub Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
