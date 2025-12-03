# Change: Integration Hub - 통합 서비스 및 환경 관리

## Why

개발자가 여러 프로젝트를 동시에 관리할 때 다음과 같은 고통이 발생합니다:

1. **계정 혼란**: GitHub 계정이 여러 개일 때 어느 프로젝트가 어느 계정인지 매번 헷갈림
2. **환경별 설정 분산**: staging/production 서버, DB, API 키가 프로젝트마다 다르고 흩어져 있음
3. **인증 정보 분산**: .env, keychain, MCP config, git config 등이 제각각
4. **반복적인 컨텍스트 전달**: AI에게 매번 "Supabase URL은 이거고, 테스트 계정은 이거야" 설명
5. **서비스 연동 관리**: Vercel, Sentry, Supabase 등 각 프로젝트별 연동 상태 파악 어려움

## What Changes

### 새로운 기능: Integration Hub

프로젝트별로 서비스 연동 및 환경 설정을 중앙 관리하는 시스템:

1. **서비스 계정 관리**
   - GitHub (멀티 계정 지원)
   - Supabase (프로젝트별 URL, API 키)
   - Vercel (팀/프로젝트 연결)
   - Sentry (프로젝트 연결)
   - 커스텀 서비스 추가 가능

2. **환경별 설정 관리**
   - local / staging / production 환경 구분
   - 환경별 서버 URL, DB 연결 정보
   - 환경별 API 키 및 인증 정보

3. **테스트 계정 관리**
   - 프로젝트별 테스트 계정 정보 저장
   - 역할별 계정 (admin, user 등)
   - AI가 작업 시 자동으로 참조

4. **프로젝트-서비스 매핑**
   - 각 프로젝트가 어떤 서비스/계정을 사용하는지 연결
   - 프로젝트 선택 시 관련 컨텍스트 자동 로드

5. **보안**
   - 민감 정보 암호화 저장 (macOS Keychain 연동 또는 암호화 파일)
   - 마스킹된 표시 (UI에서 키 값 숨김)

### UI 변경

- Settings 페이지에 "Integrations" 탭 추가
- 서비스별 계정 목록 및 설정 화면
- 프로젝트별 연동 현황 대시보드

## Impact

- Affected specs: 없음 (새로운 capability)
- Affected code:
  - `src/pages/Settings.tsx` - Integrations 탭 추가
  - `server/` - 새로운 API 엔드포인트
  - `mcp-server/` - 컨텍스트 제공 도구 추가
  - 새로운 데이터 저장소 (SQLite 또는 암호화 JSON)
