# ZyFlow MCP Server 태스크

## 1. 프로젝트 설정

- [x] @modelcontextprotocol/sdk 패키지 설치
- [x] mcp-server 디렉토리 구조 생성
- [x] tsconfig.json에 mcp-server 빌드 설정 추가
- [x] package.json에 빌드 스크립트 추가 (build:mcp)

## 2. MCP 서버 기본 구조

- [x] mcp-server/index.ts 생성 (Server 초기화)
- [x] stdio 전송 설정
- [x] Tool 라우팅 기본 구조 작성
- [x] 에러 핸들링 설정

## 3. Tool 핸들러 구현

- [x] zyflow_list_changes 구현 (변경 제안 목록)
- [x] zyflow_get_tasks 구현 (태스크 목록)
- [x] zyflow_get_next_task 구현 (다음 미완료 태스크 + 컨텍스트)
- [x] zyflow_get_task_context 구현 (상세 컨텍스트)
- [x] zyflow_mark_complete 구현 (완료 표시)
- [x] zyflow_mark_incomplete 구현 (미완료로 되돌리기)

## 4. 컨텍스트 수집 로직

- [x] mcp-server/context.ts 생성
- [x] proposal.md 읽기 로직
- [x] 관련 spec 파일 찾기 로직
- [x] 완료/미완료 태스크 집계
- [x] 관련 파일 추천 로직 (선택적)

## 5. 기존 모듈 통합

- [x] server/parser.ts를 mcp-server에서 import 가능하도록 조정
- [x] server/config.ts 재사용 확인
- [x] 공통 타입 정의 분리 (types.ts)

## 6. 빌드 및 배포

- [x] TypeScript 빌드 테스트
- [x] dist/mcp-server/index.js 생성 확인
- [x] 실행 권한 설정 (필요시)

## 7. Claude Code 연동

- [x] ~/.claude/settings.json 설정 가이드 작성
- [x] 환경변수 설정 방법 문서화
- [x] MCP 서버 등록 테스트

## 8. 테스트

- [x] zyflow_list_changes 테스트
- [x] zyflow_get_tasks 테스트
- [x] zyflow_get_next_task 테스트
- [x] zyflow_mark_complete 테스트
- [x] 연속 태스크 실행 테스트
- [x] 에러 케이스 테스트

## 9. 문서화 및 정리

- [x] README.md에 MCP 서버 사용법 추가
- [x] 기존 CLI spawn 코드 제거 (선택적) - 웹 UI 기능 유지를 위해 보존
- [x] 웹 UI 연동 방안 검토 (선택적) - MCP와 웹 UI 병행 사용 가능
