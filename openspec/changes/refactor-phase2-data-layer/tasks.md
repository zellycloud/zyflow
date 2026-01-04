# Tasks: Phase 2 - DB 중심 데이터 레이어 전환

## 1. Sync 코드 제거

- [ ] server/sync.ts 삭제
- [ ] server/sync-recovery.ts 삭제
- [ ] server/sync-recovery-strategies.ts 삭제
- [ ] server/sync-failure-detector.ts 삭제
- [ ] server/index.ts에서 sync 관련 import 제거

## 2. File Watcher 제거

- [ ] chokidar 관련 코드 제거
- [ ] tasks.md 파일 변경 감시 로직 제거
- [ ] package.json에서 chokidar 의존성 확인 (다른 곳에서 사용 시 유지)

## 3. API 수정 - DB 직접 접근

- [ ] server/routes/flow.ts 수정: sync 호출 제거
- [ ] server/routes/tasks.ts 수정: DB 직접 CRUD
- [ ] server/routes/changes.ts 수정: DB 직접 조회
- [ ] 모든 태스크 생성/수정/삭제가 DB만 변경하도록 수정

## 4. Export 기능 구현

- [ ] POST /api/tasks/export 엔드포인트 추가
- [ ] DB에서 tasks 조회 → tasks.md 형식으로 변환
- [ ] OpenSpec 형식 유지 (그룹, 체크박스 등)
- [ ] 프로젝트별 openspec/changes/{changeId}/tasks.md에 저장

## 5. Import 기능 구현

- [ ] POST /api/tasks/import 엔드포인트 추가
- [ ] tasks.md 파일 파싱 (기존 parser.ts 활용)
- [ ] DB에 upsert (displayId 기반 매칭)
- [ ] 충돌 시 덮어쓰기 옵션

## 6. UI 업데이트

- [ ] Export 버튼 추가 (Change 상세 페이지)
- [ ] Import 버튼 추가 (Change 상세 페이지)
- [ ] 자동 sync 상태 표시 제거
- [ ] 수동 Export/Import 안내 문구 추가

## 7. 검증

- [ ] 태스크 CRUD 정상 동작 확인
- [ ] Export → 파일 생성 확인
- [ ] Import → DB 반영 확인
- [ ] 원격 프로젝트에서 정상 동작 확인
- [ ] 기존 데이터 마이그레이션 확인
