# Alert System 통합

## Summary

GitHub Actions, Vercel, Sentry, Supabase 등 외부 서비스의 알림을 통합 수집하고, AI Agent가 자동 분석 및 해결을 시도하며, 처리 과정을 모니터링할 수 있는 Alert System을 추가합니다.

## Motivation

현재 개발자는 여러 서비스의 알림을 각각 확인해야 합니다:
- GitHub Actions 실패 → 이메일/GitHub 알림
- Vercel 배포 에러 → Vercel 대시보드
- Sentry 에러 → Sentry 대시보드
- Supabase 이벤트 → Supabase 대시보드

이러한 분산된 알림을 단일 인터페이스에서 통합 관리하고, AI가 자동으로 분석/해결을 시도하여 개발자의 알림 피로를 줄입니다.

## Proposed Solution

### Alert System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        External Services                      │
├──────────────────────────────────────────────────────────────┤
│  GitHub Actions  │  Vercel  │  Supabase  │  Sentry  │  ...  │
└────────┬─────────┴────┬─────┴─────┬──────┴────┬─────┴───────┘
         │              │           │           │
         ▼              ▼           ▼           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Webhook Gateway                            │
│                   /api/alerts/webhooks/:source                │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                    Alert Processor                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Parser    │→ │   Agent     │→ │  Action Dispatcher  │   │
│  │             │  │  Analysis   │  │  (Risk Assessment)  │   │
│  └─────────────┘  └─────────────┘  └─────────────────────┘   │
└────────────────────────────┬─────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌───────────┐  ┌───────────┐  ┌───────────┐
       │  Storage  │  │ Auto-Fix  │  │  Notifier │
       │ (SQLite)  │  │  Executor │  │  (Slack)  │
       └───────────┘  └───────────┘  └───────────┘
                             │
                             ▼
                    ┌───────────────┐
                    │  WebSocket    │
                    │  Broadcast    │
                    └───────────────┘
```

### 핵심 기능

1. **Webhook 수신 & 파싱**
   - 소스별 파서 (GitHub, Vercel, Sentry, Supabase)
   - 통일된 Alert 포맷으로 정규화
   - 자동 severity 분류

2. **Agent 분석**
   - 패턴 기반 root cause 분석
   - 자동 수정 가능 여부 판단
   - 신뢰도 점수 계산

3. **위험도 평가**
   - Low/Medium/High 3단계 평가
   - 환경(production) 고려
   - 권장 조치 제안

4. **Auto-fix 실행**
   - GitHub workflow 재시도
   - Vercel 재배포
   - 린트/포맷 수정

5. **알림**
   - Slack 통합
   - WebSocket 실시간 브로드캐스트

## Design Decisions

| 항목 | 결정 | 이유 |
|------|------|------|
| 알림 보관 기간 | 90일 | Slack 무료 플랜과 동일, 충분한 히스토리 |
| Agent 분석 범위 | 모든 케이스 | 학습 데이터 축적, 점진적 개선 |
| Auto-fix PR | 리뷰 대기 | 안전성 우선, 사용자 확인 필요 |
| WebSocket | 함수 주입 패턴 | 순환 참조 방지 |

## Related Specs

- [alert-system spec](specs/alert-system/spec.md)

## References

- [Alert System 상세 스펙](../../docs/specs/alert-system.md)
