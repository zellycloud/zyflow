import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// AES-256-GCM 설정
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

/**
 * 암호화된 데이터 구조
 */
export interface EncryptedData {
  version: 1;
  salt: string; // hex
  iv: string; // hex
  authTag: string; // hex
  data: string; // hex
}

/**
 * 마스터 키에서 암호화 키 파생
 */
async function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
  return (await scryptAsync(masterKey, salt, KEY_LENGTH)) as Buffer;
}

/**
 * 데이터 암호화 (AES-256-GCM)
 *
 * @param plaintext 암호화할 문자열
 * @param masterKey 마스터 키
 * @returns 암호화된 데이터 (JSON 직렬화 가능)
 */
export async function encrypt(plaintext: string, masterKey: string): Promise<EncryptedData> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(masterKey, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted,
  };
}

/**
 * 데이터 복호화 (AES-256-GCM)
 *
 * @param encryptedData 암호화된 데이터
 * @param masterKey 마스터 키
 * @returns 복호화된 문자열
 */
export async function decrypt(encryptedData: EncryptedData, masterKey: string): Promise<string> {
  if (encryptedData.version !== 1) {
    throw new Error(`Unsupported encryption version: ${encryptedData.version}`);
  }

  const salt = Buffer.from(encryptedData.salt, 'hex');
  const key = await deriveKey(masterKey, salt);
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.authTag, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * 객체 암호화 (JSON 직렬화 후 암호화)
 */
export async function encryptObject<T>(obj: T, masterKey: string): Promise<string> {
  const json = JSON.stringify(obj);
  const encrypted = await encrypt(json, masterKey);
  return JSON.stringify(encrypted);
}

/**
 * 객체 복호화 (복호화 후 JSON 파싱)
 */
export async function decryptObject<T>(encryptedString: string, masterKey: string): Promise<T> {
  const encryptedData: EncryptedData = JSON.parse(encryptedString);
  const json = await decrypt(encryptedData, masterKey);
  return JSON.parse(json) as T;
}

/**
 * 랜덤 마스터 키 생성
 */
export function generateMasterKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * 민감 정보 마스킹 (UI 표시용)
 * 예: "ghp_xxxxxxxxxxxx" -> "ghp_...xxxx"
 */
export function maskSensitive(value: string, showChars: number = 4): string {
  if (value.length <= showChars * 2) {
    return '*'.repeat(value.length);
  }

  const prefix = value.slice(0, showChars);
  const suffix = value.slice(-showChars);
  return `${prefix}...${suffix}`;
}

/**
 * 암호화된 문자열인지 확인
 */
export function isEncrypted(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return (
      parsed &&
      typeof parsed === 'object' &&
      parsed.version === 1 &&
      typeof parsed.salt === 'string' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.authTag === 'string' &&
      typeof parsed.data === 'string'
    );
  } catch {
    return false;
  }
}
