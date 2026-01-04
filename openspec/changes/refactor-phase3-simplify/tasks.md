# Tasks: Phase 3 - 기능 간소화

## 1. Multi-AI Provider → Claude 전용

- [ ] server/ai/providers/openai.ts 제거
- [ ] server/ai/providers/gemini.ts 제거
- [ ] server/ai/providers/qwen.ts 제거
- [ ] server/ai/providers/kilo.ts 제거
- [ ] server/ai/providers/opencode.ts 제거
- [ ] server/ai/providers/index.ts 수정 (claude만 export)
- [ ] src/components/integrations/ConsensusUI.tsx 제거
- [ ] src/hooks/useAI.ts 간소화
- [ ] src/hooks/useSwarm.ts 제거 또는 간소화
- [ ] 설정 UI에서 Provider 선택 제거

## 2. Remote SSH → 플러그인 분리

### 2.1 플러그인 패키지 생성
- [ ] packages/zyflow-remote-plugin/ 디렉토리 생성
- [ ] 플러그인 package.json 작성
- [ ] 플러그인 tsconfig.json 작성

### 2.2 코드 이동
- [ ] server/remote/ssh-manager.ts → 플러그인으로 이동
- [ ] server/remote/ssh-config-parser.ts → 플러그인으로 이동
- [ ] server/remote/remote-fs.ts → 플러그인으로 이동
- [ ] server/routes/remote.ts → 플러그인으로 이동
- [ ] src/components/remote/ → 플러그인으로 이동

### 2.3 메인 코드베이스 정리
- [ ] server/index.ts에서 remote 라우터 조건부 로딩
- [ ] 설정에서 Remote SSH 활성화/비활성화 옵션
- [ ] ssh2 의존성을 플러그인으로 이동

## 3. Alert System 간소화

### 3.1 제거할 코드
- [ ] server/services/alertProcessor.ts 제거
- [ ] server/services/githubActionsPoller.ts 간소화
- [ ] Webhook 수신 로직 제거
- [ ] Alert 패턴 분석 로직 제거
- [ ] Auto-fix 기능 제거
- [ ] Risk 평가 로직 제거

### 3.2 간소화할 코드
- [ ] server/routes/alerts.ts 간소화 (읽기 전용)
- [ ] src/hooks/useAlerts.ts 간소화
- [ ] src/components/alerts/ 핵심만 유지

### 3.3 유지할 기능
- [ ] GitHub Actions 실패 알림 조회
- [ ] 프로젝트별 Alert 필터링
- [ ] Alert 목록 표시

## 4. Post-Task Agent 제거

- [ ] mcp-server/tasks/code-quality.ts 제거
- [ ] mcp-server/tasks/test-generator.ts 제거
- [ ] mcp-server/tasks/quarantine-system.ts 제거
- [ ] mcp-server/tasks/ 나머지 17개 파일 제거
- [ ] mcp-server/index.ts에서 tasks 관련 코드 제거
- [ ] Post-Task 관련 UI 컴포넌트 제거

## 5. 검증

- [ ] npm run build 성공 확인
- [ ] npm run test 성공 확인
- [ ] Claude Code 실행 정상 동작
- [ ] Alert 기본 기능 동작 확인
- [ ] Remote SSH 플러그인 분리 확인
