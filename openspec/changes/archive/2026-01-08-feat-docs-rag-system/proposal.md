# Change: 문서 뷰어 및 RAG 기반 지식 베이스 구축

## Summary

ZyFlow 내에서 프로젝트의 모든 문서(/docs, README, OpenSpec)를 통합 열람하고, LLM 기반 RAG(Retrieval-Augmented Generation) 기술을 활용하여 자연어 질의응답이 가능한 "지식 베이스(Knowledge Base)" 시스템을 구축합니다.

## Motivation

- **파편화된 정보**: 프로젝트 문서(`docs/`), 기획서(`openspec/`), 변경 이력(`CHANGELOG`)이 흩어져 있어 전체 맥락 파악이 어렵습니다.
- **단순 검색의 한계**: 기존의 키워드 매칭 검색(`grep`)으로는 "이 프로젝트의 인증 구조가 어떻게 돼?"와 같은 추상적인 질문에 답을 얻기 힘듭니다.
- **컨텍스트 스위칭 비용**: 개발 도중 문서를 확인하기 위해 IDE나 웹 브라우저, 파일 탐색기를 오가는 비용을 줄여야 합니다.

## Proposed Solution

### 1. Docs 통합 UI 신설

- **네비게이션**: ZyFlow 사이드바에 `Docs` 탭 추가.
- **트리 뷰**: `/docs` 디렉토리 구조와 루트 마크다운 파일, `/openspec` 스펙들을 통합 트리로 제공.
- **마크다운 뷰어**: 
  - GFM(GitHub Flavored Markdown) 지원.
  - **Mermaid 차트** 렌더링 지원 (아키텍처, 플로우차트).
  - Syntax Highlighting.
  - 내부 링크(Wiki style) 네비게이션 지원.

### 2. 검색 엔진 고도화

- **통합 인덱싱**: `/docs`, `openspec/**/spec.md`, `openspec/**/proposal.md` 등 모든 마크다운 자원을 검색 대상으로 합니다.
- **하이브리드 검색**:
  - **키워드 검색**: 정확한 파일명이나 용어 찾기 (기존 구현 활용).
  - **시맨틱 검색 (RAG)**: 문장이나 의도 기반 검색 ("DB 스키마 변경 사항 보여줘").

### 3. RAG (AI 지식 베이스) 아키텍처

- **벡터 저장소**: 로컬 환경 친화적인 임베딩 DB 도입 (예: `LanceDB` 또는 SQLite 기반 `sqlite-vss`).
- **임베딩 파이프라인**: 
  - 파일 변경 감지(Watcher) → 텍스트 청킹(Chunking) → 임베딩 생성 → 벡터 DB 저장.
- **AI 답변 생성**:
  - 사용자 질문(채팅) → 관련 청크 검색(Retrieve) → LLM 컨텍스트 주입 → 답변 생성.
  - "AI에게 질문하기" Floating Action Button을 문서 뷰어에 배치.

## Implementation Details

### Phase 1: 기본 뷰어 구현
- `routes/docs.ts` API를 활용하여 UI 트리 및 뷰어 개발.
- 기존의 단순 검색 바 연동.
- Mermaid 및 Code Block 렌더링 컴포넌트 추가.

### Phase 2: OpenSpec 통합
- OpenSpec의 `spec.md`, `proposal.md` 파일들도 Docs 섹션에서 탐색 가능하도록 가상 디렉토리 구조 매핑.
- 문서 간 상호 참조 링크(`[Spec](...)`) 지원.

### Phase 3: RAG 파이프라인 구축 (Backend)
- 문서 파싱 및 임베딩 로직 구현. (OpenAI Embeddings 또는 Local Embeddings)
- 질문 처리를 위한 전용 REST API 엔드포인트 (`POST /api/docs/ask`).

## Design Decisions

| 항목 | 결정 | 이유 |
|------|------|------|
| **벡터 DB** | `LanceDB` (파일 기반) | 별도 서버 설치 없이 로컬 파일시스템에 저장 가능하며 빠름. |
| **Viewer** | `react-markdown` + `rehype` | 유연한 플러그인 생태계(Mermaid 등) 활용 용이. |
| **문서 범위** | `/docs` + `/openspec` | 기술 문서와 기획 문서를 한 곳에서 봐야 함. |

## Required Specs

- [Docs Viewer UI Spec](specs/docs-viewer/spec.md)
- [RAG Engine Spec](specs/rag-engine/spec.md)
