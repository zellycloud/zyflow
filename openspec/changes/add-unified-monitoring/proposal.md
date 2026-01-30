# add-unified-monitoring

## Summary

ZyFlow에 통합 모니터링 및 자동 수정 시스템을 구축합니다.

- **Alert 시스템 완성**: Webhook 수신, Slack 알림, 설정 API
- **Docker 배포**: 컨테이너화 및 두 서버 배포 지원
- **Auto-Fix Agent**: Gemini 기반 에러 분석 및 자동 수정

## Motivation

현재 ZyFlow에는 GitHub Actions 폴링, Alert 저장소, Post-Task Runner 등이 구현되어 있지만:
1. **UI 부재**: Alert이 저장되지만 볼 수 있는 UI가 없음
2. **알림 없음**: 에러 발생 시 즉각적인 알림이 없어 인지 불가
3. **수동 대응**: 에러 발견 후 수동으로 수정해야 함

이 제안은 기존 60-70% 구현된 인프라를 완성하고, 에러 감지→알림→자동수정→배포까지 전 과정을 자동화합니다.

## Requirements

### 기능 요구사항

1. **Alert 시스템**
   - GitHub, Vercel, Sentry, Supabase Webhook 수신
   - Webhook 서명 검증 (HMAC-SHA256)
   - Slack 채널별 알림 (#zellyy-alerts, #jayoo-alerts)
   - Alert 상태 관리 (pending → processing → resolved)

2. **배포 시스템**
   - Docker 컨테이너화
   - 두 서버 지원 (monitor.ism.kr, monitor.jayoo.io)
   - 환경 변수 기반 설정

3. **자동 수정 시스템**
   - 에러 분석 (Gemini API)
   - 코드 수정 생성 및 검증
   - PR 자동 생성 및 머지 (CI 통과 시)

### 비기능 요구사항

- Slack 무료 버전 제한 (앱 10개) 내에서 동작
- 자동 머지는 CI 통과 필수
- Supabase Security/Performance는 수동 승인 필요

## Design

### Architecture

```
Error Sources                    ZyFlow Server                      Actions
┌─────────────┐                 ┌──────────────────┐              ┌──────────────┐
│ GitHub      │──webhook──>     │                  │──slack──>    │ Slack        │
│ Actions     │                 │  Webhook Router  │              │ Notification │
├─────────────┤                 │       ↓          │              └──────────────┘
│ Vercel      │──webhook──>     │  Alert Storage   │              ┌──────────────┐
├─────────────┤                 │       ↓          │──pr──>       │ GitHub PR    │
│ Sentry      │──webhook──>     │  Error Analyzer  │              │ + Auto-merge │
├─────────────┤                 │  (Gemini API)    │              └──────────────┘
│ Supabase    │──webhook──>     │       ↓          │
└─────────────┘                 │  Fix Generator   │
                                │       ↓          │
                                │  Fix Validator   │
                                │  (tsc, eslint)   │
                                └──────────────────┘
```

### Phase 1: Alert System

**Webhook 수신**
- `POST /api/alerts/webhooks/github` - GitHub Actions 실패
- `POST /api/alerts/webhooks/vercel` - Vercel 배포 실패
- `POST /api/alerts/webhooks/sentry` - Sentry 에러
- `POST /api/alerts/webhooks/supabase` - Supabase 이슈

**Slack 알림**
```typescript
interface SlackNotification {
  channel: '#zellyy-alerts' | '#jayoo-alerts' | '#zellyy-auto-fix' | '#jayoo-auto-fix'
  blocks: SlackBlock[]
}
```

채널 분리:
- `#zellyy-alerts`: zellyy-money, zellyy-admin, zyflow 에러
- `#jayoo-alerts`: 그 외 프로젝트 에러
- `#*-auto-fix`: 자동 수정 결과 로그

### Phase 2: Docker Deployment

**Dockerfile (Multi-stage)**
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
EXPOSE 3100
CMD ["npm", "run", "server"]
```

**환경 변수**
- `DATA_DIR`: 데이터베이스 경로 (기본: /app/data)
- `SLACK_WEBHOOK_URL`: Slack Incoming Webhook URL
- `GEMINI_API_KEY`: Gemini API 키
- `GITHUB_TOKEN`: GitHub Personal Access Token

### Phase 3: Auto-Fix Agent

**에러 분석 흐름**
1. Alert 수신 → 에러 타입 분류
2. 관련 코드 컨텍스트 수집
3. Gemini API로 분석 및 수정 제안
4. 수정 코드 검증 (tsc, eslint, test)
5. PR 생성 또는 자동 머지

**자동 머지 정책**
| Source | Policy |
|--------|--------|
| GitHub Actions | CI 통과 시 자동 머지 |
| Supabase Edge Function | CI 통과 시 자동 머지 |
| Supabase Security/Performance | PR만 생성, 수동 승인 |
| Sentry | CI 통과 시 자동 머지 |

## Alternatives Considered

1. **외부 서비스 사용 (Datadog, PagerDuty)**
   - 장점: 즉시 사용 가능
   - 단점: 비용, 자동 수정 불가
   - 결론: 자체 구축으로 비용 절감 및 커스터마이징

2. **Claude Code만 사용**
   - 장점: 이미 통합됨
   - 단점: 비용 높음 (Opus), 자동화 어려움
   - 결론: Gemini 사용으로 비용 최적화

## Dependencies

### 신규 패키지
- `@google/generative-ai`: Gemini API 클라이언트

### 기존 패키지 활용
- `express`: API 서버
- `better-sqlite3`: 데이터베이스
- `@octokit/rest`: GitHub API (이미 사용 중)

## Risks

1. **Gemini API 제한**
   - 완화: Rate limiting 구현, 재시도 로직

2. **자동 수정 품질**
   - 완화: 검증 파이프라인 (tsc, eslint, test), 수동 승인 옵션

3. **Webhook 보안**
   - 완화: HMAC-SHA256 서명 검증, 시크릿 암호화

## Success Metrics

- Alert 감지 → Slack 알림: < 30초
- 자동 수정 성공률: > 60%
- 수동 개입 감소: > 50%
