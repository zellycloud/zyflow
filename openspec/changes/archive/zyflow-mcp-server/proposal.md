# ZyFlow MCP Server 구현

## 개요

ZyFlow를 MCP(Model Context Protocol) 서버로 구현하여 Claude Code에서 OpenSpec 태스크를 자동으로 실행할 수 있게 한다.

## 배경

### 현재 문제점

1. **CLI Spawn 방식의 한계**
   - 매번 새 Claude 세션 시작 → 컨텍스트 0에서 시작
   - CLAUDE.md, 코드 구조 등 매번 다시 읽어야 함
   - 토큰 사용량 ~12,000/태스크 (비효율)

2. **프롬프트 복사 방식의 한계**
   - 자동화 불가능 (수동 복사/붙여넣기)
   - 연속 태스크 실행 불편

3. **Hook 기반 방식의 한계**
   - 세션 경계에 의존 (세션 종료 후 다음 세션에서 이어받기)
   - 컨텍스트 단절
   - 복잡한 흐름 (디버깅 어려움)

### MCP 방식의 장점

- **컨텍스트 유지**: 기존 Claude 세션에서 MCP Tool 호출 → 100% 컨텍스트 보존
- **자동화**: "다음 5개 태스크 실행해줘" 한 마디로 연속 실행
- **토큰 효율**: ~2,500 토큰/태스크 (5배 절감)
- **안전성**: 사용자가 직접 승인 (dangerously-skip-permissions 불필요)

## 설계

### MCP Tools 정의

```typescript
tools: [
  {
    name: "zyflow_list_changes",
    description: "현재 프로젝트의 OpenSpec 변경 제안 목록 조회",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "zyflow_get_tasks",
    description: "특정 변경 제안의 태스크 목록 조회",
    inputSchema: {
      type: "object",
      properties: {
        changeId: { type: "string", description: "변경 제안 ID" }
      },
      required: ["changeId"]
    }
  },
  {
    name: "zyflow_get_next_task",
    description: "다음 미완료 태스크와 실행에 필요한 컨텍스트 조회",
    inputSchema: {
      type: "object",
      properties: {
        changeId: { type: "string", description: "변경 제안 ID" }
      },
      required: ["changeId"]
    }
  },
  {
    name: "zyflow_get_task_context",
    description: "특정 태스크 실행에 필요한 상세 컨텍스트 조회",
    inputSchema: {
      type: "object",
      properties: {
        changeId: { type: "string", description: "변경 제안 ID" },
        taskId: { type: "string", description: "태스크 ID" }
      },
      required: ["changeId", "taskId"]
    }
  },
  {
    name: "zyflow_mark_complete",
    description: "태스크를 완료로 표시",
    inputSchema: {
      type: "object",
      properties: {
        changeId: { type: "string", description: "변경 제안 ID" },
        taskId: { type: "string", description: "태스크 ID" }
      },
      required: ["changeId", "taskId"]
    }
  },
  {
    name: "zyflow_mark_incomplete",
    description: "태스크를 미완료로 표시 (되돌리기)",
    inputSchema: {
      type: "object",
      properties: {
        changeId: { type: "string", description: "변경 제안 ID" },
        taskId: { type: "string", description: "태스크 ID" }
      },
      required: ["changeId", "taskId"]
    }
  }
]
```

### 컨텍스트 반환 형식

`zyflow_get_next_task` 응답:
```json
{
  "task": {
    "id": "task-1-1",
    "title": "FixedExpenseTemplate 타입 정의",
    "completed": false,
    "group": "1. 데이터 모델 정의"
  },
  "context": {
    "changeId": "auto-generate-fixed-expense-transactions",
    "proposal": "## 개요\n고정 지출 자동 생성...",
    "relatedSpec": "## FixedExpense Spec\n...",
    "suggestedFiles": [
      "src/types/expense.ts",
      "src/services/expenseService.ts"
    ],
    "completedTasks": ["task-0-1", "task-0-2"],
    "remainingTasks": 8
  }
}
```

### 아키텍처

```
┌─────────────────────────────────────────────┐
│  Claude Code (기존 세션)                     │
│                                             │
│  사용자: "다음 태스크 해줘"                   │
│  Claude: MCP Tool 호출                       │
└──────────────┬──────────────────────────────┘
               │ stdio (JSON-RPC)
               ▼
┌──────────────────────────────────────────────┐
│  ZyFlow MCP Server                           │
│  ├─ index.ts (서버 초기화, Tool 라우팅)       │
│  ├─ tools.ts (6개 Tool 핸들러)               │
│  └─ context.ts (컨텍스트 수집 로직)           │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  기존 모듈 재사용                             │
│  ├─ server/parser.ts (tasks.md 파싱)         │
│  └─ server/config.ts (프로젝트 설정)          │
└──────────────────────────────────────────────┘
```

### 파일 구조

```
/Users/hansoo./ZELLYY/zyflow/
├── mcp-server/
│   ├── index.ts          # MCP 서버 진입점
│   ├── tools.ts          # Tool 핸들러들
│   └── context.ts        # 컨텍스트 생성 로직
├── server/
│   ├── parser.ts         # 기존 파서 (재사용)
│   ├── config.ts         # 기존 설정 (재사용)
│   └── index.ts          # Express API (웹 UI용 유지)
├── dist/
│   └── mcp-server/       # 빌드 결과물
└── package.json          # MCP 빌드 스크립트 추가
```

## 구현 계획

### Phase 1: MCP 서버 기본 구조
- @modelcontextprotocol/sdk 설치
- mcp-server/index.ts 생성 (Server 초기화)
- stdio 전송 설정

### Phase 2: Tool 핸들러 구현
- zyflow_list_changes 구현
- zyflow_get_tasks 구현
- zyflow_get_next_task 구현
- zyflow_get_task_context 구현
- zyflow_mark_complete 구현
- zyflow_mark_incomplete 구현

### Phase 3: 컨텍스트 수집 로직
- proposal.md 읽기
- 관련 spec 파일 찾기
- 완료/미완료 태스크 집계
- 관련 파일 추천 로직

### Phase 4: 빌드 및 배포
- package.json에 빌드 스크립트 추가
- TypeScript 빌드 설정
- Claude Code settings 등록 가이드 작성

### Phase 5: 테스트 및 문서화
- 각 Tool 단위 테스트
- Claude Code에서 통합 테스트
- README 작성

## Claude Code 연동 설정

구현 완료 후 `~/.claude/settings.json`에 추가:

```json
{
  "mcpServers": {
    "zyflow": {
      "command": "node",
      "args": ["/Users/hansoo./ZELLYY/zyflow/dist/mcp-server/index.js"],
      "env": {
        "ZYFLOW_PROJECT": "/Users/hansoo./ZELLYY/zellyy-money"
      }
    }
  }
}
```

## 사용 예시

```
사용자: "auto-generate-fixed-expense-transactions 의 다음 태스크 해줘"

Claude: [MCP Tool 호출: zyflow_get_next_task]

        다음 태스크를 확인했습니다:
        - Task: FixedExpenseTemplate 타입 정의
        - Group: 1. 데이터 모델 정의

        proposal을 확인하니 고정 지출 템플릿에는 다음 필드가 필요합니다:
        - name, amount, category, frequency, nextDate...

        src/types/expense.ts에 타입을 추가하겠습니다.

        [파일 수정 진행...]

        완료했습니다. 태스크를 완료로 표시할까요?

사용자: "응"

Claude: [MCP Tool 호출: zyflow_mark_complete]

        태스크가 완료되었습니다. (3/12 완료)
        다음 태스크를 진행할까요?
```

## 기존 코드 정리

MCP 서버 구현 후 제거할 수 있는 코드:
- server/index.ts의 `/api/claude/*` 엔드포인트들
- src/hooks/useClaude.ts
- src/components/dashboard/ExecutionModal.tsx

단, 웹 UI에서 진행상황 표시가 필요하면 별도 설계 필요.

## 의존성

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

## 성공 기준

1. Claude Code에서 `zyflow_get_tasks` 호출 시 태스크 목록 반환
2. `zyflow_get_next_task`로 컨텍스트 포함 태스크 정보 조회 가능
3. `zyflow_mark_complete`로 tasks.md 파일 자동 업데이트
4. 연속 태스크 실행 시 컨텍스트 유지 확인
5. 토큰 사용량 5배 절감 검증
