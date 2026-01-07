# Task: 문서 및 RAG 시스템 구현

## Phase 1: Docs Viewer UI

- [x] `DocsLayout` 및 사이드바 라우팅 추가
- [x] 문서 트리 (`DocTree`) 컴포넌트 구현
- [x] 마크다운 뷰어 (`MarkdownViewer`) 구현
    - [x] GFM 스타일링 적용
    - [x] `mermaid` 다이어그램 렌더링 지원
    - [x] 코드 블록 Syntax Highlighting
- [x] `routes/docs.ts` API 연동 (목록 불러오기, 내용 읽기)

## Phase 2: OpenSpec 통합 및 검색 개선

- [x] OpenSpec 파일들을 문서 트리에 가상 병합하는 로직 추가
- [x] 문서 편집 기능 추가 (`MarkdownEditor` 구현)
- [ ] 문서 내 내부 링크 핸들링 (클릭 시 해당 문서로 이동)
- [x] 검색 UI 개선 (모달 형태의 `Cmd+K` 인터페이스)

## Phase 3: RAG 백엔드 구축

- [x] 벡터 DB(`LanceDB`) 설치 및 설정
- [x] 문서 임베딩 생성기 구현 (`Transformers.js` 사용)
- [ ] 파일 변경 감지 시 임베딩 업데이트 로직 (`watcher`)
- [x] `POST /api/docs/ask` API 구현 (질문 -> 검색 -> 컨텍스트 반환)
- [x] `POST /api/docs/index` API 구현 (문서 인덱싱)
- [x] `GET /api/docs/index/stats` API 구현 (인덱스 통계)

## Phase 4: RAG UI 연동

- [ ] 문서 뷰어 하단에 "AI에게 질문하기" 채팅 인터페이스 추가
- [ ] 답변 스트리밍 처리 및 출처(Reference) 표시 기능
