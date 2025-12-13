# Design: GitDiagram 통합 아키텍처

## Context

GitDiagram은 GitHub 저장소를 Mermaid.js 다이어그램으로 변환하는 오픈소스 도구다. Python(FastAPI) 백엔드와 Next.js 프론트엔드로 구성되어 있으며, OpenAI o4-mini를 사용한다.

zyflow는 TypeScript/Express 기반이므로 Python 코드를 직접 사용할 수 없다. 핵심 로직(프롬프트 엔지니어링)만 TypeScript로 포팅하고, zyflow 환경에 맞게 최적화한다.

**Stakeholders:**
- Claude Code 사용자 (MCP 도구로 다이어그램 생성)
- zyflow 웹 UI 사용자 (프로젝트 구조 시각화)

## Goals / Non-Goals

**Goals:**
- GitDiagram의 3단계 프롬프트 로직을 TypeScript로 포팅
- MCP 도구로 노출하여 Claude Code에서 사용 가능
- 업스트림 변경을 쉽게 추적하고 반영할 수 있는 구조
- zyflow 웹 UI에서 Mermaid 다이어그램 렌더링

**Non-Goals:**
- GitDiagram 전체를 submodule로 포함 (Python 의존성 피함)
- 외부 gitdiagram.com API 사용 (자체 호스팅)
- 실시간 스트리밍 생성 (v1에서는 일괄 생성)

## Architecture

```
zyflow/
├── packages/
│   └── gitdiagram-core/           # 업스트림 로직 포팅
│       ├── package.json           # upstream 버전 추적 메타데이터
│       ├── UPSTREAM.md            # 동기화 가이드
│       └── src/
│           ├── prompts.ts         # 3단계 프롬프트 (prompts.py 포팅)
│           ├── generator.ts       # 다이어그램 생성 로직
│           ├── file-tree.ts       # 파일 트리 추출
│           └── index.ts           # 패키지 진입점
├── mcp-server/
│   ├── diagram-tools.ts           # MCP 도구 정의
│   └── index.ts                   # 도구 등록
└── src/
    └── components/
        └── diagram/
            ├── MermaidRenderer.tsx # Mermaid 렌더링
            └── DiagramViewer.tsx   # 다이어그램 뷰어
```

## Decisions

### D1: 포팅 방식 - TypeScript 재구현

**결정:** GitDiagram의 프롬프트와 로직을 TypeScript로 재구현한다.

**대안 고려:**
1. Git Submodule - Python 런타임 필요, 복잡도 증가
2. API 호출 - 외부 의존성, 비용 발생
3. TypeScript 포팅 - 자체 관리 가능, zyflow 환경 일치

**근거:** zyflow는 TypeScript 기반이므로 일관성 유지. 핵심 로직(프롬프트)은 언어 독립적이라 포팅 비용 낮음.

### D2: LLM 선택 - Claude API 우선

**결정:** Claude API를 기본으로 사용하고, OpenAI를 대체 옵션으로 지원한다.

**근거:** zyflow는 Claude Code와 통합되어 있으므로 Claude API가 자연스러움. 단, GitDiagram 원본이 OpenAI를 사용하므로 호환성 유지.

### D3: 패키지 분리 - packages/gitdiagram-core

**결정:** 별도 패키지로 분리하여 업스트림 추적을 용이하게 한다.

**구조:**
```json
// packages/gitdiagram-core/package.json
{
  "name": "@zyflow/gitdiagram-core",
  "version": "1.0.0",
  "upstream": {
    "repo": "ahmedkhaleel2004/gitdiagram",
    "commit": "abc123...",
    "lastSync": "2025-12-03",
    "files": [
      "backend/app/prompts.py",
      "backend/app/routers/generate.py"
    ]
  }
}
```

### D4: 업스트림 동기화 전략

**워크플로우:**
1. 포크 생성: `git fork ahmedkhaleel2004/gitdiagram`
2. 주기적 동기화: `git fetch upstream && git merge upstream/main`
3. 변경 감지 스크립트로 업데이트 알림
4. 수동으로 TypeScript 코드 업데이트

**자동화 스크립트:**
```bash
#!/bin/bash
# scripts/check-upstream.sh
UPSTREAM_COMMIT=$(git ls-remote https://github.com/ahmedkhaleel2004/gitdiagram HEAD | cut -f1)
LOCAL_COMMIT=$(jq -r '.upstream.commit' packages/gitdiagram-core/package.json)

if [ "$UPSTREAM_COMMIT" != "$LOCAL_COMMIT" ]; then
  echo "::warning::GitDiagram upstream updated: $LOCAL_COMMIT -> $UPSTREAM_COMMIT"
fi
```

## Data Flow

```
1. 사용자 요청
   └─> MCP: diagram_generate(path, options)

2. 파일 트리 추출
   └─> file-tree.ts: getFileTree(path)
   └─> README.md 읽기

3. 3단계 AI 처리
   ├─> Stage 1: 아키텍처 설명 생성 (SYSTEM_FIRST_PROMPT)
   ├─> Stage 2: 컴포넌트-파일 매핑 (SYSTEM_SECOND_PROMPT)
   └─> Stage 3: Mermaid 코드 생성 (SYSTEM_THIRD_PROMPT)

4. 결과 반환
   └─> Mermaid 코드 + 메타데이터
```

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| 프롬프트 포팅 시 품질 저하 | 다이어그램 품질 감소 | 원본 프롬프트 최대한 유지, 테스트 케이스 작성 |
| 업스트림 대규모 변경 | 동기화 비용 증가 | 주요 변경만 선별 반영, 프롬프트 중심으로 추적 |
| LLM 비용 | API 비용 발생 | 캐싱, 토큰 최적화, 사용량 제한 |
| Mermaid 문법 오류 | 렌더링 실패 | GitDiagram의 문법 검증 로직 포함 |

## Migration Plan

1. **Phase 1: 패키지 생성** (이번 변경)
   - `packages/gitdiagram-core/` 스캐폴딩
   - 프롬프트 포팅
   - 기본 생성 로직

2. **Phase 2: MCP 통합**
   - `diagram_generate` 도구 추가
   - Claude Code에서 테스트

3. **Phase 3: 프론트엔드**
   - Mermaid 렌더러 컴포넌트
   - 프로젝트 대시보드 연동

4. **Phase 4: OpenSpec 연동** (후속 변경)
   - 변경별 영향도 시각화
   - Before/After 비교

## Open Questions

1. **Claude API vs OpenAI API**: 기본값을 어느 것으로 할지?
   - 제안: Claude API 기본, 환경변수로 전환 가능

2. **캐싱 전략**: 같은 프로젝트를 반복 분석할 때 캐싱할지?
   - 제안: 파일 트리 해시 기반 캐싱

3. **토큰 제한**: 대규모 저장소 처리 시 토큰 제한?
   - 제안: GitDiagram과 동일하게 50k~195k 범위
