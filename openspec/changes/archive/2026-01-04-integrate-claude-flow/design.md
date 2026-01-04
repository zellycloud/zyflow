# claude-flow 통합 설계

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        zyflow Dashboard                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  ChangeDetail 컴포넌트                                          │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  [실행] 버튼  │  진행 상황 패널  │  로그 뷰어             │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP/SSE
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      zyflow Express Server                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  /api/claude-flow/                                           │   │
│  │  ├── POST /execute      - 실행 시작                          │   │
│  │  ├── GET  /status/:id   - 실행 상태 조회                     │   │
│  │  ├── GET  /stream/:id   - SSE 스트림                         │   │
│  │  ├── POST /stop/:id     - 실행 중지                          │   │
│  │  └── GET  /history      - 실행 히스토리                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ClaudeFlowExecutor                                          │   │
│  │  ├── buildPrompt()      - OpenSpec → 프롬프트 변환           │   │
│  │  ├── spawn()            - claude-flow 프로세스 실행          │   │
│  │  ├── parseOutput()      - stream-json 파싱                   │   │
│  │  └── handleComplete()   - 완료 처리, 태스크 업데이트         │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ child_process.spawn
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      claude-flow Process                             │
│  npx claude-flow@alpha swarm "{prompt}" --claude                     │
│  ├── 내부적으로 Claude Code CLI 호출                                │
│  ├── stream-json 형식으로 진행 상황 출력                            │
│  └── MCP 도구 사용 (zyflow_mark_complete 등)                        │
└─────────────────────────────────────────────────────────────────────┘
```

## 컴포넌트 설계

### 1. Backend: ClaudeFlowExecutor

```typescript
// server/claude-flow/executor.ts

interface ExecutionRequest {
  projectPath: string
  changeId: string
  taskId?: string           // 특정 태스크만 실행
  mode: 'full' | 'single' | 'analysis'
  strategy?: 'development' | 'research' | 'testing'
  maxAgents?: number        // 기본 5
  timeout?: number          // 기본 30분 (ms)
}

interface ExecutionStatus {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped'
  startedAt: string
  completedAt?: string
  progress: number          // 0-100
  currentTask?: string
  logs: LogEntry[]
  result?: ExecutionResult
}

interface LogEntry {
  timestamp: string
  type: 'info' | 'tool_use' | 'tool_result' | 'error' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
}
```

### 2. 프롬프트 빌더

```typescript
// server/claude-flow/prompt-builder.ts

class OpenSpecPromptBuilder {
  constructor(
    private projectPath: string,
    private changeId: string
  ) {}

  async build(): Promise<string> {
    const sections: string[] = []

    // 1. 프로젝트 맥락 (CLAUDE.md)
    sections.push(await this.buildProjectContext())

    // 2. Change 정보
    sections.push(await this.buildChangeSection())

    // 3. 설계 문서 (있으면)
    const design = await this.buildDesignSection()
    if (design) sections.push(design)

    // 4. 현재 태스크
    sections.push(await this.buildTasksSection())

    // 5. 관련 스펙
    sections.push(await this.buildSpecsSection())

    // 6. 지시사항
    sections.push(this.buildInstructions())

    return sections.join('\n\n---\n\n')
  }
}
```

### 3. Frontend: ExecutionPanel 컴포넌트

```typescript
// src/components/claude-flow/ExecutionPanel.tsx

interface ExecutionPanelProps {
  changeId: string
  projectPath: string
}

// 상태 관리
const [status, setStatus] = useState<ExecutionStatus | null>(null)
const [logs, setLogs] = useState<LogEntry[]>([])

// SSE 연결
useEffect(() => {
  if (executionId) {
    const eventSource = new EventSource(
      `/api/claude-flow/stream/${executionId}`
    )
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setLogs(prev => [...prev, data])
    }
    return () => eventSource.close()
  }
}, [executionId])
```

## 데이터 흐름

### 실행 시작

```
1. 사용자: "실행" 버튼 클릭
2. Frontend → POST /api/claude-flow/execute
   {
     projectPath: "/Users/hansoo./ZELLYY/zellyy-money",
     changeId: "add-beta-tester-program",
     mode: "full"
   }
3. Server:
   a. 실행 ID 생성 (uuid)
   b. OpenSpec 문서 로드
   c. 프롬프트 빌드
   d. claude-flow spawn
   e. 실행 ID 반환
4. Frontend: SSE 연결 시작
```

### 실행 중

```
1. claude-flow 출력 (stream-json):
   {"type":"assistant","message":"태스크 분석 중..."}
   {"type":"tool_use","name":"Read","input":{...}}
   {"type":"tool_result","content":"..."}

2. Server: 출력 파싱 → SSE로 전송

3. Frontend: 로그 업데이트, 진행률 표시
```

### 실행 완료

```
1. claude-flow 프로세스 종료
2. Server:
   a. 최종 상태 저장
   b. 히스토리에 기록
   c. SSE 'complete' 이벤트 전송
3. Frontend:
   a. 완료 상태 표시
   b. 태스크 목록 새로고침 (React Query invalidate)
```

## 파일 구조

```
server/
├── claude-flow/
│   ├── index.ts              # 라우터
│   ├── executor.ts           # 프로세스 실행 관리
│   ├── prompt-builder.ts     # OpenSpec → 프롬프트
│   ├── output-parser.ts      # stream-json 파싱
│   └── types.ts              # 타입 정의

src/
├── components/
│   └── claude-flow/
│       ├── ExecutionPanel.tsx    # 실행 UI
│       ├── LogViewer.tsx         # 로그 표시
│       ├── ProgressIndicator.tsx # 진행률
│       └── ExecutionHistory.tsx  # 히스토리
├── hooks/
│   └── useClaudeFlowExecution.ts # 실행 상태 관리
└── types/
    └── claude-flow.ts            # 타입 정의
```

## 보안 고려사항

1. **프로세스 격리**: spawn된 프로세스는 별도 환경에서 실행
2. **타임아웃**: 무한 실행 방지 (기본 30분)
3. **동시 실행 제한**: 프로젝트당 1개 실행만 허용
4. **로그 민감정보**: API 키 등 마스킹

## 향후 확장

1. **커스텀 에이전트 설정**: 사용자가 에이전트 구성 조정
2. **워크플로우 템플릿**: 자주 사용하는 실행 패턴 저장
3. **실행 비교**: 여러 실행 결과 비교 분석
4. **비용 추적**: API 토큰 사용량 모니터링
