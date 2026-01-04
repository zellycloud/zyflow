# alert-system Specification

## Purpose
TBD - created by archiving change add-alert-system. Update Purpose after archive.
## Requirements
### Requirement: Webhook 수신 및 파싱

시스템은 외부 서비스의 Webhook을 수신하고 파싱할 수 있어야 합니다(SHALL).

#### Scenario: GitHub Workflow 웹훅 수신
- **GIVEN** GitHub Actions에서 workflow가 완료되었을 때
- **WHEN** `/api/alerts/webhooks/github` 엔드포인트로 웹훅이 전달되면
- **THEN** 시스템은 workflow 실행 결과를 파싱하여 Alert로 저장합니다
- **AND** 실패한 경우 severity를 `critical`로 설정합니다

#### Scenario: Vercel 배포 웹훅 수신
- **GIVEN** Vercel에서 배포가 완료되었을 때
- **WHEN** `/api/alerts/webhooks/vercel` 엔드포인트로 웹훅이 전달되면
- **THEN** 시스템은 배포 결과를 파싱하여 Alert로 저장합니다
- **AND** 에러 배포는 severity를 `critical`로 설정합니다

#### Scenario: Sentry 이슈 웹훅 수신
- **GIVEN** Sentry에서 새 이슈가 생성되었을 때
- **WHEN** `/api/alerts/webhooks/sentry` 엔드포인트로 웹훅이 전달되면
- **THEN** 시스템은 이슈 정보를 파싱하여 Alert로 저장합니다
- **AND** level에 따라 severity를 매핑합니다 (fatal→critical, error→warning)

#### Scenario: Supabase 웹훅 수신
- **GIVEN** Supabase에서 이벤트가 발생했을 때
- **WHEN** `/api/alerts/webhooks/supabase` 엔드포인트로 웹훅이 전달되면
- **THEN** 시스템은 이벤트를 파싱하여 Alert로 저장합니다

---

### Requirement: Alert 관리 API

시스템은 Alert를 조회, 필터링, 상태 변경할 수 있어야 합니다(SHALL).

#### Scenario: Alert 목록 조회
- **GIVEN** 시스템에 저장된 Alert가 있을 때
- **WHEN** `GET /api/alerts`를 호출하면
- **THEN** Alert 목록이 반환됩니다
- **AND** source, severity, status로 필터링할 수 있습니다

#### Scenario: Alert 상세 조회
- **GIVEN** 특정 Alert ID가 있을 때
- **WHEN** `GET /api/alerts/:id`를 호출하면
- **THEN** Alert 상세 정보가 반환됩니다

#### Scenario: Alert 상태 변경
- **GIVEN** pending 상태의 Alert가 있을 때
- **WHEN** `PATCH /api/alerts/:id`로 status를 `resolved`로 변경하면
- **THEN** Alert 상태가 업데이트됩니다
- **AND** resolved_at 타임스탬프가 기록됩니다

#### Scenario: Alert 무시
- **GIVEN** pending 상태의 Alert가 있을 때
- **WHEN** `POST /api/alerts/:id/ignore`를 호출하면
- **THEN** Alert 상태가 `ignored`로 변경됩니다

---

### Requirement: Agent 분석

시스템은 AI Agent를 통해 Alert를 자동 분석할 수 있어야 합니다(SHALL).

#### Scenario: 자동 분석 수행
- **GIVEN** 새로운 Alert가 생성되었을 때
- **WHEN** 백그라운드 처리 프로세스가 실행되면
- **THEN** Agent가 Alert 패턴을 분석합니다
- **AND** rootCause, suggestedFix, confidence 등이 analysis 필드에 저장됩니다

#### Scenario: 수동 분석 트리거
- **GIVEN** pending 상태의 Alert가 있을 때
- **WHEN** `POST /api/alerts/:id/analyze`를 호출하면
- **THEN** Agent 분석이 즉시 실행됩니다
- **AND** 분석 결과가 반환됩니다

#### Scenario: 소스별 패턴 분석
- **GIVEN** GitHub workflow 실패 Alert가 있을 때
- **WHEN** 분석을 수행하면
- **THEN** 빌드 실패, 테스트 실패, 타입 에러 등 패턴을 식별합니다
- **AND** 자동 수정 가능 여부(autoFixable)를 판단합니다

---

### Requirement: 위험도 평가

시스템은 분석 결과를 바탕으로 위험도를 평가할 수 있어야 합니다(SHALL).

#### Scenario: Low Risk 평가
- **GIVEN** 린트 에러나 포맷팅 이슈 Alert일 때
- **WHEN** 위험도를 평가하면
- **THEN** `low` 위험도가 반환됩니다
- **AND** `auto_approve` 권장 조치가 반환됩니다

#### Scenario: Medium Risk 평가
- **GIVEN** 일반적인 빌드 실패 Alert일 때
- **WHEN** 위험도를 평가하면
- **THEN** `medium` 위험도가 반환됩니다
- **AND** `pr_with_review` 권장 조치가 반환됩니다

#### Scenario: High Risk 평가
- **GIVEN** 프로덕션 환경의 critical Alert일 때
- **WHEN** 위험도를 평가하면
- **THEN** `high` 위험도가 반환됩니다
- **AND** `manual_review` 권장 조치가 반환됩니다

---

### Requirement: Auto-fix 실행

시스템은 분석 결과에 따라 자동 수정을 시도할 수 있어야 합니다(SHALL).

#### Scenario: Workflow 재시도
- **GIVEN** GitHub workflow 실패이고 autoFixAction이 `retry`일 때
- **WHEN** auto-fix가 실행되면
- **THEN** GitHub API를 통해 workflow를 재실행합니다
- **AND** 결과가 resolution 필드에 기록됩니다

#### Scenario: Vercel 재배포
- **GIVEN** Vercel 배포 실패이고 autoFixAction이 `redeploy`일 때
- **WHEN** auto-fix가 실행되면
- **THEN** Vercel API를 통해 재배포를 트리거합니다

#### Scenario: Auto-fix 스킵
- **GIVEN** 위험도가 `high`이거나 confidence가 낮을 때
- **WHEN** auto-fix 판단을 수행하면
- **THEN** auto-fix를 스킵하고 수동 검토를 권장합니다

---

### Requirement: Slack 알림

시스템은 Slack으로 알림을 발송할 수 있어야 합니다(SHALL).

#### Scenario: Critical Alert 알림
- **GIVEN** Slack 웹훅이 설정되어 있고 onCritical 규칙이 활성화되어 있을 때
- **WHEN** critical severity Alert가 처리되면
- **THEN** Slack으로 알림이 발송됩니다
- **AND** Alert 상세 정보와 링크가 포함됩니다

#### Scenario: Auto-fix 완료 알림
- **GIVEN** Slack 웹훅이 설정되어 있고 onAutofix 규칙이 활성화되어 있을 때
- **WHEN** auto-fix가 성공적으로 완료되면
- **THEN** Slack으로 완료 알림이 발송됩니다

#### Scenario: 알림 테스트
- **GIVEN** Slack 웹훅이 설정되어 있을 때
- **WHEN** `POST /api/alerts/notification-config/test`를 호출하면
- **THEN** 테스트 메시지가 Slack으로 발송됩니다

---

### Requirement: WebSocket 실시간 알림

시스템은 WebSocket을 통해 실시간 알림을 전송할 수 있어야 합니다(SHALL).

#### Scenario: Alert 생성 브로드캐스트
- **GIVEN** WebSocket 연결이 활성화되어 있을 때
- **WHEN** 새 Alert가 생성되면
- **THEN** `alert.created` 이벤트가 브로드캐스트됩니다

#### Scenario: Alert 처리 완료 브로드캐스트
- **GIVEN** WebSocket 연결이 활성화되어 있을 때
- **WHEN** Alert 처리가 완료되면
- **THEN** `alert.processed` 이벤트가 브로드캐스트됩니다

---

### Requirement: Webhook 설정 관리

시스템은 Webhook 엔드포인트 설정을 관리할 수 있어야 합니다(SHALL).

#### Scenario: Webhook 생성
- **GIVEN** 사용자가 새 Webhook을 추가하려고 할 때
- **WHEN** `POST /api/alerts/webhook-configs`를 호출하면
- **THEN** 고유한 endpoint URL과 secret이 생성됩니다

#### Scenario: Webhook 활성화/비활성화
- **GIVEN** 기존 Webhook 설정이 있을 때
- **WHEN** enabled 상태를 변경하면
- **THEN** 해당 Webhook의 수신이 활성화/비활성화됩니다

#### Scenario: Secret 재생성
- **GIVEN** 기존 Webhook 설정이 있을 때
- **WHEN** `POST /api/alerts/webhook-configs/:id/regenerate-secret`를 호출하면
- **THEN** 새 secret이 생성되어 반환됩니다

---

### Requirement: UI 컴포넌트

시스템은 Alert를 관리할 수 있는 UI를 제공해야 합니다(SHALL).

#### Scenario: AlertCenter 표시
- **GIVEN** 사용자가 Alerts 메뉴를 클릭했을 때
- **WHEN** AlertCenter 컴포넌트가 렌더링되면
- **THEN** Alert 목록과 통계가 표시됩니다
- **AND** 필터 옵션이 제공됩니다

#### Scenario: AlertDetail 표시
- **GIVEN** 사용자가 특정 Alert를 클릭했을 때
- **WHEN** AlertDetail 컴포넌트가 렌더링되면
- **THEN** Alert 상세 정보가 표시됩니다
- **AND** Analyze, Auto Process 버튼이 제공됩니다

#### Scenario: AlertSettings 표시
- **GIVEN** 사용자가 Settings 버튼을 클릭했을 때
- **WHEN** AlertSettings 컴포넌트가 렌더링되면
- **THEN** Webhook 설정과 Notification 설정이 표시됩니다

---

