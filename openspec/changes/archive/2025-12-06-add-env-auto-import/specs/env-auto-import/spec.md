# env-auto-import Specification

## Purpose

프로젝트의 `.env` 파일에서 서비스 계정과 환경변수를 자동으로 감지하고 Integration Hub에 등록하는 기능을 제공한다.

## ADDED Requirements

### Requirement: Environment Variable Scanning

시스템은 프로젝트 디렉토리에서 환경변수 파일을 스캔하고 알려진 서비스 패턴을 감지할 수 있어야 한다(SHALL).

지원하는 환경변수 파일:
- `.env`
- `.env.local`
- `.env.development`
- `.env.production`
- `.env.*.local`

#### Scenario: 단일 .env 파일 스캔

- **GIVEN** 프로젝트 루트에 `.env` 파일이 있다
- **WHEN** 환경변수 스캔을 실행한다
- **THEN** 파일이 파싱되고 알려진 서비스 패턴이 감지된다

#### Scenario: 여러 .env 파일 스캔

- **GIVEN** `.env`와 `.env.local` 파일이 모두 존재한다
- **WHEN** 환경변수 스캔을 실행한다
- **THEN** 모든 파일이 스캔되고 결과가 파일별로 그룹화된다

#### Scenario: .env 파일 없음

- **GIVEN** 프로젝트에 `.env*` 파일이 없다
- **WHEN** 환경변수 스캔을 실행한다
- **THEN** 빈 결과가 반환되고 적절한 메시지가 표시된다

---

### Requirement: Service Pattern Recognition

시스템은 환경변수 이름과 값을 분석하여 알려진 서비스를 자동으로 인식해야 한다(SHALL).

지원하는 서비스:
- **인증/Git**: GitHub, GitLab, Bitbucket
- **BaaS**: Supabase, Firebase, PocketBase, Appwrite
- **배포**: Vercel, Netlify, Cloudflare, AWS, GCP, Azure
- **모니터링**: Sentry, LogRocket, DataDog
- **결제**: Stripe, PayPal, Paddle
- **AI/ML**: OpenAI, Anthropic, Cohere, Replicate, HuggingFace
- **데이터베이스**: PostgreSQL, MySQL, MongoDB, Redis, PlanetScale, Neon, Upstash
- **이메일**: SendGrid, Resend, Postmark, Mailgun
- **인증 서비스**: Clerk, Auth0, NextAuth, Supabase Auth
- **메시징**: Twilio, Vonage
- **스토리지**: S3, Cloudflare R2, Uploadthing
- **검색**: Algolia, Typesense, Meilisearch

#### Scenario: Supabase 자동 감지

- **GIVEN** `.env` 파일에 `SUPABASE_URL`과 `SUPABASE_ANON_KEY`가 있다
- **WHEN** 환경변수 스캔을 실행한다
- **THEN** Supabase 서비스가 감지되고 해당 credential이 추출된다

#### Scenario: Next.js 접두사 처리

- **GIVEN** `.env` 파일에 `NEXT_PUBLIC_SUPABASE_URL`이 있다
- **WHEN** 환경변수 스캔을 실행한다
- **THEN** `NEXT_PUBLIC_` 접두사를 제거하고 Supabase로 인식한다

#### Scenario: 여러 서비스 동시 감지

- **GIVEN** `.env` 파일에 GitHub, Supabase, Stripe 관련 변수가 있다
- **WHEN** 환경변수 스캔을 실행한다
- **THEN** 세 서비스가 모두 개별적으로 감지된다

#### Scenario: DATABASE_URL 자동 분류

- **GIVEN** `DATABASE_URL=postgres://...` 형식의 변수가 있다
- **WHEN** 환경변수 스캔을 실행한다
- **THEN** URL 스키마를 분석하여 PostgreSQL로 분류된다

---

### Requirement: Import Preview

시스템은 임포트 전에 감지된 서비스 목록을 미리보기로 표시해야 한다(SHALL).

#### Scenario: 미리보기 표시

- **GIVEN** 스캔 결과에 3개의 서비스가 감지되었다
- **WHEN** 임포트 미리보기를 요청한다
- **THEN** 각 서비스별로 감지된 credential과 등록 여부 선택 UI가 표시된다

#### Scenario: 기존 계정 중복 감지

- **GIVEN** 스캔 결과에 이미 등록된 GitHub 계정과 동일한 username이 감지되었다
- **WHEN** 임포트 미리보기를 표시한다
- **THEN** 해당 항목에 "이미 등록됨" 경고가 표시되고 업데이트 옵션이 제공된다

#### Scenario: 민감 정보 마스킹

- **GIVEN** 미리보기에 API 키가 포함되어 있다
- **WHEN** 미리보기 화면을 표시한다
- **THEN** 토큰과 키 값은 `sk-...****` 형태로 마스킹된다

---

### Requirement: Selective Import

사용자는 감지된 서비스 중 원하는 항목만 선택하여 임포트할 수 있어야 한다(SHALL).

#### Scenario: 부분 임포트

- **GIVEN** 5개의 서비스가 감지되었다
- **WHEN** 사용자가 2개만 선택하고 임포트한다
- **THEN** 선택된 2개의 서비스만 등록되고 나머지는 무시된다

#### Scenario: 기존 계정 업데이트

- **GIVEN** 감지된 GitHub 계정이 이미 등록되어 있다
- **WHEN** "업데이트" 옵션을 선택하고 임포트한다
- **THEN** 기존 계정의 credential이 새 값으로 업데이트된다

#### Scenario: 임포트 결과 표시

- **GIVEN** 임포트가 완료되었다
- **WHEN** 결과를 확인한다
- **THEN** 생성/업데이트/스킵된 항목 수가 표시된다

---

### Requirement: MCP Tool Integration

AI 어시스턴트가 환경변수 스캔 및 임포트를 수행할 수 있는 MCP 도구를 제공해야 한다(SHALL).

#### Scenario: MCP로 환경변수 스캔

- **GIVEN** 프로젝트에 `.env` 파일이 있다
- **WHEN** AI가 `integration_scan_env` 도구를 호출한다
- **THEN** 감지된 서비스 목록이 반환된다 (credential 값은 마스킹)

#### Scenario: MCP로 자동 임포트

- **GIVEN** 스캔 결과에 2개의 서비스가 감지되었다
- **WHEN** AI가 `integration_import_env` 도구를 호출한다
- **THEN** 감지된 서비스가 자동으로 등록되고 결과가 반환된다

---

### Requirement: Extended Service Types

시스템은 기본 제공 서비스 타입 외에 확장된 서비스 타입을 지원해야 한다(SHALL).

기존 타입: `github`, `supabase`, `vercel`, `sentry`, `custom`

확장 타입:
- `firebase`, `aws`, `gcp`, `azure`
- `stripe`, `openai`, `anthropic`
- `mongodb`, `postgresql`, `redis`
- `sendgrid`, `resend`, `twilio`
- `clerk`, `auth0`

#### Scenario: 새 서비스 타입 등록

- **GIVEN** OpenAI API 키가 감지되었다
- **WHEN** 임포트를 실행한다
- **THEN** `openai` 타입의 서비스 계정이 생성된다

#### Scenario: Custom 타입 폴백

- **GIVEN** 알려지지 않은 패턴의 환경변수가 있다
- **WHEN** 수동으로 임포트를 요청한다
- **THEN** `custom` 타입으로 등록할 수 있다
