# ZyFlow - Claude Code Configuration

## Project Overview

OpenSpec 기반 소프트웨어 개발 플로우 관리 도구입니다. Claude Code MCP 서버를 통해 태스크 관리를 지원합니다.

## Build Commands

```bash
npm run dev          # Vite 개발 서버
npm run build        # 프로덕션 빌드
npm run server       # API 서버 실행
npm run dev:all      # 서버 + 클라이언트 동시 실행
npm run build:mcp    # MCP 서버 빌드
npm run test         # Vitest 테스트 실행
npm run lint         # ESLint 검사
```

## Project Structure

```
zyflow/
├── src/              # React 프론트엔드
├── server/           # Express API 서버
├── mcp-server/       # MCP 서버 (Claude Code 통합)
└── openspec/         # OpenSpec 변경 제안 및 스펙
```

## Code Style & Best Practices

- **Modular Design**: 파일당 500줄 이하
- **Environment Safety**: 시크릿 하드코딩 금지
- **Test-First**: 테스트 먼저 작성
- **Clean Architecture**: 관심사 분리
- **Documentation**: 문서 최신화 유지

## File Organization Rules

**루트 폴더에 작업 파일 저장 금지. 적절한 디렉토리 사용:**
- `/src` - 소스 코드
- `/server` - 서버 코드
- `/tests` - 테스트 파일
- `/docs` - 문서

## Important Instructions

- 요청된 것만 수행 (그 이상, 이하 금지)
- 새 파일 생성보다 기존 파일 수정 선호
- 문서 파일(*.md)은 명시적 요청 시에만 생성
- 루트 폴더에 작업 파일 저장 금지
