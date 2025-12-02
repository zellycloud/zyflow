// Integration Hub - 서비스 계정 및 프로젝트 연동 관리

// Database
export { initIntegrationsDb, getIntegrationsDb, closeIntegrationsDb } from './db/client.js';

// Schema & Types
export type {
  ServiceType,
  ServiceAccount,
  Environment,
  TestAccount,
  ProjectIntegration,
  Credentials,
  GitHubCredentials,
  SupabaseCredentials,
  VercelCredentials,
  SentryCredentials,
  CustomCredentials,
  ProjectContext,
} from './db/schema.js';

// Crypto
export { encrypt, decrypt, encryptObject, decryptObject, maskSensitive, generateMasterKey } from './crypto.js';

// Keychain
export { getMasterKey, saveMasterKey, hasMasterKey, getKeyStorageStatus, isKeychainSupported } from './keychain.js';

// Services - Accounts
export {
  createServiceAccount,
  listServiceAccounts,
  getServiceAccount,
  getServiceAccountCredentials,
  updateServiceAccount,
  deleteServiceAccount,
  getAccountsByType,
} from './services/accounts.js';

// Services - Projects
export {
  getProjectIntegration,
  upsertProjectIntegration,
  setProjectService,
  listEnvironments,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  setActiveEnvironment,
  getEnvironmentVariables,
  listTestAccounts,
  createTestAccount,
  updateTestAccount,
  deleteTestAccount,
  getTestAccountPassword,
  getProjectContext,
} from './services/projects.js';

// Routes
export { default as integrationsRouter } from './routes.js';
