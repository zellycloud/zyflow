# Change: Phase 3 - 기능 간소화

## Summary

복잡하고 저사용 기능들을 간소화하거나 분리합니다:
- Multi-AI Provider → Claude 전용
- Remote SSH → 별도 플러그인 분리
- Alert System → 핵심만 유지
- Post-Task Agent → 제거 (Claude SDK 대체)

## Motivation

### Multi-AI Provider (7개 → 1개)
- ZyFlow는 Claude Code 연동이 핵심 가치
- 7개 프로바이더 지원은 복잡도만 증가
- Consensus 투표 메커니즘은 과도한 복잡성

### Remote SSH
- v0.5.0에서 추가된 니치 기능
- 핵심 사용자에게는 필수 아님
- 별도 플러그인으로 분리하여 선택적 사용

### Alert System (5,000+ LOC)
- 핵심 워크플로우와 연결 약함
- GitHub 자체 Notifications로 대체 가능
- 간단한 읽기 전용 알림만 유지

### Post-Task Agent (15,000+ LOC)
- 20개 자동화 작업 중 실제 사용 소수
- quarantine-manager 단독 10,751 LOC
- Claude SDK Hooks로 대체 가능

## Scope

### 3.1 Multi-AI → Claude 전용
- server/ai/providers/ 에서 claude.ts만 유지
- consensus.ts 제거
- ConsensusUI 컴포넌트 제거

### 3.2 Remote SSH → 플러그인 분리
- server/remote/ → zyflow-remote-plugin/
- server/routes/remote.ts → 플러그인
- src/components/remote/ → 플러그인

### 3.3 Alert System 간소화
- GitHub Actions 실패 알림만 유지 (~500 LOC)
- alertProcessor.ts (1,902 LOC) 제거
- Webhook, 패턴 분석, Auto-fix 제거

### 3.4 Post-Task Agent 제거
- mcp-server/tasks/ 전체 제거
- quarantine-system 제거

## Expected Impact

- ~20,000 LOC 제거/분리
- 핵심 기능에 집중
- 유지보수 부담 대폭 감소
