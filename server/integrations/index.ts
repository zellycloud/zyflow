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

// Local Settings
export {
  // Types
  type LocalSettings,
  type LocalTestAccountsFile,
  type LocalTestAccount,
  type LocalIntegrationMapping,
  type SettingsSource,
  type WithSource,
  type HybridContext,
  type ResolvedProjectContext,
  type ResolvedEnvironment,
  type ResolvedTestAccount,
  type InitLocalResult,
  type ExportToLocalOptions,
  type ExportToLocalResult,
  // Constants
  LOCAL_SETTINGS_DIR,
  LOCAL_SETTINGS_FILE,
  LOCAL_ENVIRONMENTS_DIR,
  LOCAL_TEST_ACCOUNTS_FILE,
  // File utilities
  getProjectZyflowPath,
  hasZyflowDir,
  ensureZyflowDir,
  hasLocalSettings,
  loadLocalSettings,
  saveLocalSettings,
  initLocalSettings,
  listLocalEnvironments,
  loadLocalEnvironment,
  saveLocalEnvironment,
  loadLocalTestAccounts,
  saveLocalTestAccounts,
  initLocalZyflow,
  // Resolver
  SettingsResolver,
  resolveProjectContext,
  resolveEnvironment,
  resolveTestAccounts,
} from './local/index.js';
