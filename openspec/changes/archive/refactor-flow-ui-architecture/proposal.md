# Change: Flow 중심 UI 아키텍처로 전환

## Why

현재 ZyFlow는 OpenSpec과 Kanban이 별도 탭으로 분리되어 있어 "Flow"라는 이름에 걸맞은 **파이프라인 흐름 시각화**가 없음. 사용자가 `Spec → Changes → Task → Code → Test → Commit → Docs` 전체 흐름을 한눈에 파악하기 어려움.

## What Changes

### UI 구조 변경
- 기존 OpenSpec/Kanban 탭 구조 비활성화 (코드는 코멘트 처리하여 보존)
- 사이드바: 프로젝트 → Changes 트리 구조
  - 프로젝트 클릭: 대시보드 (전체 Changes 요약)
  - Change 클릭: 상세 뷰 (7단계 탭)
  - "기타 작업": 독립 tasks 칸반
- 2가지 메인 뷰:
  - 프로젝트 대시보드: Changes 목록 + 진행률 요약
  - Change 상세: 7단계 파이프라인 탭

### 데이터 구조 변경
- `changes` 테이블 신규 추가 (Flow의 최상위 단위)
- `tasks` 테이블 확장:
  - `change_id`, `stage` 필드 추가
  - `group_title`, `group_order`, `task_order` 필드 추가 (tasks.md 구조 보존)
- OpenSpec 파일과 DB 간 동기화 로직 구현 (DB가 운영 데이터의 Single Source of Truth)

### 파이프라인 단계 (7단계)
1. **Spec**: OpenSpec proposal.md 연동
2. **Changes**: OpenSpec 변경 제안 목록 (proposal 상세)
3. **Tasks**: 칸반/리스트 뷰 전환 가능
   - 칸반 뷰: Todo/Doing/Done 드래그앤드롭
   - 리스트 뷰: tasks.md 그룹/번호 구조 유지 (1.1, 1.2, 2.1...)
4. **Code**: 코딩 작업 추적
5. **Test**: 테스트 작업 추적
6. **Commit**: 커밋/CI 상태
7. **Docs**: 문서화 작업 추적

## Impact

- Affected specs: `flow-dashboard` (신규 생성)
- Affected code:
  - `src/components/` - UI 컴포넌트 전면 재구성
  - `src/server/` - API 엔드포인트 추가/수정
  - `src/lib/db/` - 스키마 마이그레이션
  - `src/mcp-server/` - MCP 도구 업데이트
