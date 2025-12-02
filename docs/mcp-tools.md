# ZyFlow MCP 도구 사용 가이드

ZyFlow MCP 서버는 Claude Code에서 직접 사용할 수 있는 다양한 도구를 제공합니다.

## 설정

### 전역 설정 (~/.claude.json)

```json
{
  "mcpServers": {
    "zyflow": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/zyflow/dist/mcp-server/index.js"],
      "env": {}
    }
  }
}
```

### 프로젝트별 설정 (.mcp.json)

```json
{
  "mcpServers": {
    "zyflow": {
      "command": "node",
      "args": ["/path/to/zyflow/dist/mcp-server/index.js"],
      "env": {
        "ZYFLOW_PROJECT": "/path/to/your/project"
      }
    }
  }
}
```

## OpenSpec 도구

### zyflow_list_changes

현재 프로젝트의 OpenSpec 변경 제안 목록을 조회합니다.

```
사용자: "현재 프로젝트의 변경 제안 목록을 보여줘"
Claude: [zyflow_list_changes 호출]
```

**반환값:**
- changes: 변경 제안 목록 (id, title, progress, totalTasks, completedTasks)
- projectPath: 프로젝트 경로

### zyflow_get_tasks

특정 변경 제안의 전체 태스크 목록을 그룹별로 조회합니다.

**파라미터:**
- `changeId` (필수): 변경 제안 ID

```
사용자: "add-user-auth 변경 제안의 태스크 목록을 보여줘"
Claude: [zyflow_get_tasks(changeId: "add-user-auth") 호출]
```

### zyflow_get_next_task

다음 미완료 태스크와 실행에 필요한 컨텍스트를 조회합니다.

**파라미터:**
- `changeId` (필수): 변경 제안 ID

```
사용자: "add-user-auth의 다음 태스크가 뭐야?"
Claude: [zyflow_get_next_task(changeId: "add-user-auth") 호출]
```

**반환값:**
- task: 다음 미완료 태스크
- context: proposal, spec, 관련 파일 정보
- group: 태스크가 속한 그룹 제목

### zyflow_get_task_context

특정 태스크의 상세 컨텍스트를 조회합니다.

**파라미터:**
- `changeId` (필수): 변경 제안 ID
- `taskId` (필수): 태스크 ID (예: task-1-1)

```
사용자: "task-1-1 태스크의 상세 컨텍스트를 보여줘"
Claude: [zyflow_get_task_context(changeId: "add-user-auth", taskId: "task-1-1") 호출]
```

### zyflow_mark_complete

태스크를 완료로 표시합니다. tasks.md 파일이 자동으로 업데이트됩니다.

**파라미터:**
- `changeId` (필수): 변경 제안 ID
- `taskId` (필수): 태스크 ID

```
사용자: "task-1-1 완료로 표시해줘"
Claude: [zyflow_mark_complete(changeId: "add-user-auth", taskId: "task-1-1") 호출]
```

### zyflow_mark_incomplete

태스크를 미완료로 되돌립니다.

**파라미터:**
- `changeId` (필수): 변경 제안 ID
- `taskId` (필수): 태스크 ID

---

## 태스크 관리 도구

### task_create

새 태스크를 생성합니다. ID는 순차 번호로 자동 생성됩니다 (TASK-1, TASK-2, ...).

**파라미터:**
- `title` (필수): 태스크 제목
- `description` (선택): 태스크 설명
- `priority` (선택): 우선순위 (`low`, `medium`, `high`)
- `tags` (선택): 태그 배열
- `assignee` (선택): 담당자

```
사용자: "API 응답 시간 개선하는 태스크 만들어줘"
Claude: [task_create(title: "API 응답 시간 개선", priority: "high", tags: ["performance"]) 호출]
```

### task_list

태스크 목록을 조회합니다.

**파라미터:**
- `status` (선택): 상태 필터 (`todo`, `in-progress`, `review`, `done`, `archived`)
- `priority` (선택): 우선순위 필터
- `tags` (선택): 태그 필터 (쉼표 구분)
- `kanban` (선택): `true`면 상태별로 그룹화

```
사용자: "진행 중인 태스크 목록 보여줘"
Claude: [task_list(status: "in-progress") 호출]
```

### task_view

태스크 상세 정보를 조회합니다.

**파라미터:**
- `id` (필수): 태스크 ID

### task_update

태스크를 수정합니다.

**파라미터:**
- `id` (필수): 태스크 ID
- `title` (선택): 새 제목
- `description` (선택): 새 설명
- `status` (선택): 새 상태
- `priority` (선택): 새 우선순위
- `tags` (선택): 새 태그
- `assignee` (선택): 새 담당자

```
사용자: "TASK-1 상태를 진행 중으로 바꿔줘"
Claude: [task_update(id: "TASK-1", status: "in-progress") 호출]
```

### task_search

태스크를 검색합니다 (FTS5 전문 검색).

**파라미터:**
- `query` (필수): 검색 쿼리
- `status` (선택): 상태 필터
- `priority` (선택): 우선순위 필터
- `limit` (선택): 최대 결과 수
- `includeArchived` (선택): 아카이브 포함 여부

```
사용자: "API 관련 태스크 검색해줘"
Claude: [task_search(query: "API") 호출]
```

### task_delete

태스크를 삭제합니다.

**파라미터:**
- `id` (필수): 태스크 ID

### task_archive

완료된 태스크를 아카이브로 이동합니다.

**파라미터:**
- `id` (필수): 태스크 ID

### task_unarchive

아카이브된 태스크를 복원합니다 (상태: done).

**파라미터:**
- `id` (필수): 태스크 ID

---

## Change Log & Replay 도구

### get_events

변경 이벤트를 조회합니다.

**파라미터:**
- `event_types` (선택): 이벤트 타입 필터 배열
- `severities` (선택): 심각도 필터 배열
- `sources` (선택): 소스 필터 배열
- `project_ids` (선택): 프로젝트 ID 필터 배열
- `change_ids` (선택): Change ID 필터 배열
- `time_range` (선택): 시간 범위 (`{ start: ISO, end: ISO }`)
- `limit` (선택): 최대 결과 수
- `offset` (선택): 건너뛸 결과 수
- `sort_by` (선택): 정렬 옵션 (`{ field, direction }`)

### get_event_statistics

이벤트 통계를 조회합니다.

**파라미터:**
- `event_types` (선택): 이벤트 타입 필터 배열
- `time_range` (선택): 시간 범위

### search_events

텍스트로 이벤트를 검색합니다.

**파라미터:**
- `query` (필수): 검색 쿼리
- `event_types` (선택): 이벤트 타입 필터 배열
- `time_range` (선택): 시간 범위

### export_events

이벤트를 내보냅니다.

**파라미터:**
- `filter` (선택): 이벤트 필터 (get_events와 동일)
- `format` (선택): 내보내기 형식 (`JSON`, `CSV`, `SQL`)

### create_replay_session

리플레이 세션을 생성합니다.

**파라미터:**
- `name` (필수): 세션 이름
- `description` (선택): 세션 설명
- `filter` (선택): 이벤트 필터
- `mode` (선택): 리플레이 모드 (`SAFE`, `FAST`, `VERBOSE`, `DRY_RUN`)
- `strategy` (선택): 리플레이 전략 (`SEQUENTIAL`, `PARALLEL`, `DEPENDENCY_AWARE`, `SELECTIVE`)
- `stop_on_error` (선택): 에러 시 중지 여부
- `enable_validation` (선택): 검증 활성화 여부
- `enable_rollback` (선택): 롤백 활성화 여부
- `max_concurrency` (선택): 병렬 실행 시 최대 동시성
- `skip_events` (선택): 건너뛸 이벤트 ID 배열
- `include_events` (선택): 포함할 이벤트 ID 배열

### start_replay

리플레이 세션을 시작합니다.

**파라미터:**
- `session_id` (필수): 세션 ID

### get_replay_progress

리플레이 진행 상황을 조회합니다.

**파라미터:**
- `session_id` (필수): 세션 ID

---

## 사용 예시

### 연속 태스크 실행 워크플로우

```
사용자: "add-user-auth 변경 제안의 다음 태스크를 실행해줘"

Claude: [zyflow_get_next_task(changeId: "add-user-auth") 호출]
        다음 태스크: "사용자 인증 API 엔드포인트 구현"

        [작업 수행...]

        완료했습니다. 태스크를 완료로 표시할까요?

사용자: "응"

Claude: [zyflow_mark_complete(changeId: "add-user-auth", taskId: "task-2-1") 호출]
        태스크가 완료되었습니다. (8/10 완료)
```

### 독립 태스크 관리

```
사용자: "버그 수정 태스크를 만들어줘: 로그인 시 세션 만료 문제"

Claude: [task_create(
          title: "버그 수정: 로그인 시 세션 만료 문제",
          priority: "high",
          tags: ["bug", "auth"]
        ) 호출]

        태스크 TASK-15가 생성되었습니다.

사용자: "작업 시작할게"

Claude: [task_update(id: "TASK-15", status: "in-progress") 호출]
        TASK-15 상태가 "in-progress"로 변경되었습니다.
```

### 칸반 보드 조회

```
사용자: "현재 태스크 현황을 칸반 형식으로 보여줘"

Claude: [task_list(kanban: true) 호출]

        ## Todo (3개)
        - TASK-10: API 문서 작성
        - TASK-11: 테스트 케이스 추가
        - TASK-12: 성능 최적화

        ## In Progress (2개)
        - TASK-13: 인증 버그 수정
        - TASK-14: UI 개선

        ## Done (5개)
        - TASK-1 ~ TASK-9
```
