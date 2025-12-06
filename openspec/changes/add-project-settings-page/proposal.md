# Proposal: 프로젝트별 Settings 페이지 추가

## 개요

프로젝트별 Settings 페이지를 추가하여 프로젝트 고유 설정을 관리합니다. 기존 전역 Integrations 탭의 프로젝트별 기능을 이 페이지로 이동합니다.

## 동기

현재 Integrations는 전역 설정 페이지에 있어서:
- 프로젝트별 설정과 전역 설정이 혼재
- 프로젝트 로컬 설정(`.zyflow/`)과 전역 설정의 구분이 불명확
- 향후 프로젝트별 추가 설정 확장이 어려움

## 변경 사항

### 1. 사이드바 구조 변경

프로젝트 확장 시 메뉴 순서:
```
Project Name (확장)
├── Changes
│   └── change-1
│   └── change-2
├── Inbox
└── Settings ← 새로 추가
```

### 2. 프로젝트 Settings 페이지

Settings 선택 시 표시되는 페이지:
- **Integrations 섹션**: 기존 전역 Integrations의 프로젝트별 기능 이동
  - GitHub, Supabase, Vercel, Sentry 연결 상태
  - 프로젝트별 계정 매핑
  - 환경 변수 (로컬 `.zyflow/environments/`)
  - 테스트 계정
  - 로컬/전역 설정 source 표시
- 향후 확장: 프로젝트 메타데이터, 알림 설정 등

### 3. 전역 Settings 페이지 조정

전역 Settings에서:
- Projects 탭: 프로젝트 목록 및 경로 관리 (기존 유지)
- Accounts 탭: 서비스 계정 관리 (새로 분리)
  - GitHub, Supabase 등 계정 추가/삭제
  - 전역 토큰 관리

## 기술 스펙

### 새 컴포넌트

```typescript
// src/components/settings/ProjectSettings.tsx
// 프로젝트별 Settings 페이지

// src/components/settings/ProjectIntegrations.tsx
// 기존 Integrations 기능을 프로젝트 컨텍스트로 이동
```

### 상태 관리

```typescript
// useAppState에 selectedProjectSettings 추가
type AppState = {
  // ... 기존 상태
  selectedProjectSettings: string | null; // 프로젝트 ID
};
```

### 라우팅

사이드바에서 Settings 클릭 시:
1. `selectedProjectSettings` 상태 설정
2. StageContent에서 ProjectSettings 컴포넌트 렌더링

## 마이그레이션

1. 기존 Integrations 탭의 프로젝트별 기능 → ProjectSettings로 이동
2. 전역 Integrations → Accounts 탭으로 이름 변경
3. 기존 API 엔드포인트 유지 (변경 없음)

## UI/UX

### 사이드바 아이콘
- Settings: `Settings` 아이콘 (lucide-react)

### Settings 페이지 레이아웃
```
┌─────────────────────────────────────────────┐
│ Project Settings: {project.name}            │
├─────────────────────────────────────────────┤
│ ▼ Integrations                              │
│   ┌─────────────────────────────────────┐   │
│   │ GitHub: connected (Local)           │   │
│   │ Supabase: connected (Global)        │   │
│   │ ...                                 │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   ▼ Environments                            │
│   ┌─────────────────────────────────────┐   │
│   │ local.env (3 variables)             │   │
│   │ staging.env (5 variables)           │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   ▼ Test Accounts                           │
│   ┌─────────────────────────────────────┐   │
│   │ admin@test.com (admin)              │   │
│   │ user@test.com (user)                │   │
│   └─────────────────────────────────────┘   │
│                                             │
│ ▶ More Settings (향후 확장)                  │
└─────────────────────────────────────────────┘
```

## 영향 범위

### 수정 파일
- `src/components/layout/FlowSidebar.tsx` - Settings 메뉴 추가
- `src/components/flow/StageContent.tsx` - ProjectSettings 렌더링
- `src/store/app-state.ts` - selectedProjectSettings 상태
- `src/types/index.ts` - 타입 추가

### 이동/리팩토링
- `src/components/settings/ProjectsSettings.tsx` → 프로젝트 Integration 부분 분리

### 새 파일
- `src/components/settings/ProjectSettings.tsx`
- `src/components/settings/ProjectIntegrations.tsx`

## 제외 사항

- API 변경 없음 (기존 엔드포인트 재사용)
- 데이터 구조 변경 없음
- 전역 계정(Accounts) 페이지는 별도 제안으로 분리
