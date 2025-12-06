# Proposal: add-project-local-settings

## Summary

Integration 설정을 전역(`~/.zyflow/`)에서 프로젝트 로컬(`.zyflow/`)로 분리하여 프로젝트별 독립적인 설정 관리를 지원한다.

## Motivation

현재 모든 Integration 설정이 `~/.zyflow/integrations.db`에 전역으로 저장됨:
- 프로젝트를 다른 머신으로 이동하면 설정을 다시 구성해야 함
- 프로젝트별 설정이 전역 DB에 projectId로만 구분되어 관리가 어려움
- 팀원과 설정 구조(민감 정보 제외)를 공유할 수 없음

## Goals

1. **이식성**: 프로젝트 이동 시 설정이 함께 이동
2. **격리성**: 프로젝트별 독립적인 설정 저장
3. **공유 가능**: `.gitignore`로 민감 정보만 제외하고 구조 공유
4. **하위 호환성**: 기존 전역 설정 유지, 점진적 마이그레이션

## Non-Goals

- 전역 계정 저장소 제거 (계정은 여러 프로젝트에서 공유)
- 실시간 동기화 기능
- 원격 설정 저장소

## Proposed Solution

### 하이브리드 저장 구조

```
~/.zyflow/                          # 전역 (유지)
├── integrations.db                  # 서비스 계정 (GitHub PAT 등)
└── .master-key                      # 암호화 키

프로젝트/.zyflow/                    # 로컬 (신규)
├── settings.json                    # 프로젝트 설정 (어떤 계정 사용할지)
├── environments/                    # 환경 변수
│   ├── local.env                    # .gitignore
│   ├── staging.env                  # .gitignore
│   └── production.env               # .gitignore
└── test-accounts.json               # 테스트 계정 (암호화)
```

### 데이터 분리 원칙

| 데이터 | 저장 위치 | 이유 |
|--------|----------|------|
| 서비스 계정 (토큰) | 전역 | 여러 프로젝트에서 공유, 중앙 관리 |
| 계정 매핑 | 로컬 | 프로젝트가 어떤 계정 쓸지 |
| 환경 변수 | 로컬 | 프로젝트별 고유 설정 |
| 테스트 계정 | 로컬 | 프로젝트별 고유 |

### API 변경

기존 API 유지하되, 로컬 설정 우선 조회:
1. 프로젝트 `.zyflow/` 확인
2. 없으면 전역 DB에서 조회 (하위 호환)

### 마이그레이션

- 기존 전역 DB 데이터는 유지
- UI에서 "Export to Project" 버튼으로 로컬로 내보내기
- 새 프로젝트는 기본적으로 로컬 설정 사용

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 설정 파일 충돌 (git merge) | Medium | JSON 대신 개별 파일로 분리 |
| 암호화 키 관리 복잡성 | Medium | 전역 마스터 키 계속 사용 |
| 기존 사용자 혼란 | Low | 명확한 마이그레이션 UI 제공 |

## Success Criteria

- [ ] 프로젝트 로컬에 설정 저장/조회 가능
- [ ] 기존 전역 설정과 하위 호환
- [ ] MCP 도구에서 로컬 설정 우선 조회
- [ ] UI에서 로컬/전역 구분 표시
