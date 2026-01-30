# Tasks: Phase 2 - DB 중심 데이터 레이어 전환

## 1. Sync 코드 제거 ✅

- [x] server/sync.ts 삭제
- [x] server/sync-recovery.ts 삭제
- [x] server/sync-recovery-strategies.ts 삭제
- [x] server/sync-failure-detector.ts 삭제
- [x] server/index.ts에서 sync 관련 import 제거

## 2. File Watcher → 자동 동기화 ✅

- [x] chokidar 기반 file watcher 업데이트
- [x] tasks.md 파일 변경 감지 시 DB 동기화
- [x] server/index.ts에서 watcher 초기화
- [x] WebSocket으로 클라이언트 알림

## 3. API 수정 - DB 직접 접근 ✅

- [x] server/sync-tasks.ts 모듈 생성
- [x] syncChangeTasksFromFile 함수 구현
- [x] syncChangeTasksForProject 함수 구현
- [x] flow.ts에서 sync-tasks import

## 4. Remote Plugin 분리 대응 ✅

- [x] projects.ts - remote import를 optional dynamic import로 변경
- [x] changes.ts - remote import를 optional dynamic import로 변경
- [x] flow.ts - remote import를 optional dynamic import로 변경
- [x] @zyflow/remote-plugin 미설치 시에도 로컬 프로젝트 정상 동작

## 5. 검증 완료 ✅

- [x] API 서버 정상 동작 (http://localhost:3000)
- [x] /api/projects/all-data 정상 응답
- [x] /api/health 정상 응답
- [x] WebSocket 서버 초기화
- [x] File Watcher 자동 동기화 동작 확인
