# OpenSpec Skill

OpenSpec 기반 스펙 주도 개발(Spec-Driven Development) 워크플로우를 관리하는 스킬입니다.

## 핵심 역할

1. **Proposal 작성**: 변경 제안서 작성 및 관리
2. **Tasks.md 관리**: 구현 체크리스트 관리 및 진행 추적
3. **Spec Delta 관리**: ADDED/MODIFIED/REMOVED 변경사항 관리
4. **7단계 파이프라인 워크플로우**: 전체 개발 주기 관리

## 7단계 파이프라인 워크플로우

### Stage 1️⃣: Discovery (발견)
```
- 요청 분석 및 스코프 파악
- 기존 스펙 검토: `openspec list --specs`
- 관련 변경사항 확인: `openspec list`
```

### Stage 2️⃣: Planning (계획)
```
- Change ID 결정 (kebab-case, verb-led)
- proposal.md 초안 작성
- 영향 범위 분석
```

### Stage 3️⃣: Specification (명세)
```
- Spec delta 파일 작성
- 요구사항별 시나리오 작성 (#### Scenario: 형식)
- `openspec validate <change-id> --strict` 실행
```

### Stage 4️⃣: Design (설계)
```
- design.md 작성 (필요시)
  - 크로스 커팅 변경
  - 새 외부 의존성
  - 보안/성능/마이그레이션 복잡도
- 기술적 결정 문서화
```

### Stage 5️⃣: Implementation (구현)
```
- tasks.md 체크리스트 순차 완료
- 코드 작성 및 테스트
- 진행 상황 업데이트
```

### Stage 6️⃣: Verification (검증)
```
- 모든 시나리오 테스트 통과
- 코드 리뷰 완료
- `openspec validate --strict` 통과
```

### Stage 7️⃣: Archive (아카이브)
```
- 배포 후 아카이브:
  `openspec archive <change-id> --yes`
- specs/ 디렉토리 업데이트
- 변경 이력 관리
```

## Proposal 작성 지침

### proposal.md 필수 구조
```markdown
# Change: [변경 제목]

## Why
[1-2문장으로 문제/기회 설명]

## What Changes
- [변경사항 목록]
- **BREAKING** [파괴적 변경 표시]

## Impact
- Affected specs: [영향받는 capability 목록]
- Affected code: [주요 파일/시스템]
```

### Change ID 명명 규칙
- kebab-case 사용: `add-two-factor-auth`
- verb-led 접두사: `add-`, `update-`, `remove-`, `refactor-`
- 고유성 확보: 중복 시 `-2`, `-3` 등 추가

## tasks.md 관리 지침

### 파싱 호환 형식
```markdown
# Tasks: Change 제목

## Phase 1: 단계명
### 1.1 섹션명
- [ ] 미완료 태스크
- [x] 완료 태스크
  - [ ] 하위 태스크 (2칸 들여쓰기)
```

### 규칙
- Phase는 `## Phase N:` 또는 `## N.` 형식
- 서브섹션은 `### N.N` 형식
- 하위 태스크는 정확히 **2칸** 들여쓰기
- 완료 시 `- [ ]` → `- [x]` 업데이트

## Spec Delta 작성

### 필수 시나리오 형식
```markdown
#### Scenario: 사용자 로그인 성공
- **WHEN** 유효한 자격 증명 제공
- **THEN** JWT 토큰 반환
```

### Delta 연산자
- `## ADDED Requirements` - 새 기능
- `## MODIFIED Requirements` - 동작 변경
- `## REMOVED Requirements` - 기능 제거
- `## RENAMED Requirements` - 이름 변경

## CLI 명령어 참조

```bash
# 상태 확인
openspec list                    # 활성 변경사항
openspec list --specs            # 스펙 목록
openspec show <item>             # 상세 보기

# 검증
openspec validate <id> --strict  # 엄격 검증

# 아카이브
openspec archive <id> --yes      # 비대화형 아카이브
```

## 언제 Proposal을 건너뛰는가?

Skip proposal for:
- 버그 수정 (의도된 동작 복원)
- 오타, 포맷팅, 주석
- 의존성 업데이트 (비파괴적)
- 설정 변경
- 기존 동작에 대한 테스트
