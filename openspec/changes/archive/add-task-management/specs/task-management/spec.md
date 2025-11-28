## ADDED Requirements

### Requirement: Task Storage

시스템은 SQLite 데이터베이스에 태스크를 저장해야 한다 (SHALL).

태스크는 다음 필드를 포함해야 한다:
- `id`: 고유 식별자
- `title`: 제목 (필수)
- `description`: 설명 (선택)
- `status`: 상태 (todo, in-progress, review, done)
- `priority`: 우선순위 (low, medium, high)
- `tags`: 태그 목록 (JSON 배열)
- `order`: 정렬 순서
- `createdAt`, `updatedAt`: 타임스탬프

#### Scenario: 프로젝트별 DB 파일
- **WHEN** 프로젝트 디렉토리에서 태스크 명령 실행
- **THEN** `.zyflow/tasks.db` 파일이 생성/사용됨

#### Scenario: DB 초기화
- **WHEN** DB 파일이 없는 상태에서 첫 명령 실행
- **THEN** 스키마가 자동 생성됨

---

### Requirement: Task CRUD

시스템은 태스크 생성, 조회, 수정, 삭제 기능을 제공해야 한다 (SHALL).

#### Scenario: 태스크 생성
- **WHEN** `zy tasks add "버그 수정" --priority high --tags bug`
- **THEN** 새 태스크가 생성되고 ID 반환

#### Scenario: 태스크 목록 조회
- **WHEN** `zy tasks list --status todo`
- **THEN** todo 상태 태스크만 테이블로 출력

#### Scenario: 태스크 수정
- **WHEN** `zy tasks edit TASK-001 --status in-progress`
- **THEN** 해당 태스크 상태가 변경됨

#### Scenario: 태스크 삭제
- **WHEN** `zy tasks delete TASK-001`
- **THEN** 확인 후 태스크 삭제

---

### Requirement: Task Search

시스템은 FTS5 기반 풀텍스트 검색을 제공해야 한다 (SHALL).

#### Scenario: 제목/설명 검색
- **WHEN** `zy tasks search "모달"`
- **THEN** 제목 또는 설명에 "모달"이 포함된 태스크 반환

#### Scenario: 한글 검색
- **WHEN** 한글 키워드로 검색
- **THEN** unicode61 토크나이저로 올바르게 검색됨

---

### Requirement: Task Status Flow

시스템은 칸반 스타일 상태 흐름을 지원해야 한다 (SHALL).

상태 값:
- `todo`: 할 일
- `in-progress`: 진행 중
- `review`: 리뷰 대기
- `done`: 완료

#### Scenario: 상태 이동
- **WHEN** `zy tasks move TASK-001 in-progress`
- **THEN** 태스크 상태가 `in-progress`로 변경

#### Scenario: 순서 변경
- **WHEN** 칸반 UI에서 드래그로 순서 변경
- **THEN** `order` 필드가 업데이트됨

---

### Requirement: CLI Interface

시스템은 `zy tasks` 하위 명령어를 제공해야 한다 (SHALL).

#### Scenario: 명령어 목록
- **WHEN** `zy tasks --help`
- **THEN** 사용 가능한 하위 명령어 표시:
  - `list`, `add`, `view`, `edit`, `move`, `search`, `delete`

#### Scenario: 칸반 형태 출력
- **WHEN** `zy tasks list --kanban`
- **THEN** 컬럼별로 그룹화된 ASCII 칸반 출력

---

### Requirement: MCP Integration

시스템은 MCP 프로토콜로 태스크 도구를 노출해야 한다 (SHALL).

#### Scenario: MCP 도구 목록
- **WHEN** MCP 클라이언트가 도구 목록 요청
- **THEN** `task-list`, `task-create`, `task-update`, `task-search`, `task-delete` 도구 제공

#### Scenario: Claude에서 태스크 생성
- **WHEN** Claude가 `task-create` 도구 호출
- **THEN** 태스크가 생성되고 결과 반환

---

### Requirement: Kanban UI

시스템은 웹 기반 칸반 보드 UI를 제공해야 한다 (SHALL).

#### Scenario: 칸반 보드 표시
- **WHEN** `/tasks` 라우트 접근
- **THEN** 4개 컬럼(Todo, In Progress, Review, Done) 칸반 표시

#### Scenario: 드래그 앤 드롭
- **WHEN** 태스크 카드를 다른 컬럼으로 드래그
- **THEN** 상태가 변경되고 DB에 저장

#### Scenario: 인라인 생성
- **WHEN** 컬럼의 "+" 버튼 클릭
- **THEN** 해당 상태로 새 태스크 생성 다이얼로그
