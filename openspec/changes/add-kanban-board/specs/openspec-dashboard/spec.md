## ADDED Requirements

### Requirement: OpenSpec 변경 목록 조회
시스템은 로컬 `openspec/changes/` 디렉토리의 모든 변경 제안을 조회할 수 있어야 한다(SHALL).

#### Scenario: 변경 목록 조회 성공
- **WHEN** 사용자가 대시보드를 열면
- **THEN** 모든 활성 변경 제안 목록이 사이드바에 표시된다
- **AND** 각 변경의 제목과 진행률이 표시된다

#### Scenario: 변경 없음
- **WHEN** `openspec/changes/` 디렉토리가 비어있으면
- **THEN** "활성 변경 제안이 없습니다" 메시지가 표시된다

### Requirement: 태스크 목록 조회
시스템은 선택된 변경 제안의 `tasks.md` 파일을 파싱하여 체크리스트를 표시해야 한다(SHALL).

#### Scenario: 태스크 목록 표시
- **WHEN** 사용자가 변경 제안을 선택하면
- **THEN** 해당 변경의 tasks.md 체크리스트가 그룹별로 표시된다
- **AND** 각 태스크의 완료 상태(체크박스)가 표시된다

#### Scenario: 그룹별 표시
- **WHEN** tasks.md에 `## 1. 섹션명` 형식의 헤딩이 있으면
- **THEN** 태스크가 섹션별로 그룹핑되어 표시된다

### Requirement: 태스크 완료 상태 토글
시스템은 태스크의 완료 상태를 토글하고 파일에 반영해야 한다(SHALL).

#### Scenario: 체크박스 토글
- **WHEN** 사용자가 태스크 체크박스를 클릭하면
- **THEN** 완료 상태가 토글된다
- **AND** tasks.md 파일이 업데이트된다 (`- [ ]` ↔ `- [x]`)

#### Scenario: 진행률 업데이트
- **WHEN** 태스크 완료 상태가 변경되면
- **THEN** 해당 변경의 진행률이 자동으로 업데이트된다

### Requirement: 세부 계획 조회
시스템은 태스크별 세부 구현 계획을 조회할 수 있어야 한다(SHALL).

#### Scenario: 세부 계획 존재
- **WHEN** `.zyflow/plans/{change-id}/{task-id}.md` 파일이 존재하면
- **THEN** 태스크 상세 패널에서 세부 계획 내용이 표시된다

#### Scenario: 세부 계획 없음
- **WHEN** 세부 계획 파일이 없으면
- **THEN** "세부 계획 요청" 버튼이 표시된다
- **AND** 버튼 클릭 시 Claude에게 보낼 프롬프트가 클립보드에 복사된다
