/**
 * Local Settings Types
 * 프로젝트 로컬 .zyflow/ 폴더의 설정 파일 타입 정의
 */

// =============================================
// settings.json 타입
// =============================================

/**
 * 로컬 설정 파일 (settings.json)
 * 프로젝트가 어떤 전역 계정을 사용할지 매핑
 */
export interface LocalSettings {
  version: 1;
  integrations: LocalIntegrationMapping;
  defaultEnvironment?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * 서비스 타입별 계정 UUID 매핑
 */
export interface LocalIntegrationMapping {
  github?: string;    // account UUID
  supabase?: string;  // account UUID
  vercel?: string;    // account UUID
  sentry?: string;    // account UUID
  [key: string]: string | undefined; // custom services
}

// =============================================
// test-accounts.json 타입
// =============================================

/**
 * 로컬 테스트 계정 파일 (test-accounts.json)
 */
export interface LocalTestAccountsFile {
  version: 1;
  accounts: LocalTestAccount[];
}

/**
 * 개별 테스트 계정
 */
export interface LocalTestAccount {
  id: string;
  role: string;
  email: string;
  password: string; // 암호화된 값 (encrypted:...)
  description?: string;
}

// =============================================
// 환경 변수 타입
// =============================================

/**
 * 환경 변수 맵
 */
export interface EnvironmentVariables {
  [key: string]: string;
}

// =============================================
// 소스 표시 타입
// =============================================

/**
 * 설정 소스
 */
export type SettingsSource = 'local' | 'global';

/**
 * 소스 정보가 포함된 데이터
 */
export interface WithSource<T> {
  data: T;
  source: SettingsSource;
}

/**
 * 하이브리드 컨텍스트 (일부 로컬, 일부 전역)
 */
export interface HybridContext {
  integrations: WithSource<LocalIntegrationMapping>;
  environments: WithSource<string[]>;
  testAccounts: WithSource<Array<{ role: string; email: string }>>;
  currentEnvironment?: string;
}

// =============================================
// 파일 경로 상수
// =============================================

export const LOCAL_SETTINGS_DIR = '.zyflow';
export const LOCAL_SETTINGS_FILE = 'settings.json';
export const LOCAL_ENVIRONMENTS_DIR = 'environments';
export const LOCAL_TEST_ACCOUNTS_FILE = 'test-accounts.json';

// =============================================
// 스키마 검증용 기본값
// =============================================

export function createDefaultLocalSettings(): LocalSettings {
  const now = new Date().toISOString();
  return {
    version: 1,
    integrations: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultTestAccountsFile(): LocalTestAccountsFile {
  return {
    version: 1,
    accounts: [],
  };
}
