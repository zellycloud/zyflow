# ZyFlow OpenSpec 제거 + MoAI 전환 계획

## 개요

**목표**: ZyFlow에서 OpenSpec 시스템을 완전히 제거하고 MoAI-ADK 기반으로 재구성
**결정 근거**: 사용자가 MoAI의 추적 기능을 경험 후 OpenSpec 제거 결정
**예상 기간**: 4-6주

---

## Phase 1: 기반 정리 (Week 1)

### 1.1 OpenSpec 파서 패키지 제거

**제거할 파일**:
- `packages/zyflow-parser/` (전체 디렉토리)
  - `src/parser.ts` (385줄)
  - `src/types.ts`
  - `src/id-resolver.ts`
  - `src/status.ts`
  - `src/parser.test.ts`

**대체 전략**:
- MoAI SPEC 형식 파서 생성 (선택사항)
- 또는 MoAI-ADK의 기존 파싱 로직 활용

### 1.2 CLI 어댑터 교체

**제거할 파일**:
- `server/cli-adapter/openspec.ts` (308줄)

**교체 파일 생성**:
- `server/cli-adapter/moai.ts` - MoAI-ADK CLI 통합

### 1.3 데이터베이스 스키마 마이그레이션

**수정 파일**: `server/tasks/db/schema.ts`

**변경 사항**:
```typescript
// 변경 전
origin: text('origin', { enum: ['openspec', 'inbox', 'imported', 'backlog'] })
specPath: text('spec_path')  // openspec/changes/{id}/proposal.md

// 변경 후
origin: text('origin', { enum: ['moai', 'inbox', 'imported', 'backlog'] })
specPath: text('spec_path')  // .moai/specs/SPEC-XXX/spec.md
```

**마이그레이션 SQL**:
```sql
UPDATE tasks SET origin = 'moai' WHERE origin = 'openspec';
UPDATE changes SET spec_path = REPLACE(spec_path, 'openspec/changes/', '.moai/specs/');
```

---

## Phase 2: 서버 로직 전환 (Week 2)

### 2.1 Flow 라우터 수정

**수정 파일**: `server/routes/flow.ts` (2,228줄)

**핵심 변경**:
1. 경로 변경: `openspec/changes/` → `.moai/specs/`
2. 구조 변경: 4 아티팩트 (proposal, specs, design, tasks) → 3 파일 (spec.md, plan.md, acceptance.md)
3. 워크플로우 변경: OpenSpec 단계 → MoAI 3단계 (Plan, Run, Sync)

**수정할 엔드포인트**:
- `GET /api/flow/changes` - SPEC 목록 조회
- `POST /api/flow/sync` - SPEC 동기화
- `GET /api/flow/changes/:id` - SPEC 상세
- `POST /api/flow/changes/:id/archive` - SPEC 아카이브

### 2.2 Sync 로직 수정

**수정 파일**: `server/sync-tasks.ts`

**변경 사항**:
- `syncChangeTasksFromFile()` → MoAI acceptance.md 파싱
- 디렉토리 스캔: `openspec/changes/` → `.moai/specs/`

---

## Phase 3: MCP 서버 도구 전환 (Week 3)

### 3.1 기존 도구 수정

**수정 파일**: `mcp-server/index.ts` (1,836줄)

**도구 이름 및 로직 변경**:

| 기존 도구 | 변경 후 | 변경 내용 |
|----------|---------|----------|
| `zyflow_list_changes` | `zyflow_list_specs` | `.moai/specs/` 스캔 |
| `zyflow_get_tasks` | `zyflow_get_spec_tasks` | acceptance.md 파싱 |
| `zyflow_get_next_task` | `zyflow_get_next_task` | 로직 유지, 경로 변경 |
| `zyflow_mark_complete` | `zyflow_mark_complete` | acceptance.md 업데이트 |
| `zyflow_get_task_context` | `zyflow_get_spec_context` | MoAI SPEC 컨텍스트 |
| `zyflow_validate_change` | 제거 | MoAI 품질 게이트로 대체 |
| `zyflow_archive_change` | `zyflow_archive_spec` | SPEC 아카이브 |
| `zyflow_get_instructions` | 제거 | MoAI 워크플로우로 대체 |
| `zyflow_get_status` | `zyflow_get_spec_status` | MoAI 단계 상태 |

### 3.2 새 도구 추가 (선택사항)

```typescript
// MoAI 워크플로우 통합 도구
zyflow_start_plan    // /moai:1-plan 트리거
zyflow_start_run     // /moai:2-run 트리거
zyflow_start_sync    // /moai:3-sync 트리거
```

---

## Phase 4: 프론트엔드 전환 (Week 4)

### 4.1 Flow 컴포넌트 수정

**수정 파일들**: `src/components/flow/`

| 컴포넌트 | 변경 내용 |
|----------|----------|
| `ChangeList.tsx` | SPEC 목록 표시, 경로 변경 |
| `ChangeDetail.tsx` | SPEC 상세 (spec.md, plan.md, acceptance.md) |
| `PipelineBar.tsx` | 7단계 → 3단계 (Plan, Run, Sync) |
| `StageContent.tsx` | acceptance.md 기반 태스크 표시 |
| `TaskCard.tsx` | MoAI 태스크 형식 |

### 4.2 API 호출 수정

**수정 파일**: `src/api/flow.ts`

**변경 사항**:
- 엔드포인트 이름 변경 (changes → specs)
- 응답 형식 변경 (OpenSpec → MoAI SPEC)

---

## Phase 5: 정리 및 문서화 (Week 5-6)

### 5.1 OpenSpec 잔여물 제거

**제거할 디렉토리/파일**:
```
openspec/                              # 전체 디렉토리
.claude/skills/openspec-*/             # 12개 스킬
.claude/commands/opsx/                 # OpenSpec 명령
packages/zyflow-parser/                # 파서 패키지
server/cli-adapter/openspec.ts         # CLI 어댑터
backlog/task-002-openspec-deferred.md  # 백로그 태스크
```

### 5.2 문서 업데이트

**수정할 문서**:
- `README.md` - MoAI 기반 설명으로 변경
- `CHANGELOG.md` - 마이그레이션 기록
- `.moai/project/product.md` - 제품 비전 업데이트
- `.moai/project/structure.md` - 아키텍처 업데이트
- `docs/api.md` - API 문서 업데이트

### 5.3 기존 73개 태스크 처리

**옵션**:
1. **SPEC으로 승격**: 중요 태스크를 MoAI SPEC으로 변환
2. **Inbox로 이동**: 간단한 태스크는 inbox origin으로 변경
3. **아카이브**: 완료된/더 이상 필요 없는 태스크 아카이브

**권장 분류**:
- HIGH (Integration Hub - 34): SPEC-INTEG-001 생성
- MEDIUM (Post-Task Agent - 21): SPEC-AGENT-001 생성
- LOW (Cleanup - 6): Inbox 또는 아카이브

---

## 검증 계획

### 테스트 시나리오

1. **SPEC 생성 테스트**:
   ```bash
   /moai:1-plan "새 기능 테스트"
   # 검증: .moai/specs/SPEC-XXX/ 디렉토리 및 3개 파일 생성
   ```

2. **SPEC 목록 조회 테스트**:
   ```bash
   # MCP 도구 테스트
   zyflow_list_specs
   # 검증: .moai/specs/ 내 SPEC 목록 반환
   ```

3. **태스크 완료 테스트**:
   ```bash
   zyflow_mark_complete --spec-id SPEC-XXX --task-id AC-1
   # 검증: acceptance.md 체크박스 업데이트
   ```

4. **UI 테스트**:
   - Flow 페이지에서 SPEC 목록 표시 확인
   - SPEC 상세 페이지에서 3개 탭 (Spec, Plan, Acceptance) 표시 확인
   - 태스크 체크박스 토글 동작 확인

5. **동기화 테스트**:
   ```bash
   /moai:3-sync SPEC-XXX
   # 검증: 문서 생성, Git 커밋/PR 생성
   ```

### 회귀 테스트

- 기존 테스트 스위트 실행 (vitest)
- ESLint 검사 통과
- TypeScript 타입 체크 통과
- 빌드 성공 확인

---

## 리스크 및 완화

| 리스크 | 확률 | 완화 전략 |
|--------|------|----------|
| 데이터 손실 | 중간 | Git 태그로 백업, 마이그레이션 전 스냅샷 |
| UI 깨짐 | 중간 | 단계별 테스트, 스크린샷 비교 |
| MCP 도구 호환성 | 낮음 | 도구별 개별 테스트 |
| 성능 저하 | 낮음 | 벤치마크 비교 |

---

## 핵심 파일 목록

### 수정 필요 파일

```
server/routes/flow.ts                    # 2,228줄
server/sync-tasks.ts                     # OpenSpec → MoAI
server/tasks/db/schema.ts                # DB 스키마
mcp-server/index.ts                      # 1,836줄
src/components/flow/*.tsx                # UI 컴포넌트
src/api/flow.ts                          # API 클라이언트
package.json                             # 의존성 제거
```

### 제거 필요 파일

```
packages/zyflow-parser/                  # 전체 패키지
server/cli-adapter/openspec.ts           # CLI 어댑터
openspec/                                # 전체 디렉토리
.claude/skills/openspec-*/               # 12개 스킬
.claude/commands/opsx/                   # OpenSpec 명령
```

---

## 다음 단계

1. **즉시**: Phase 1 시작 (파서 패키지 제거, DB 마이그레이션 준비)
2. **승인 후**: 전체 계획 순차 실행
3. **완료 후**: 문서 업데이트 및 팀 공유

---

**계획 버전**: 1.0.0
**작성일**: 2026-01-28
**작성자**: R2-D2 (Alfred Orchestrator)
