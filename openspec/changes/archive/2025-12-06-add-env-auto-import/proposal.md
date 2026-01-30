# Change: 환경변수 자동 임포트

## Summary

프로젝트의 `.env` 파일을 자동으로 파싱하여 Integration Hub에 서비스 계정과 환경 설정을 자동 등록하는 기능을 추가한다.

## Motivation

현재 Integration Hub에서 서비스 계정과 환경변수를 수동으로 입력해야 한다. 대부분의 프로젝트는 이미 `.env` 파일에 필요한 정보가 있으므로, 이를 자동으로 감지하고 임포트하면 설정 시간을 크게 줄일 수 있다.

## Scope

### In Scope
- `.env`, `.env.local`, `.env.development`, `.env.production` 파일 파싱
- 알려진 서비스 패턴 자동 인식 (GitHub, Supabase, Vercel, Sentry 등 20+ 서비스)
- UI에서 "Import from .env" 버튼 제공
- MCP 도구 `integration_import_env` 추가
- 임포트 전 미리보기 및 선택적 등록

### Out of Scope
- `.env` 파일 수정/생성
- 원격 환경변수 동기화 (Vercel/Netlify 등에서 가져오기)

## Design

### 지원 서비스 및 환경변수 패턴

| 서비스 | 환경변수 패턴 | 매핑 |
|--------|--------------|------|
| **GitHub** | `GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_PAT` | token |
| | `GITHUB_USERNAME`, `GH_USER` | username |
| **Supabase** | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | projectUrl |
| | `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anonKey |
| | `SUPABASE_SERVICE_ROLE_KEY` | serviceRoleKey |
| **Vercel** | `VERCEL_TOKEN` | token |
| | `VERCEL_TEAM_ID`, `VERCEL_ORG_ID` | teamId |
| **Sentry** | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | dsn |
| | `SENTRY_AUTH_TOKEN` | authToken |
| | `SENTRY_ORG` | orgSlug |
| | `SENTRY_PROJECT` | projectSlug |
| **Firebase** | `FIREBASE_API_KEY` | apiKey |
| | `FIREBASE_AUTH_DOMAIN` | authDomain |
| | `FIREBASE_PROJECT_ID` | projectId |
| **AWS** | `AWS_ACCESS_KEY_ID` | accessKeyId |
| | `AWS_SECRET_ACCESS_KEY` | secretAccessKey |
| | `AWS_REGION` | region |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_API_KEY` | secretKey |
| | `STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | publishableKey |
| | `STRIPE_WEBHOOK_SECRET` | webhookSecret |
| **OpenAI** | `OPENAI_API_KEY` | apiKey |
| | `OPENAI_ORG_ID` | orgId |
| **Anthropic** | `ANTHROPIC_API_KEY` | apiKey |
| **MongoDB** | `MONGODB_URI`, `MONGO_URL`, `DATABASE_URL` (mongodb://) | uri |
| **PostgreSQL** | `DATABASE_URL` (postgres://), `POSTGRES_URL` | uri |
| **Redis** | `REDIS_URL`, `REDIS_URI` | uri |
| **Cloudflare** | `CLOUDFLARE_API_TOKEN` | apiToken |
| | `CLOUDFLARE_ACCOUNT_ID` | accountId |
| **Twilio** | `TWILIO_ACCOUNT_SID` | accountSid |
| | `TWILIO_AUTH_TOKEN` | authToken |
| **SendGrid** | `SENDGRID_API_KEY` | apiKey |
| **Resend** | `RESEND_API_KEY` | apiKey |
| **Clerk** | `CLERK_SECRET_KEY` | secretKey |
| | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | publishableKey |
| **Auth0** | `AUTH0_SECRET` | secret |
| | `AUTH0_CLIENT_ID` | clientId |
| | `AUTH0_CLIENT_SECRET` | clientSecret |
| | `AUTH0_ISSUER_BASE_URL` | issuerBaseUrl |
| **Google** | `GOOGLE_CLIENT_ID` | clientId |
| | `GOOGLE_CLIENT_SECRET` | clientSecret |
| **Prisma** | `DATABASE_URL` | databaseUrl |
| **PlanetScale** | `DATABASE_URL` (mysql://) | uri |
| **Neon** | `DATABASE_URL` (postgres://neon) | uri |
| **Upstash** | `UPSTASH_REDIS_REST_URL` | restUrl |
| | `UPSTASH_REDIS_REST_TOKEN` | restToken |

### 임포트 흐름

```
1. 사용자가 "Import from .env" 클릭
2. 프로젝트 루트에서 .env* 파일 검색
3. 환경변수 파싱 및 서비스 패턴 매칭
4. 미리보기 화면 표시:
   - 감지된 서비스 목록
   - 각 서비스별 발견된 credential
   - 기존 계정과 중복 여부 표시
5. 사용자가 임포트할 항목 선택
6. 선택된 항목 등록 (새 계정 또는 기존 계정 업데이트)
```

## References

- [Integration Hub Spec](../specs/integration-hub/spec.md)
- [dotenv 파서](https://github.com/motdotla/dotenv)
