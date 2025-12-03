# Tasks: 환경변수 자동 임포트

## 1. 환경변수 파서 구현

### 1.1 파서 코어
- [ ] 1.1.1 `.env` 파일 파싱 유틸리티 (`server/integrations/env-parser.ts`)
- [ ] 1.1.2 서비스 패턴 정의 및 매칭 로직 (`server/integrations/service-patterns.ts`)
- [ ] 1.1.3 여러 `.env*` 파일 스캔 (`.env`, `.env.local`, `.env.development`, `.env.production`)

### 1.2 서비스 타입 확장
- [ ] 1.2.1 새 서비스 타입 추가 (firebase, aws, stripe, openai, anthropic 등)
- [ ] 1.2.2 각 서비스별 Credential 인터페이스 정의
- [ ] 1.2.3 서비스별 검증 로직 추가

## 2. API 엔드포인트

### 2.1 임포트 API
- [ ] 2.1.1 `GET /api/integrations/env/scan` - .env 파일 스캔 및 미리보기
- [ ] 2.1.2 `POST /api/integrations/env/import` - 선택한 항목 임포트
- [ ] 2.1.3 임포트 결과 응답 (생성/업데이트/스킵 카운트)

## 3. MCP 도구

### 3.1 Integration MCP 도구
- [ ] 3.1.1 `integration_scan_env` - 프로젝트 .env 스캔 및 감지된 서비스 반환
- [ ] 3.1.2 `integration_import_env` - 감지된 서비스 자동 임포트

## 4. UI 구현

### 4.1 임포트 버튼 및 모달
- [ ] 4.1.1 Settings > Integrations에 "Import from .env" 버튼 추가
- [ ] 4.1.2 임포트 미리보기 모달 컴포넌트
- [ ] 4.1.3 서비스별 체크박스 선택 UI
- [ ] 4.1.4 중복 계정 경고 표시

### 4.2 프로젝트 상세 페이지
- [ ] 4.2.1 프로젝트 Integrations 섹션에 "Import" 버튼 추가
- [ ] 4.2.2 환경별 .env 파일 선택 기능

## 5. 테스트

### 5.1 단위 테스트
- [ ] 5.1.1 env-parser 파싱 테스트
- [ ] 5.1.2 service-patterns 매칭 테스트
- [ ] 5.1.3 다양한 .env 형식 테스트 (주석, 따옴표, 멀티라인 등)
