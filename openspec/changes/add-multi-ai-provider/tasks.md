# Tasks

## Phase 1: 서버 API 확장

- [ ] **AI 타입 정의** (`server/ai/types.ts`)
  - AIProvider 타입 정의
  - AIExecuteRequest/Response 인터페이스
  - AIMessage 타입

- [ ] **AI 실행 API 라우터** (`server/ai/index.ts`)
  - POST /api/ai/execute - 실행 시작
  - POST /api/ai/stop/:runId - 실행 중지
  - GET /api/ai/providers - Provider 목록 조회

- [ ] **CLI Adapter 확장** (`server/cli-adapter/process-manager.ts`)
  - buildArgs에 model 파라미터 추가
  - Provider별 모델 인자 처리 (--model)
  - start() 메서드에 model 전달

- [ ] **앱에 라우터 등록** (`server/app.ts`)
  - aiRouter import 및 등록
  - /api/ai/* 엔드포인트 활성화

## Phase 2: 클라이언트 훅 확장

- [ ] **AI 타입 정의** (`src/types/ai.ts`)
  - AIProvider 타입 export
  - AIExecution, AIMessage 인터페이스
  - AIProviderConfig 인터페이스

- [ ] **useAI 훅 생성** (`src/hooks/useAI.ts`)
  - execute() - provider, model 포함 실행
  - stop() - 실행 중지
  - reset() - 상태 초기화
  - SSE 스트리밍 처리

- [ ] **useClaude 하위 호환** (`src/hooks/useClaude.ts`)
  - useAI 래퍼로 리팩토링
  - 기존 인터페이스 100% 유지
  - 타입 export 유지 (ClaudeModel, ClaudeMessage)

## Phase 3: UI 수정

- [ ] **Provider 선택 UI** (`src/components/flow/TaskExecutionDialog.tsx`)
  - Provider 목록 로드 (/api/ai/providers)
  - Provider 선택 카드 UI
  - 선택된 Provider의 모델 옵션 표시
  - 비활성화된 Provider 표시 (미설치)

- [ ] **실행 로그 개선**
  - Provider 아이콘 표시
  - 선택된 모델 표시
  - Provider별 색상 구분

## Phase 4: 설정 및 테스트

- [ ] **CLI 가용성 체크**
  - which 명령어로 CLI 설치 확인
  - 미설치 시 UI에서 비활성화
  - 설치 안내 메시지

- [ ] **단위 테스트**
  - useAI 훅 테스트
  - useClaude 하위 호환 테스트
  - buildArgs Provider별 테스트

- [ ] **통합 테스트**
  - Claude 실행 테스트
  - Gemini 실행 테스트 (설치 시)
  - SSE 스트리밍 테스트

## 완료 기준

- [ ] Claude 외 1개 이상 Provider 동작 확인
- [ ] 기존 useClaude 사용 코드 변경 없이 동작
- [ ] cli-settings.json 설정 반영
- [ ] TypeScript 타입 체크 통과
- [ ] 실행 로그에 Provider/Model 정보 표시
