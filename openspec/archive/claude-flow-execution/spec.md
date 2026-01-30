# claude-flow-execution Specification

## Purpose
TBD - created by archiving change integrate-claude-flow. Update Purpose after archive.
## Requirements
### Requirement: 작업 실행 API

zyflow 서버는 claude-flow swarm을 실행하는 API 엔드포인트를 제공해야 합니다(MUST).

#### Scenario: Change 전체 실행 요청

Given 사용자가 특정 프로젝트의 Change를 선택한 상태
When POST /api/claude-flow/execute 요청을 보내면
  ```json
  {
    "projectPath": "/path/to/project",
    "changeId": "feature-name",
    "mode": "full"
  }
  ```
Then 새로운 실행 ID가 생성되고
And claude-flow swarm 프로세스가 시작되며
And 실행 ID와 초기 상태가 반환됩니다
  ```json
  {
    "id": "exec-uuid",
    "status": "running",
    "startedAt": "2024-12-18T..."
  }
  ```

#### Scenario: 단일 태스크 실행 요청

Given 사용자가 특정 태스크를 선택한 상태
When POST /api/claude-flow/execute 요청에 taskId를 포함하면
Then 해당 태스크만 실행 대상으로 프롬프트가 생성됩니다

#### Scenario: 분석 모드 실행

Given 사용자가 코드 변경 없이 분석만 원하는 경우
When mode를 "analysis"로 설정하면
Then claude-flow에 --analysis 플래그가 전달되어
And 읽기 전용으로 실행됩니다

### Requirement: 실시간 진행 상황 스트리밍

시스템은 실행 중인 작업의 진행 상황을 SSE로 클라이언트에 전달해야 합니다(MUST).

#### Scenario: SSE 스트림 연결

Given 실행이 시작된 상태
When GET /api/claude-flow/stream/:id 에 연결하면
Then SSE 이벤트로 로그가 실시간 전달됩니다
  ```
  event: log
  data: {"type":"assistant","content":"태스크 분석 중..."}

  event: log
  data: {"type":"tool_use","name":"Read","input":{...}}
  ```

#### Scenario: 실행 완료 이벤트

Given 실행이 진행 중인 상태
When claude-flow 프로세스가 종료되면
Then SSE로 complete 이벤트가 전송되고
And 연결이 종료됩니다

### Requirement: 프롬프트 빌더

시스템은 OpenSpec 문서를 기반으로 claude-flow에 전달할 프롬프트를 생성해야 합니다(MUST).

#### Scenario: 기본 프롬프트 생성

Given Change 디렉토리에 proposal.md와 tasks.md가 있을 때
When 프롬프트 빌더가 실행되면
Then 다음 섹션이 포함된 프롬프트가 생성됩니다:
  - 프로젝트 맥락 (CLAUDE.md 기반)
  - Change 정보 (proposal.md)
  - 현재 미완료 태스크 목록
  - 작업 지시사항

#### Scenario: 설계 문서 포함

Given Change 디렉토리에 design.md가 존재할 때
When 프롬프트가 생성되면
Then 설계 문서 섹션이 프롬프트에 포함됩니다

### Requirement: 실행 상태 관리

시스템은 실행 중인 작업의 상태를 조회하고 관리할 수 있어야 합니다(MUST).

#### Scenario: 상태 조회

Given 실행 ID가 존재할 때
When GET /api/claude-flow/status/:id 요청을 보내면
Then 현재 실행 상태가 반환됩니다
  ```json
  {
    "id": "exec-uuid",
    "status": "running",
    "progress": 45,
    "currentTask": "API 엔드포인트 구현"
  }
  ```

#### Scenario: 실행 중지

Given 실행이 진행 중일 때
When POST /api/claude-flow/stop/:id 요청을 보내면
Then claude-flow 프로세스가 종료되고
And 상태가 "stopped"로 변경됩니다

#### Scenario: 타임아웃 처리

Given 실행이 30분 이상 지속될 때
When 타임아웃이 발생하면
Then 프로세스가 자동 종료되고
And 상태가 "failed"로 변경되며
And 타임아웃 에러가 기록됩니다

### Requirement: 실행 히스토리

시스템은 과거 실행 기록을 저장하고 조회할 수 있어야 합니다(SHALL).

#### Scenario: 히스토리 조회

Given 이전에 여러 실행이 완료된 상태
When GET /api/claude-flow/history 요청을 보내면
Then 최근 실행 목록이 반환됩니다
  ```json
  {
    "executions": [
      {
        "id": "exec-1",
        "changeId": "feature-a",
        "status": "completed",
        "startedAt": "...",
        "completedAt": "..."
      }
    ]
  }
  ```

