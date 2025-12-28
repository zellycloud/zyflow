# Alert System 구현 작업

## Phase 1: Foundation ✅ COMPLETED

### Database & Schema
- [x] alerts 테이블 스키마 생성
- [x] activity_logs 테이블 스키마 생성
- [x] webhook_configs 테이블 스키마 생성
- [x] notification_config 테이블 스키마 생성 (싱글톤)
- [x] 인덱스 생성 (status, source, severity, created_at, expires_at)

### Webhook Endpoints
- [x] POST /api/alerts/webhooks/github - GitHub Actions 웹훅
- [x] POST /api/alerts/webhooks/vercel - Vercel 배포 웹훅
- [x] POST /api/alerts/webhooks/sentry - Sentry 이슈 웹훅
- [x] POST /api/alerts/webhooks/supabase - Supabase 이벤트 웹훅
- [x] 소스별 파서 구현 (parseGitHubWebhook, parseVercelWebhook 등)

### Alert API
- [x] GET /api/alerts - 목록 조회 (필터링 지원)
- [x] GET /api/alerts/:id - 상세 조회
- [x] PATCH /api/alerts/:id - 상태 변경
- [x] POST /api/alerts/:id/ignore - Alert 무시
- [x] GET /api/alerts/stats - 통계 조회
- [x] GET /api/alerts/activities - Activity 로그 조회

### Webhook Config API
- [x] GET /api/alerts/webhook-configs - 설정 목록
- [x] POST /api/alerts/webhook-configs - 설정 생성
- [x] PATCH /api/alerts/webhook-configs/:id - 설정 수정
- [x] DELETE /api/alerts/webhook-configs/:id - 설정 삭제
- [x] POST /api/alerts/webhook-configs/:id/regenerate-secret - Secret 재생성

### Notification Config API
- [x] GET /api/alerts/notification-config - 알림 설정 조회
- [x] PATCH /api/alerts/notification-config - 알림 설정 수정
- [x] POST /api/alerts/notification-config/test - Slack 테스트

### UI Components
- [x] AlertCenter.tsx - 메인 컨테이너
- [x] AlertList.tsx - 알림 목록
- [x] AlertDetail.tsx - 상세 뷰
- [x] AlertSettings.tsx - 설정 패널 (Webhook, Notification)
- [x] useAlerts.ts - React Query 훅

---

## Phase 2: Agent Integration ✅ COMPLETED

### Alert Processor Service
- [x] server/services/alertProcessor.ts 생성
- [x] analyzeAlert() - 소스별 패턴 기반 분석
  - GitHub: 빌드 실패, 테스트 실패, 타입 에러 패턴
  - Vercel: 배포 에러 패턴
  - Sentry: 에러 레벨 기반 분석
  - Supabase: DB/Auth 이슈 패턴
- [x] assessRisk() - 위험도 평가
  - severity, environment, confidence 기반
  - Low/Medium/High 3단계
  - 권장 조치 (auto_approve, pr_with_review 등)
- [x] executeAutoFix() - 자동 수정 실행
  - retry_workflow: GitHub API workflow 재실행
  - redeploy: Vercel API 재배포
  - lint_fix, format_fix 지원
- [x] sendSlackNotification() - Slack 알림
  - Block Kit 기반 리치 메시지
  - 심각도별 색상 구분
- [x] processAlert() - 전체 워크플로우 통합

### API Endpoints
- [x] POST /api/alerts/:id/analyze - 수동 분석 트리거
- [x] POST /api/alerts/:id/process - 전체 처리 워크플로우

### WebSocket Integration
- [x] setBroadcastAlert() 함수 주입 패턴
- [x] alert.created 이벤트 브로드캐스트
- [x] alert.processed 이벤트 브로드캐스트
- [x] 백그라운드 비동기 처리

### UI Updates
- [x] AlertDetail에 Analyze 버튼 추가
- [x] AlertDetail에 Auto Process 버튼 추가
- [x] 로딩 상태 표시 (스피너 애니메이션)
- [x] useAnalyzeAlert, useProcessAlert 훅 추가

---

## Phase 3: Advanced Features ✅ COMPLETED

### 유사 Alert 매칭
- [x] 과거 Alert와 유사도 비교 (Jaccard similarity 알고리즘)
- [x] 해결 패턴 학습 및 추천 (findSimilarAlerts, learnFromResolution)

### PR 생성 Auto-fix
- [x] 코드 패치 생성 (patchContent 기반)
- [x] GitHub PR API 연동 (createPullRequest)
- [x] 위험도별 라벨 자동 추가

### 통계 대시보드
- [x] 소스별 알림 트렌드 (getTrends API)
- [x] 해결 시간 분석 (avgResolutionTimeHours)
- [x] Auto-fix 성공률 (autoFixRate)
- [x] AlertDashboard UI 컴포넌트

### Alert 패턴 학습
- [x] 반복 패턴 감지 (pattern_signature 기반)
- [x] alert_patterns 테이블 및 학습 로직
- [x] 패턴별 성공률 및 추천 수정 저장

---

## Files Created/Modified

### Created (Phase 1)
- server/routes/alerts.ts
- src/components/alerts/AlertCenter.tsx
- src/components/alerts/AlertList.tsx
- src/components/alerts/AlertDetail.tsx
- src/components/alerts/AlertSettings.tsx
- src/components/alerts/index.ts
- src/hooks/useAlerts.ts
- docs/specs/alert-system.md

### Created (Phase 2)
- server/services/alertProcessor.ts

### Created (Phase 3)
- src/components/alerts/AlertDashboard.tsx

### Modified (Phase 2)
- server/routes/alerts.ts - WebSocket & 처리 로직 통합
- server/app.ts - setBroadcastAlert 연결
- src/hooks/useAlerts.ts - useAnalyzeAlert, useProcessAlert 훅
- src/components/alerts/AlertDetail.tsx - UI 버튼 추가
- src/App.tsx - alerts SelectedItem 타입 추가
- src/components/flow/FlowContent.tsx - AlertCenter 라우팅
- src/components/layout/MenuBar.tsx - Alerts 메뉴 버튼

### Modified (Phase 3)
- server/tasks/db/schema.ts - alert_patterns, alert_trends 테이블 추가
- server/tasks/db/client.ts - 새 테이블 생성 SQL 추가
- server/services/alertProcessor.ts - findSimilarAlerts, learnFromResolution, getTrends, createPullRequest 추가
- server/routes/alerts.ts - /trends, /advanced-stats, /patterns, /similar/:id, /create-pr, /dashboard-stats 엔드포인트 추가
- src/hooks/useAlerts.ts - useDashboardStats, useAlertTrends, useAlertPatterns, useSimilarAlerts, useCreatePR 훅 추가
- src/components/alerts/AlertCenter.tsx - Dashboard 버튼 및 라우팅 추가
- src/components/alerts/index.ts - AlertDashboard export 추가

---

## Test Checklist

### Webhook 수신
- [ ] GitHub workflow 완료 웹훅 수신 테스트
- [ ] Vercel 배포 에러 웹훅 수신 테스트
- [ ] Sentry 이슈 생성 웹훅 수신 테스트
- [ ] Supabase 이벤트 웹훅 수신 테스트

### Agent 분석
- [ ] 빌드 실패 Alert 분석 결과 확인
- [ ] 위험도 평가 결과 확인
- [ ] Auto-fix 조건 판단 확인

### 알림
- [ ] Slack 알림 발송 테스트
- [ ] WebSocket 실시간 알림 테스트

### UI
- [ ] Alert 목록 필터링 테스트
- [ ] Alert 상세 뷰 렌더링 테스트
- [ ] Analyze/Process 버튼 동작 테스트
- [ ] Webhook 설정 CRUD 테스트
