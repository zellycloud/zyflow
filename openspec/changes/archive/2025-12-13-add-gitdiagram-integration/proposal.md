# Change: GitDiagram 통합으로 프로젝트 아키텍처 시각화 기능 추가

## Why

대규모 코드베이스를 빠르게 이해하기 어렵다. GitDiagram의 접근법(파일 트리 + AI → Mermaid 다이어그램)을 zyflow에 통합하면:
- 프로젝트 온보딩 시간 단축
- OpenSpec 변경이 시스템에 미치는 영향 시각화
- Claude Code에서 "프로젝트 구조 보여줘"로 즉시 다이어그램 생성

## What Changes

- GitDiagram의 핵심 로직(3단계 프롬프트)을 TypeScript로 포팅
- `packages/gitdiagram-core/` 패키지로 분리하여 업스트림 추적 용이
- MCP 도구 `diagram_generate` 추가
- React 프론트엔드에 Mermaid 렌더링 컴포넌트 추가
- OpenSpec 변경별 아키텍처 영향도 시각화 기능

## Impact

- Affected specs: 신규 capability `diagram-generator` 추가
- Affected code:
  - `packages/gitdiagram-core/` (신규)
  - `mcp-server/diagram-tools.ts` (신규)
  - `mcp-server/index.ts` (수정 - 도구 등록)
  - `src/components/diagram/` (신규)
  - `package.json` (의존성 추가: mermaid)

## Dependencies

- Claude API 또는 OpenAI API (다이어그램 생성용 LLM)
- mermaid.js (프론트엔드 렌더링)

## Upstream Tracking

GitDiagram 원본 저장소: `ahmedkhaleel2004/gitdiagram`
- 포크 생성하여 업스트림 변경 추적
- `packages/gitdiagram-core/package.json`에 upstream 커밋 해시 기록
- 주기적으로 포크 동기화 후 변경 사항 반영
