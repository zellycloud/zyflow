# Project Context

## Purpose

zyflow는 **OpenSpec 워크플로우 전용 로컬 대시보드**입니다.

주요 목표:
- OpenSpec 변경 제안의 tasks.md를 칸반 형태로 시각화
- 태스크별 세부 계획 관리 (Claude가 생성)
- 테스트 상태 연동 (TDD)
- zywiki 문서 통합
- 개발자 본인을 위한 개인 개발 대시보드 (SaaS 아님)

**핵심 워크플로우**:
```
OpenSpec proposal → tasks.md 생성
    → zyflow에서 시각화
    → 태스크 선택 → Claude에게 세부 계획 요청
    → 구현 → 테스트 → 완료 체크
    → 모든 태스크 완료 → archive
```

## Tech Stack

### Frontend
- **React 19** - UI 라이브러리
- **Vite 6** - 빌드 도구
- **TypeScript** - 타입 시스템
- **ShadcnUI** - UI 컴포넌트 (Radix UI 기반)
- **TailwindCSS 4** - 스타일링
- **TanStack Query** - 서버 상태 관리
- **@dnd-kit** - 드래그앤드롭

### Backend (로컬)
- **Node.js + Express** 또는 **Vite dev server API** - 파일 시스템 접근
- 파일 기반 데이터 (backlog/*.md, openspec/*.md)

### 참고 템플릿
- **shadcn-admin** (satnaing/shadcn-admin) - UI 레이아웃/패턴 참고

## Project Conventions

### Code Style
- ESLint + Prettier 사용
- 파일명: kebab-case (`task-card.tsx`)
- 컴포넌트명: PascalCase (`TaskCard`)
- 함수/변수명: camelCase (`handleDrop`)
- 타입명: PascalCase with suffix (`TaskProps`, `TaskState`)
- 절대 경로 import: `@/` prefix 사용

### Architecture Patterns
- **Feature-based 폴더 구조**: `src/features/tasks/`, `src/features/specs/`
- **Container/Presentational 분리**: 로직은 hooks, UI는 컴포넌트
- **Colocation**: 관련 파일은 같은 폴더에 배치
- **Barrel exports**: `index.ts`로 public API 노출

### Testing Strategy
- **Vitest** - 단위 테스트
- **React Testing Library** - 컴포넌트 테스트
- **Playwright** - E2E 테스트 (필요시)
- 커버리지 목표: 주요 비즈니스 로직 80%+

### Git Workflow
- **main** 브랜치: 안정 버전
- **feature/** 브랜치: 기능 개발
- 커밋 메시지: Conventional Commits (`feat:`, `fix:`, `chore:`)
- PR 머지 전 테스트 통과 필수

## Domain Context

### 핵심 개념
- **Change**: OpenSpec 변경 제안 (`openspec/changes/*/`)
- **Task**: 변경 제안의 tasks.md 체크리스트 항목
- **Plan**: 태스크별 세부 구현 계획 (`.zyflow/plans/`)
- **Spec**: 구현된 기능 명세 (`openspec/specs/`)

### 워크플로우
```
1. OpenSpec proposal 작성 → tasks.md 생성
2. zyflow에서 태스크 목록 확인
3. 태스크 선택 → Claude에게 세부 계획 요청
4. Claude가 구현 → 테스트 실행
5. 테스트 통과 → 체크박스 완료
6. 모든 태스크 완료 → openspec archive
```

### 데이터 소스
- `openspec/changes/*/tasks.md` - 태스크 체크리스트
- `openspec/changes/*/proposal.md` - 변경 제안 요약
- `.zyflow/plans/*.md` - 세부 구현 계획

## Important Constraints

### 기술적 제약
- **로컬 전용**: 서버 배포 없음, localhost에서만 동작
- **파일 시스템 의존**: Node.js fs 모듈 필요
- **브라우저 보안**: 브라우저에서 직접 파일 접근 불가 → 로컬 API 서버 필요

### 개발 원칙
- **점진적 개발**: v0.1부터 작은 기능씩 추가
- **과도한 추상화 금지**: 필요할 때만 리팩토링
- **상업화 목표 없음**: 개인 사용 + 오픈소스

## External Dependencies

### 파일 포맷
- **OpenSpec**: 스펙 변경 제안 포맷 (tasks.md, proposal.md)
- **zywiki**: AI 생성 코드 문서 포맷 (v0.2+)

### 연동 도구 (선택적)
- **Claude Code**: AI 코딩 어시스턴트
- **Cursor**: AI 코드 에디터
- **VS Code**: 에디터
