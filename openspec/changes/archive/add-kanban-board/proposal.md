# Change: OpenSpec 칸반 대시보드 v0.1

## Why

OpenSpec으로 스펙을 작성하면 tasks.md에 구현 체크리스트가 생성되지만, 이를 시각적으로 관리하고 진행 상황을 파악하기 어렵다. 칸반 형태의 대시보드로 OpenSpec 워크플로우를 시각화하면 개발 진행 상황을 한눈에 파악할 수 있다.

## What Changes

### 신규 기능
- Vite + React + ShadcnUI 기반 웹 앱 초기 설정
- 로컬 파일 시스템 접근을 위한 Express API 서버
- OpenSpec changes/*/tasks.md 파싱 및 조회
- 칸반 보드 UI (변경 제안별 태스크 그룹핑)
- 태스크 카드 컴포넌트 (체크박스, 제목)
- 체크박스 토글로 완료 상태 변경 (파일에 반영)
- 세부 계획 요청 기능 (Claude에게 지시 → 파일 저장)

### 데이터 소스
- `openspec/changes/*/tasks.md` - 태스크 체크리스트
- `openspec/changes/*/proposal.md` - 변경 제안 요약
- `.zyflow/plans/*.md` - 세부 구현 계획 (Claude가 생성)

### 미포함 (v0.2+)
- 테스트 상태 연동 (TDD)
- OpenSpec specs/ 뷰어 (현재 스펙 조회)
- zywiki 문서 통합
- 드래그앤드롭 순서 변경

## Impact

- Affected specs: openspec-dashboard (신규)
- Affected code: 전체 프로젝트 초기 설정
- Dependencies:
  - React 19, Vite 6, TypeScript
  - ShadcnUI, TailwindCSS 4
  - TanStack Query
  - Express (로컬 API 서버)
  - gray-matter (마크다운 파싱)
