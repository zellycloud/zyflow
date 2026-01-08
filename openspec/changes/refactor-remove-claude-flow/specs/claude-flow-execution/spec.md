## REMOVED Requirements

### Requirement: claude-flow Swarm 실행 API

**Reason**: Claude Agent SDK 도입으로 외부 claude-flow 패키지가 더 이상 필요하지 않음

**Migration**: 
- Swarm 멀티에이전트 기능이 필요한 경우 Claude Agent SDK 기반으로 재구현
- 기존 API 호출 코드는 새 API로 마이그레이션 필요

#### Scenario: API 엔드포인트 제거
- **WHEN** `/api/claude-flow/*` 엔드포인트 호출 시
- **THEN** 404 Not Found 반환 (엔드포인트 제거됨)

### Requirement: claude-flow 스트리밍

**Reason**: 외부 의존성 제거

**Migration**: 필요시 Vercel AI SDK 스트리밍으로 대체

#### Scenario: 스트리밍 엔드포인트 제거
- **WHEN** `/api/claude-flow/stream/:id` 호출 시
- **THEN** 404 Not Found 반환 (엔드포인트 제거됨)

### Requirement: claude-flow 상태 관리

**Reason**: 외부 의존성 제거

**Migration**: 필요시 자체 상태 관리 구현

#### Scenario: 상태 API 제거
- **WHEN** `/api/claude-flow/status/:id` 호출 시
- **THEN** 404 Not Found 반환 (엔드포인트 제거됨)

### Requirement: claude-flow 프롬프트 생성

**Reason**: prompt-builder는 자체 구현이므로 유지, claude-flow 의존 부분만 제거

**Migration**: OpenSpecPromptBuilder 클래스는 유지

#### Scenario: 프롬프트 빌더 유지
- **WHEN** OpenSpec 변경에 대한 프롬프트 생성 필요 시
- **THEN** OpenSpecPromptBuilder 클래스 사용 (기존과 동일)
