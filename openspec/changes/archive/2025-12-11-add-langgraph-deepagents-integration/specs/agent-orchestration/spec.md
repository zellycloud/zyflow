## ADDED Requirements

### Requirement: Agent Execution Engine

시스템은 OpenSpec 변경 제안의 태스크를 LangGraph 기반 에이전트로 자동 실행할 수 있어야 합니다(SHALL).

#### Scenario: 변경 제안 자동 실행
- **GIVEN** 승인된 OpenSpec 변경 제안이 있을 때
- **WHEN** 사용자가 에이전트 실행을 시작하면
- **THEN** LangGraph StateGraph가 생성되어 태스크를 순차 실행합니다
- **AND** 각 태스크 완료 시 tasks.md가 자동 업데이트됩니다

#### Scenario: 실행 중단 및 재개
- **GIVEN** 에이전트가 태스크를 실행 중일 때
- **WHEN** 사용자가 실행을 중단하면
- **THEN** 현재 상태가 체크포인트로 저장됩니다
- **AND** 나중에 해당 체크포인트에서 재개할 수 있습니다

#### Scenario: 에러 복구
- **GIVEN** 태스크 실행 중 에러가 발생했을 때
- **WHEN** 에러가 감지되면
- **THEN** 실행이 중단되고 에러 상태가 기록됩니다
- **AND** 사용자는 에러를 확인하고 재시도하거나 건너뛸 수 있습니다

---

### Requirement: OpenSpec Context Injection

DeepAgent는 OpenSpec 문서(proposal, design, spec)를 컨텍스트로 활용해야 합니다(MUST).

#### Scenario: 컨텍스트 자동 주입
- **GIVEN** OpenSpec 변경 제안이 선택되었을 때
- **WHEN** DeepAgent가 초기화되면
- **THEN** proposal.md 내용이 시스템 프롬프트에 포함됩니다
- **AND** design.md 결정사항이 참조 가능합니다
- **AND** spec.md 시나리오가 검증 기준으로 활용됩니다

#### Scenario: 태스크별 컨텍스트
- **GIVEN** 특정 태스크를 실행할 때
- **WHEN** 태스크에 관련 파일이 지정되어 있으면
- **THEN** 해당 파일들이 에이전트 컨텍스트에 포함됩니다

---

### Requirement: Agent Session Management

시스템은 에이전트 실행 세션을 관리해야 합니다(SHALL).

#### Scenario: 세션 생성
- **GIVEN** 사용자가 에이전트 실행을 요청할 때
- **WHEN** 실행이 시작되면
- **THEN** 고유한 세션 ID가 생성됩니다
- **AND** 세션 상태가 "running"으로 설정됩니다

#### Scenario: 세션 상태 조회
- **GIVEN** 실행 중인 세션이 있을 때
- **WHEN** 상태를 조회하면
- **THEN** 현재 진행 중인 태스크, 완료된 태스크 수, 전체 진행률이 반환됩니다

#### Scenario: 프로젝트당 세션 제한
- **GIVEN** 프로젝트에 이미 실행 중인 세션이 있을 때
- **WHEN** 새로운 실행을 시작하려고 하면
- **THEN** 기존 세션을 중단하거나 대기할지 선택할 수 있습니다

---

### Requirement: Real-time Execution Streaming

에이전트 실행 과정을 실시간으로 스트리밍해야 합니다(SHALL).

#### Scenario: SSE 스트리밍
- **GIVEN** 에이전트가 실행 중일 때
- **WHEN** 클라이언트가 스트림에 연결하면
- **THEN** 실행 이벤트(task_start, task_complete, log, error)가 실시간으로 전송됩니다

#### Scenario: LLM 응답 스트리밍
- **GIVEN** 에이전트가 LLM에 요청 중일 때
- **WHEN** LLM이 응답을 생성하면
- **THEN** 토큰 단위로 응답이 스트리밍됩니다

---

### Requirement: Agent MCP Tools

Claude Code에서 에이전트를 제어할 수 있는 MCP 도구를 제공해야 합니다(SHALL).

#### Scenario: MCP로 실행 시작
- **GIVEN** Claude Code에서 ZyFlow MCP 서버에 연결되어 있을 때
- **WHEN** zyflow_execute_change 도구를 호출하면
- **THEN** 지정된 변경 제안의 에이전트 실행이 시작됩니다
- **AND** 세션 ID가 반환됩니다

#### Scenario: MCP로 상태 조회
- **GIVEN** 실행 중인 세션이 있을 때
- **WHEN** zyflow_get_agent_status 도구를 호출하면
- **THEN** 현재 세션의 상태와 진행률이 반환됩니다

#### Scenario: MCP로 실행 제어
- **GIVEN** 실행 중인 세션이 있을 때
- **WHEN** zyflow_stop_agent 또는 zyflow_resume_agent를 호출하면
- **THEN** 세션이 중단되거나 재개됩니다

---

### Requirement: Agent UI Integration

ZyFlow UI에서 에이전트와 상호작용할 수 있어야 합니다(SHALL).

#### Scenario: 채팅 인터페이스
- **GIVEN** 에이전트 페이지에 접근했을 때
- **WHEN** 사용자가 메시지를 입력하면
- **THEN** 에이전트가 응답하고 대화 기록이 표시됩니다

#### Scenario: 실행 상태 시각화
- **GIVEN** 에이전트가 실행 중일 때
- **WHEN** UI를 확인하면
- **THEN** 현재 진행 중인 태스크, Todo 리스트, 생성된 파일 목록이 표시됩니다

#### Scenario: 파일 뷰어
- **GIVEN** 에이전트가 파일을 생성/수정했을 때
- **WHEN** 파일 목록에서 파일을 선택하면
- **THEN** 구문 강조가 적용된 파일 내용이 표시됩니다

---

### Requirement: Multi-CLI Support

시스템은 다양한 CLI 기반 에이전트를 지원해야 합니다(SHALL).

#### Scenario: CLI 선택
- **GIVEN** 에이전트 페이지에 접근했을 때
- **WHEN** 사용자가 CLI를 선택하면
- **THEN** Claude Code, Gemini CLI, Qwen CLI, Kilo Code, OpenCode 중 하나를 선택할 수 있습니다
- **AND** 선택한 CLI가 기본값으로 저장됩니다

#### Scenario: CLI 프로세스 관리
- **GIVEN** CLI가 선택되어 있을 때
- **WHEN** 에이전트 실행이 시작되면
- **THEN** 해당 CLI 프로세스가 스폰되어 MCP 서버에 연결됩니다
- **AND** stdin/stdout 스트리밍이 UI에 표시됩니다

#### Scenario: 커스텀 CLI 등록
- **GIVEN** 사용자가 다른 MCP 호환 CLI를 사용하려고 할 때
- **WHEN** 커스텀 CLI 등록 다이얼로그를 열면
- **THEN** 명령어, 인자, MCP 플래그를 설정할 수 있습니다
- **AND** 등록된 CLI가 선택 목록에 추가됩니다

#### Scenario: CLI 전환
- **GIVEN** 에이전트 세션이 종료된 상태에서
- **WHEN** 다른 CLI를 선택하면
- **THEN** 다음 실행부터 새로운 CLI가 사용됩니다
- **AND** 기존 MCP 연결 설정은 그대로 유지됩니다
