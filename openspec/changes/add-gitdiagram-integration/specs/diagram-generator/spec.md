## ADDED Requirements

### Requirement: Diagram Generation from Repository

시스템은 로컬 저장소 경로를 입력받아 Mermaid.js 형식의 시스템 아키텍처 다이어그램을 생성해야 한다(SHALL).

#### Scenario: 프로젝트 다이어그램 생성 성공

- **GIVEN** 유효한 로컬 저장소 경로
- **WHEN** `diagram_generate` MCP 도구가 호출되면
- **THEN** 파일 트리와 README를 분석하여 Mermaid 다이어그램 코드를 반환한다
- **AND** 다이어그램의 각 컴포넌트는 실제 파일/디렉토리 경로와 매핑된다

#### Scenario: 대규모 저장소 토큰 제한

- **GIVEN** 파일 트리가 50,000 토큰을 초과하는 저장소
- **WHEN** 다이어그램 생성이 요청되면
- **THEN** 주요 디렉토리만 포함하여 토큰 제한 내에서 처리한다
- **AND** 제외된 항목에 대한 경고를 반환한다

#### Scenario: README가 없는 저장소

- **GIVEN** README.md 파일이 없는 저장소
- **WHEN** 다이어그램 생성이 요청되면
- **THEN** 파일 트리만으로 다이어그램을 생성한다
- **AND** 정확도가 낮을 수 있다는 경고를 포함한다

---

### Requirement: Three-Stage Prompt Pipeline

다이어그램 생성은 3단계 프롬프트 파이프라인을 통해 수행되어야 한다(MUST).

#### Scenario: Stage 1 - 아키텍처 설명 생성

- **GIVEN** 파일 트리와 README 내용
- **WHEN** 첫 번째 프롬프트가 실행되면
- **THEN** 프로젝트 타입, 주요 컴포넌트, 상호작용을 텍스트로 설명한다

#### Scenario: Stage 2 - 컴포넌트 매핑

- **GIVEN** Stage 1의 설명
- **WHEN** 두 번째 프롬프트가 실행되면
- **THEN** 설명된 컴포넌트를 실제 파일/디렉토리 경로에 매핑한다

#### Scenario: Stage 3 - Mermaid 코드 생성

- **GIVEN** Stage 1 설명과 Stage 2 매핑
- **WHEN** 세 번째 프롬프트가 실행되면
- **THEN** 유효한 Mermaid flowchart 코드를 생성한다
- **AND** 클릭 이벤트로 파일 경로를 연결한다

---

### Requirement: LLM Provider Abstraction

시스템은 여러 LLM 제공자를 지원하여 다이어그램을 생성해야 한다(SHALL).

#### Scenario: Claude API 사용 (기본값)

- **GIVEN** `ANTHROPIC_API_KEY` 환경변수가 설정됨
- **WHEN** 다이어그램 생성이 요청되면
- **THEN** Claude API를 사용하여 다이어그램을 생성한다

#### Scenario: OpenAI API 사용 (대체)

- **GIVEN** `OPENAI_API_KEY` 환경변수가 설정되고 Claude 키가 없음
- **WHEN** 다이어그램 생성이 요청되면
- **THEN** OpenAI API (o4-mini)를 사용하여 다이어그램을 생성한다

#### Scenario: API 키 미설정

- **GIVEN** LLM API 키가 설정되지 않음
- **WHEN** 다이어그램 생성이 요청되면
- **THEN** 적절한 에러 메시지와 함께 설정 가이드를 반환한다

---

### Requirement: MCP Tool Integration

MCP 서버에 다이어그램 생성 도구가 노출되어야 한다(MUST).

#### Scenario: diagram_generate 도구 호출

- **GIVEN** MCP 클라이언트 (Claude Code)
- **WHEN** `diagram_generate` 도구를 호출하면
- **THEN** 저장소 경로를 입력받아 Mermaid 코드를 반환한다

#### Scenario: diagram_from_change 도구 호출

- **GIVEN** OpenSpec 변경 ID
- **WHEN** `diagram_from_change` 도구를 호출하면
- **THEN** 변경에 영향받는 파일을 하이라이트한 다이어그램을 반환한다

---

### Requirement: Mermaid Rendering in Frontend

프론트엔드에서 생성된 Mermaid 다이어그램을 렌더링해야 한다(SHALL).

#### Scenario: 다이어그램 렌더링

- **GIVEN** 유효한 Mermaid 코드
- **WHEN** DiagramViewer 컴포넌트에 전달되면
- **THEN** SVG로 렌더링하여 화면에 표시한다

#### Scenario: 인터랙티브 네비게이션

- **GIVEN** 렌더링된 다이어그램
- **WHEN** 컴포넌트를 클릭하면
- **THEN** 해당 파일/디렉토리로 네비게이션한다

#### Scenario: 줌/팬 컨트롤

- **GIVEN** 렌더링된 다이어그램
- **WHEN** 마우스 휠 또는 드래그 조작 시
- **THEN** 다이어그램을 줌인/줌아웃하거나 이동할 수 있다

---

### Requirement: Upstream Synchronization

GitDiagram 업스트림 변경을 추적하고 반영할 수 있어야 한다(SHALL).

#### Scenario: 업스트림 버전 추적

- **GIVEN** `packages/gitdiagram-core/package.json`
- **WHEN** upstream 필드를 확인하면
- **THEN** 포팅된 GitDiagram 커밋 해시와 동기화 날짜를 확인할 수 있다

#### Scenario: 업스트림 변경 감지

- **GIVEN** 동기화 체크 스크립트 실행
- **WHEN** GitDiagram 저장소에 새 커밋이 있으면
- **THEN** 경고 메시지로 업데이트가 필요함을 알린다
