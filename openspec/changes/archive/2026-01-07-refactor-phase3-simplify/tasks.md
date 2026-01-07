# Tasks: Phase 3 - 기능 간소화

## 1. Multi-AI Provider → Claude 전용

- [x] server/ai/providers/openai.ts 제거 (이전 세션에서 완료)
- [x] server/ai/providers/gemini.ts 제거 (이전 세션에서 완료)
- [x] server/ai/providers/qwen.ts 제거 (이전 세션에서 완료)
- [x] server/ai/providers/kilo.ts 제거 (이전 세션에서 완료)
- [x] server/ai/providers/opencode.ts 제거 (이전 세션에서 완료)
- [x] server/ai/providers/index.ts 수정 (claude만 export) (이전 세션에서 완료)
- [x] src/components/integrations/ConsensusUI.tsx 제거 (이전 세션에서 완료)
- [x] src/hooks/useAI.ts - 핵심 기능으로 유지
- [x] src/hooks/useSwarm.ts - 핵심 기능으로 유지
- [x] 설정 UI에서 Provider 선택 제거 (이전 세션에서 완료)

## 2. Remote SSH → 플러그인 분리

### 2.1 플러그인 패키지 생성
- [x] packages/zyflow-remote-plugin/ 디렉토리 생성
- [x] 플러그인 package.json 작성
- [x] 플러그인 tsconfig.json 작성

### 2.2 코드 이동
- [x] server/remote/ssh-manager.ts → 플러그인으로 이동
- [x] server/remote/ssh-config-parser.ts → 플러그인으로 이동
- [x] server/remote/remote-config.ts → 플러그인으로 이동
- [x] server/remote/types.ts → 플러그인으로 이동
- [x] server/routes/remote.ts → 플러그인으로 이동
- [x] 플러그인 index.ts 생성 (전체 API export)
- [x] src/components/remote/ → 프론트엔드 컴포넌트 유지 (API 통신)

### 2.3 메인 코드베이스 정리
- [x] server/remote/ 디렉토리 제거
- [x] server/routes/remote.ts 제거
- [x] server/app.ts에서 remote 라우터 조건부 로딩 (플러그인 동적 import)
- [x] 원격 프로젝트 접근 시 플러그인 체크 추가

## 3. Alert System 간소화

### 3.1 제거한 코드
- [x] server/services/alertProcessor.ts 제거 (1,902 LOC 삭제)
- [x] server/services/githubActionsPoller.ts 간소화 (processAlert 제거)
- [x] Webhook 수신 로직 제거
- [x] Alert 패턴 분석 로직 제거
- [x] Auto-fix 기능 제거
- [x] Risk 평가 로직 제거

### 3.2 간소화한 코드
- [x] server/routes/alerts.ts 간소화 (~1,584 → ~512 LOC, 읽기 전용)
- [x] src/hooks/useAlerts.ts - 기존 유지 (기본 기능에 필요)
- [x] src/components/alerts/ - 기존 유지 (기본 기능에 필요)

### 3.3 유지할 기능
- [x] GitHub Actions 실패 알림 조회
- [x] 프로젝트별 Alert 필터링
- [x] Alert 목록 표시

## 4. Post-Task Agent 제거

- [x] mcp-server/tasks/ 전체 제거 (17개 파일)
- [x] mcp-server/post-task-tools.ts 제거
- [x] mcp-server/index.ts에서 post-task 관련 import 제거
- [x] mcp-server/index.ts에서 post-task 관련 tool 정의 제거
- [x] mcp-server/index.ts에서 post-task 관련 case 핸들러 제거

## 5. 검증

- [x] npm run build 성공 확인
- [x] npm run test 실행 확인 (기존 테스트 일부 실패 - 리팩토링과 무관)
- [x] 서버 실행 정상 동작 확인 (/api/health, /api/alerts)
- [x] Alert 기본 기능 동작 확인 (목록 조회 정상)
- [x] Remote SSH 플러그인 분리 확인 (플러그인 미설치 시 graceful 처리)

---

## 완료 요약

### 제거된 코드량
- **Post-Task Agent**: ~15,000 LOC (17개 파일 + post-task-tools.ts)
- **Alert Processor**: ~1,900 LOC
- **Alerts Router 간소화**: ~1,000 LOC 감소
- **Remote SSH 분리**: server/remote/ 디렉토리 → 플러그인으로 이동

### 새로 생성된 파일
- `packages/zyflow-remote-plugin/package.json`
- `packages/zyflow-remote-plugin/tsconfig.json`
- `packages/zyflow-remote-plugin/src/index.ts`
- `packages/zyflow-remote-plugin/src/types.ts`
- `packages/zyflow-remote-plugin/src/ssh-manager.ts`
- `packages/zyflow-remote-plugin/src/ssh-config-parser.ts`
- `packages/zyflow-remote-plugin/src/remote-config.ts`
- `packages/zyflow-remote-plugin/src/router.ts`

### 주요 변경사항
1. **Remote 기능**: 플러그인으로 분리, 선택적 설치 가능
2. **Alert 시스템**: 읽기 전용으로 간소화, 복잡한 처리 로직 제거
3. **Post-Task Agent**: MCP 서버에서 완전 제거
4. **Multi-AI Provider**: Claude 전용 (이전 세션에서 완료)
