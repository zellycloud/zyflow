# Tasks: GitDiagram 통합

## 1. 패키지 스캐폴딩

- [x] 1.1 `packages/gitdiagram-core/` 디렉토리 구조 생성
- [x] 1.2 `package.json` 작성 (upstream 메타데이터 포함)
- [x] 1.3 TypeScript 설정 (`tsconfig.json`)
- [x] 1.4 `UPSTREAM.md` 동기화 가이드 문서 작성

## 2. 프롬프트 포팅

- [x] 2.1 GitDiagram `prompts.py` 분석 및 TypeScript 변환
- [x] 2.2 `SYSTEM_FIRST_PROMPT` 포팅 (아키텍처 설명 생성)
- [x] 2.3 `SYSTEM_SECOND_PROMPT` 포팅 (컴포넌트 매핑)
- [x] 2.4 `SYSTEM_THIRD_PROMPT` 포팅 (Mermaid 생성)
- [x] 2.5 추가 프롬프트 포팅 (사용자 지시사항, 수정 등)

## 3. 핵심 로직 구현

- [x] 3.1 `file-tree.ts` - 디렉토리 구조 추출 함수
- [x] 3.2 `generator.ts` - 3단계 AI 호출 로직
- [x] 3.3 LLM 어댑터 (Claude API / OpenAI API 추상화)
- [x] 3.4 Mermaid 문법 검증 및 클릭 이벤트 처리
- [x] 3.5 `index.ts` - 패키지 public API

## 4. MCP 도구 통합

- [ ] 4.1 `mcp-server/diagram-tools.ts` 생성
- [ ] 4.2 `diagram_generate` 도구 정의 (저장소 경로 → Mermaid)
- [ ] 4.3 `diagram_from_change` 도구 (OpenSpec 변경 영향도)
- [ ] 4.4 `mcp-server/index.ts`에 도구 등록
- [ ] 4.5 MCP 빌드 및 테스트

## 5. 프론트엔드 컴포넌트

- [ ] 5.1 `mermaid` 패키지 설치 및 설정
- [ ] 5.2 `MermaidRenderer.tsx` - Mermaid 코드 렌더링
- [ ] 5.3 `DiagramViewer.tsx` - 다이어그램 뷰어 (줌, 팬)
- [ ] 5.4 API 엔드포인트 (`/api/diagram/generate`)
- [ ] 5.5 프로젝트 대시보드에 다이어그램 탭 추가

## 6. 테스트 및 문서화

- [ ] 6.1 프롬프트 포팅 검증 테스트 (원본과 결과 비교)
- [ ] 6.2 MCP 도구 통합 테스트
- [ ] 6.3 프론트엔드 컴포넌트 테스트
- [ ] 6.4 사용 가이드 문서 작성

## 7. 업스트림 동기화 인프라

- [ ] 7.1 GitDiagram 포크 생성
- [ ] 7.2 `scripts/check-upstream.sh` 스크립트 작성
- [ ] 7.3 GitHub Actions 워크플로우 (주간 업스트림 체크)
