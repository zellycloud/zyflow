# ZyFlow

OpenSpec 기반 태스크 관리 및 실행 도구

## 기능

- **웹 대시보드**: OpenSpec 변경 제안 및 태스크 진행 상황 시각화
- **MCP 서버**: Claude Code에서 직접 태스크 관리 가능

## 설치

```bash
npm install
npm run build:mcp
```

## MCP 서버 사용법

### Claude Code 설정

`~/.claude/settings.json`에 다음 설정 추가:

```json
{
  "mcpServers": {
    "zyflow": {
      "command": "node",
      "args": ["/path/to/zyflow/dist/mcp-server/index.js"],
      "env": {
        "ZYFLOW_PROJECT": "/path/to/your/project"
      }
    }
  }
}
```

### 사용 가능한 도구

| 도구 | 설명 |
|------|------|
| `zyflow_list_changes` | 현재 프로젝트의 OpenSpec 변경 제안 목록 조회 |
| `zyflow_get_tasks` | 특정 변경 제안의 전체 태스크 목록 조회 |
| `zyflow_get_next_task` | 다음 미완료 태스크와 컨텍스트 조회 |
| `zyflow_get_task_context` | 특정 태스크의 상세 컨텍스트 조회 |
| `zyflow_mark_complete` | 태스크를 완료로 표시 |
| `zyflow_mark_incomplete` | 태스크를 미완료로 되돌리기 |

### 예시

```
사용자: "zyflow-mcp-server의 다음 태스크 해줘"

Claude: [zyflow_get_next_task 호출]
        다음 태스크: README.md에 MCP 서버 사용법 추가

        [작업 수행...]

        완료했습니다. 태스크를 완료로 표시할까요?

사용자: "응"

Claude: [zyflow_mark_complete 호출]
        태스크가 완료되었습니다. (35/37 완료)
```

## 웹 대시보드

```bash
# 서버 + 클라이언트 동시 실행
npm run dev:all

# 또는 개별 실행
npm run server  # API 서버 (포트 3001)
npm run dev     # Vite 개발 서버
```

## 스크립트

| 스크립트 | 설명 |
|---------|------|
| `npm run dev` | Vite 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run server` | API 서버 실행 |
| `npm run dev:all` | 서버 + 클라이언트 동시 실행 |
| `npm run build:mcp` | MCP 서버 빌드 |
| `npm run mcp` | MCP 서버 실행 |

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ZYFLOW_PROJECT` | 대상 프로젝트 경로 | 현재 디렉토리 |
