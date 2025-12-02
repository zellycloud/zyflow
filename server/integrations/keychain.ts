import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';
import { generateMasterKey } from './crypto.js';
import { getIntegrationsDir } from './db/client.js';

const KEYCHAIN_SERVICE = 'zyflow-integrations';
const KEYCHAIN_ACCOUNT = 'master-key';
const KEY_FILE_NAME = '.master-key';

/**
 * macOS Keychain에서 키 읽기
 */
function readFromKeychain(): string | null {
  try {
    const result = execSync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w 2>/dev/null`,
      { encoding: 'utf8' }
    );
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * macOS Keychain에 키 저장
 */
function writeToKeychain(key: string): boolean {
  try {
    // 기존 항목 삭제 (있으면)
    try {
      execSync(
        `security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" 2>/dev/null`
      );
    } catch {
      // 없으면 무시
    }

    // 새 항목 추가
    execSync(
      `security add-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w "${key}" 2>/dev/null`
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * macOS Keychain에서 키 삭제
 */
function deleteFromKeychain(): boolean {
  try {
    execSync(
      `security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" 2>/dev/null`
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 파일에서 키 읽기 (fallback)
 */
function readFromFile(): string | null {
  const keyPath = join(getIntegrationsDir(), KEY_FILE_NAME);
  if (!existsSync(keyPath)) {
    return null;
  }
  try {
    return readFileSync(keyPath, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * 파일에 키 저장 (fallback)
 */
function writeToFile(key: string): boolean {
  const keyPath = join(getIntegrationsDir(), KEY_FILE_NAME);
  try {
    writeFileSync(keyPath, key, 'utf8');
    // 소유자만 읽기/쓰기 가능 (chmod 600)
    chmodSync(keyPath, 0o600);
    return true;
  } catch {
    return false;
  }
}

/**
 * 파일에서 키 삭제
 */
function deleteFromFile(): boolean {
  const keyPath = join(getIntegrationsDir(), KEY_FILE_NAME);
  if (!existsSync(keyPath)) {
    return true;
  }
  try {
    const { unlinkSync } = require('fs');
    unlinkSync(keyPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 현재 플랫폼이 macOS Keychain을 지원하는지 확인
 */
export function isKeychainSupported(): boolean {
  return platform() === 'darwin';
}

/**
 * 마스터 키 가져오기
 * - macOS: Keychain 우선, 없으면 파일
 * - 다른 플랫폼: 파일
 * - 키가 없으면 새로 생성
 */
export async function getMasterKey(): Promise<string> {
  let key: string | null = null;

  // macOS는 Keychain 우선
  if (isKeychainSupported()) {
    key = readFromKeychain();
    if (key) {
      return key;
    }
  }

  // 파일에서 읽기
  key = readFromFile();
  if (key) {
    // macOS인데 Keychain에 없으면 마이그레이션
    if (isKeychainSupported()) {
      writeToKeychain(key);
    }
    return key;
  }

  // 새 키 생성
  const newKey = generateMasterKey();
  await saveMasterKey(newKey);
  return newKey;
}

/**
 * 마스터 키 저장
 */
export async function saveMasterKey(key: string): Promise<boolean> {
  if (isKeychainSupported()) {
    // macOS: Keychain에 저장, 파일은 백업용
    const keychainResult = writeToKeychain(key);
    if (keychainResult) {
      // 파일 백업도 생성 (Keychain 접근 불가 시 fallback)
      writeToFile(key);
      return true;
    }
  }

  // 다른 플랫폼 또는 Keychain 실패: 파일에 저장
  return writeToFile(key);
}

/**
 * 마스터 키 삭제 (초기화용)
 */
export async function deleteMasterKey(): Promise<boolean> {
  let success = true;

  if (isKeychainSupported()) {
    success = deleteFromKeychain() && success;
  }

  success = deleteFromFile() && success;
  return success;
}

/**
 * 마스터 키 존재 여부 확인
 */
export async function hasMasterKey(): Promise<boolean> {
  if (isKeychainSupported()) {
    if (readFromKeychain()) {
      return true;
    }
  }
  return readFromFile() !== null;
}

/**
 * 마스터 키 회전 (기존 데이터 재암호화 필요)
 * 주의: 이 함수는 키만 변경하고, 데이터 재암호화는 별도로 수행해야 함
 */
export async function rotateMasterKey(): Promise<{ oldKey: string; newKey: string }> {
  const oldKey = await getMasterKey();
  const newKey = generateMasterKey();

  // 새 키 저장
  await saveMasterKey(newKey);

  return { oldKey, newKey };
}

/**
 * 키 저장소 상태 확인
 */
export interface KeyStorageStatus {
  platform: string;
  keychainSupported: boolean;
  keychainHasKey: boolean;
  fileHasKey: boolean;
  keyLocation: 'keychain' | 'file' | 'none';
}

export async function getKeyStorageStatus(): Promise<KeyStorageStatus> {
  const isMacOS = isKeychainSupported();
  const keychainHasKey = isMacOS ? readFromKeychain() !== null : false;
  const fileHasKey = readFromFile() !== null;

  let keyLocation: 'keychain' | 'file' | 'none' = 'none';
  if (keychainHasKey) {
    keyLocation = 'keychain';
  } else if (fileHasKey) {
    keyLocation = 'file';
  }

  return {
    platform: platform(),
    keychainSupported: isMacOS,
    keychainHasKey,
    fileHasKey,
    keyLocation,
  };
}
