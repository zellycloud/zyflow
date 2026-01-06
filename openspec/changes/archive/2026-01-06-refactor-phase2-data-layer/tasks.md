# Tasks: Phase 2 - DB 중심 데이터 레이어 전환

## 1. Sync 코드 제거 ✅

- [x] server/sync.ts 삭제
- [x] server/sync-recovery.ts 삭제
- [x] server/sync-recovery-strategies.ts 삭제
- [x] server/sync-failure-detector.ts 삭제
- [x] server/index.ts에서 sync 관련 import 제거

## 2. File Watcher 제거 → 자동 동기화로 변경 ✅

- [x] chokidar 기반 file watcher 코드 업데이트
- [x] tasks.md 파일 변경 감지 시 DB 동기화
- [x] server/index.ts에서 watcher 초기화
- [x] WebSocket으로 클라이언트 알림

## 3. API 수정 - DB 직접 접근 ✅

- [x] server/routes/flow.ts: syncChangeTasksFromFile 함수 구현
- [x] server/sync-tasks.ts 모듈 생성
- [x] 원격 프로젝트 정상 동작 확인
- [x] WebSocket 이벤트 정상 동작 확인

## 4. 검증 완료 ✅

- [x] API 서버 정상 동작 (http://localhost:3000)
- [x] WebSocket 연결 정상 (ws://localhost:3000/ws)
- [x] GET /api/flow/changes 정상 응답
- [x] GET /api/tasks 정상 응답
- [x] GET /api/projects 정상 응답
- [x] Watcher 자동 동기화 테스트 완료

## 결과

- **제거된 코드**: ~3,600 LOC
- **아키텍처**: DB를 유일한 데이터 소스로 사용
- **동기화**: File watcher로 자동 동기화

test
<!-- test Tue Jan  6 06:59:09 KST 2026 -->
<!-- watcher test 1767657337 -->
