# zyflow + claude-flow 통합

## Summary

zyflow에서 OpenSpec 작업을 claude-flow swarm에 위임하여 멀티 에이전트 기반으로 자동 실행하는 기능을 추가합니다.

## Motivation

### 현재 상황
- zyflow는 OpenSpec 변경 제안과 태스크를 시각화하고 관리
- 실제 코드 작업은 사용자가 수동으로 Claude Code CLI를 실행해야 함
- 복잡한 작업은 단일 Claude 세션으로 처리하기 어려움

### 목표
- zyflow UI에서 "작업 실행" 버튼으로 claude-flow swarm 호출
- OpenSpec 문서(proposal.md, tasks.md, design.md)를 맥락으로 전달
- 멀티 에이전트가 협업하여 태스크 자동 완료
- 실시간 진행 상황을 zyflow UI에서 모니터링

### 기대 효과
- 복잡한 작업의 병렬 처리 (연구, 코딩, 테스트 에이전트 협업)
- 사용자 개입 최소화
- 작업 품질 향상 (여러 에이전트의 검토)

## Scope

### In Scope
- claude-flow swarm 호출 API 엔드포인트
- OpenSpec 문서 기반 프롬프트 생성
- 실행 상태 실시간 스트리밍 (SSE)
- 실행 결과 로깅 및 히스토리
- 기본 UI (실행 버튼, 진행 상황 표시)

### Out of Scope
- claude-flow 커스텀 에이전트 개발
- 복잡한 워크플로우 편집기
- 다중 프로젝트 동시 실행
- 실행 취소/롤백 기능

## Approach

### 아키텍처

```
zyflow UI (React)
    │
    │ POST /api/claude-flow/execute
    │ { projectPath, changeId, taskId?, mode }
    ▼
zyflow Server (Express)
    │
    │ 1. OpenSpec 문서 로드
    │ 2. 프롬프트 조합
    │ 3. child_process.spawn()
    ▼
npx claude-flow@alpha swarm "{prompt}" --claude
    │
    │ stream-json 출력
    ▼
SSE로 클라이언트에 실시간 전달
```

### 실행 모드

1. **Change 전체 실행**: 모든 미완료 태스크 순차 처리
2. **단일 태스크 실행**: 특정 태스크만 처리
3. **분석 모드**: 코드 변경 없이 분석만 (--analysis 플래그)

### 프롬프트 구조

```markdown
## 프로젝트 맥락
{CLAUDE.md 요약 또는 전체}

## 현재 Change
ID: {changeId}
제목: {proposal.md의 title}

## 설계 문서
{design.md 요약 - 있는 경우}

## 현재 태스크
{tasks.md에서 미완료 태스크}

## 관련 스펙
{specs/ 디렉토리의 관련 파일 목록}

## 지시사항
1. 위 태스크를 순서대로 구현하세요
2. 각 태스크 완료 후 zyflow_mark_complete를 호출하세요
3. 테스트가 있다면 반드시 통과시키세요
```

## Risks & Mitigations

| 리스크 | 완화 방안 |
|--------|----------|
| 프로세스 무한 실행 | 타임아웃 설정 (기본 30분) |
| 잘못된 코드 생성 | --analysis 모드로 먼저 검토 |
| 리소스 과다 사용 | 동시 실행 제한 (1개) |
| 맥락 손실 | 핵심 문서 프롬프트에 직접 포함 |

## Success Criteria

- [ ] zyflow UI에서 claude-flow 실행 버튼 동작
- [ ] 실행 중 실시간 로그 표시
- [ ] 태스크 완료 시 자동 체크박스 업데이트
- [ ] 실행 히스토리 조회 가능
