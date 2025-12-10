/**
 * Local Settings File Utilities
 * 프로젝트 로컬 .zyflow/ 폴더의 파일 읽기/쓰기 유틸리티
 */

import { readFile, writeFile, mkdir, access, readdir } from 'fs/promises';
import { join } from 'path';
import {
  type LocalSettings,
  type LocalTestAccountsFile,
  type LocalTestAccount,
  type EnvironmentVariables,
  LOCAL_SETTINGS_DIR,
  LOCAL_SETTINGS_FILE,
  LOCAL_ENVIRONMENTS_DIR,
  LOCAL_TEST_ACCOUNTS_FILE,
  createDefaultLocalSettings,
} from './types.js';
import { parseEnvContent } from '../env-parser.js';
import { encryptObject, decryptObject } from '../crypto.js';
import { getMasterKey } from '../keychain.js';

// =============================================
// 경로 유틸리티
// =============================================

/**
 * 프로젝트의 .zyflow 디렉토리 경로 반환
 */
export function getProjectZyflowPath(projectPath: string): string {
  return join(projectPath, LOCAL_SETTINGS_DIR);
}

/**
 * 프로젝트의 environments 디렉토리 경로 반환
 */
export function getProjectEnvironmentsPath(projectPath: string): string {
  return join(getProjectZyflowPath(projectPath), LOCAL_ENVIRONMENTS_DIR);
}

/**
 * 프로젝트의 settings.json 경로 반환
 */
export function getSettingsPath(projectPath: string): string {
  return join(getProjectZyflowPath(projectPath), LOCAL_SETTINGS_FILE);
}

/**
 * 프로젝트의 test-accounts.json 경로 반환
 */
export function getTestAccountsPath(projectPath: string): string {
  return join(getProjectZyflowPath(projectPath), LOCAL_TEST_ACCOUNTS_FILE);
}

/**
 * 환경 변수 파일 경로 반환
 */
export function getEnvironmentFilePath(projectPath: string, envName: string): string {
  return join(getProjectEnvironmentsPath(projectPath), `${envName}.env`);
}

// =============================================
// 디렉토리 유틸리티
// =============================================

/**
 * .zyflow 디렉토리 존재 여부 확인
 */
export async function hasZyflowDir(projectPath: string): Promise<boolean> {
  try {
    await access(getProjectZyflowPath(projectPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * .zyflow 디렉토리 생성 (없으면)
 */
export async function ensureZyflowDir(projectPath: string): Promise<string> {
  const zyflowPath = getProjectZyflowPath(projectPath);
  const envsPath = getProjectEnvironmentsPath(projectPath);

  await mkdir(zyflowPath, { recursive: true });
  await mkdir(envsPath, { recursive: true });

  return zyflowPath;
}

// =============================================
// Settings 파일 유틸리티
// =============================================

/**
 * settings.json 존재 여부 확인
 */
export async function hasLocalSettings(projectPath: string): Promise<boolean> {
  try {
    await access(getSettingsPath(projectPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * settings.json 읽기
 */
export async function loadLocalSettings(projectPath: string): Promise<LocalSettings | null> {
  try {
    const settingsPath = getSettingsPath(projectPath);
    const content = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as LocalSettings;

    // 버전 검증
    if (settings.version !== 1) {
      console.warn(`Unsupported local settings version: ${settings.version}`);
      return null;
    }

    return settings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error('Failed to load local settings:', error);
    return null;
  }
}

/**
 * settings.json 저장
 */
export async function saveLocalSettings(
  projectPath: string,
  settings: LocalSettings
): Promise<void> {
  await ensureZyflowDir(projectPath);
  const settingsPath = getSettingsPath(projectPath);
  settings.updatedAt = new Date().toISOString();
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * 기본 settings.json 생성
 */
export async function initLocalSettings(projectPath: string): Promise<LocalSettings> {
  const settings = createDefaultLocalSettings();
  await saveLocalSettings(projectPath, settings);
  return settings;
}

// =============================================
// Environment 파일 유틸리티
// =============================================

/**
 * 로컬 환경 파일 목록 조회
 */
export async function listLocalEnvironments(projectPath: string): Promise<string[]> {
  try {
    const envsPath = getProjectEnvironmentsPath(projectPath);
    const entries = await readdir(envsPath);
    return entries
      .filter((e) => e.endsWith('.env'))
      .map((e) => e.replace('.env', ''));
  } catch {
    return [];
  }
}

/**
 * 특정 환경의 변수 파일 존재 여부 확인
 */
export async function hasLocalEnvironment(
  projectPath: string,
  envName: string
): Promise<boolean> {
  try {
    await access(getEnvironmentFilePath(projectPath, envName));
    return true;
  } catch {
    return false;
  }
}

/**
 * 로컬 환경 변수 파일 읽기
 */
export async function loadLocalEnvironment(
  projectPath: string,
  envName: string
): Promise<EnvironmentVariables | null> {
  try {
    const envPath = getEnvironmentFilePath(projectPath, envName);
    const content = await readFile(envPath, 'utf-8');
    const parsed = parseEnvContent(content);

    // Map을 Object로 변환
    const variables: EnvironmentVariables = {};
    for (const [key, value] of parsed) {
      variables[key] = value;
    }

    return variables;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error(`Failed to load local environment ${envName}:`, error);
    return null;
  }
}

/**
 * 로컬 환경 변수 파일 저장
 */
export async function saveLocalEnvironment(
  projectPath: string,
  envName: string,
  variables: EnvironmentVariables
): Promise<void> {
  await ensureZyflowDir(projectPath);
  const envPath = getEnvironmentFilePath(projectPath, envName);

  // .env 형식으로 변환
  const lines: string[] = [];
  for (const [key, value] of Object.entries(variables)) {
    // 멀티라인 또는 특수문자가 있으면 따옴표로 감싸기
    const needsQuotes = value.includes('\n') || value.includes('"') || value.includes("'");
    const escapedValue = needsQuotes
      ? `"${value.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
      : value;
    lines.push(`${key}=${escapedValue}`);
  }

  await writeFile(envPath, lines.join('\n'), 'utf-8');
}

// =============================================
// Test Accounts 파일 유틸리티
// =============================================

/**
 * test-accounts.json 존재 여부 확인
 */
export async function hasLocalTestAccounts(projectPath: string): Promise<boolean> {
  try {
    await access(getTestAccountsPath(projectPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * test-accounts.json 읽기 (비밀번호 복호화)
 */
export async function loadLocalTestAccounts(
  projectPath: string
): Promise<LocalTestAccount[] | null> {
  try {
    const accountsPath = getTestAccountsPath(projectPath);
    const content = await readFile(accountsPath, 'utf-8');
    const file = JSON.parse(content) as LocalTestAccountsFile;

    // 버전 검증
    if (file.version !== 1) {
      console.warn(`Unsupported test accounts version: ${file.version}`);
      return null;
    }

    return file.accounts;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error('Failed to load local test accounts:', error);
    return null;
  }
}

/**
 * test-accounts.json 저장 (비밀번호 암호화)
 */
export async function saveLocalTestAccounts(
  projectPath: string,
  accounts: LocalTestAccount[]
): Promise<void> {
  await ensureZyflowDir(projectPath);
  const accountsPath = getTestAccountsPath(projectPath);

  const file: LocalTestAccountsFile = {
    version: 1,
    accounts,
  };

  await writeFile(accountsPath, JSON.stringify(file, null, 2), 'utf-8');
}

/**
 * 테스트 계정 비밀번호 복호화
 */
export async function decryptTestAccountPassword(
  encryptedPassword: string
): Promise<string> {
  // "encrypted:..." 형식 확인
  if (!encryptedPassword.startsWith('encrypted:')) {
    return encryptedPassword; // 암호화되지 않음
  }

  const masterKey = await getMasterKey();
  const encrypted = encryptedPassword.slice('encrypted:'.length);
  return decryptObject<string>(encrypted, masterKey);
}

/**
 * 테스트 계정 비밀번호 암호화
 */
export async function encryptTestAccountPassword(password: string): Promise<string> {
  const masterKey = await getMasterKey();
  const encrypted = await encryptObject(password, masterKey);
  return `encrypted:${encrypted}`;
}

// =============================================
// 초기화 및 내보내기 유틸리티
// =============================================

/**
 * 로컬 설정 초기화 결과
 */
export interface InitLocalResult {
  zyflowPath: string;
  settingsCreated: boolean;
  environmentsDir: string;
  files: string[];
}

/**
 * 프로젝트에 .zyflow 초기화
 */
export async function initLocalZyflow(projectPath: string): Promise<InitLocalResult> {
  const zyflowPath = await ensureZyflowDir(projectPath);
  const envsPath = getProjectEnvironmentsPath(projectPath);

  const files: string[] = [];
  let settingsCreated = false;

  // settings.json이 없으면 생성
  if (!(await hasLocalSettings(projectPath))) {
    await initLocalSettings(projectPath);
    settingsCreated = true;
    files.push(LOCAL_SETTINGS_FILE);
  }

  return {
    zyflowPath,
    settingsCreated,
    environmentsDir: envsPath,
    files,
  };
}

/**
 * 내보내기 옵션
 */
export interface ExportToLocalOptions {
  includeEnvironments?: boolean;
  includeTestAccounts?: boolean;
  environmentNames?: string[]; // 특정 환경만 내보내기
}

/**
 * 내보내기 결과
 */
export interface ExportToLocalResult {
  settingsFile: string;
  environmentFiles: string[];
  testAccountsFile: string | null;
  totalFiles: number;
}
