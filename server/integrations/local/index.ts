/**
 * Local Settings Module
 * 프로젝트 로컬 .zyflow/ 설정 관리
 */

// Types
export type {
  LocalSettings,
  LocalTestAccountsFile,
  LocalTestAccount,
  LocalIntegrationMapping,
  EnvironmentVariables,
  SettingsSource,
  WithSource,
  HybridContext,
} from './types.js';

export {
  LOCAL_SETTINGS_DIR,
  LOCAL_SETTINGS_FILE,
  LOCAL_ENVIRONMENTS_DIR,
  LOCAL_TEST_ACCOUNTS_FILE,
  createDefaultLocalSettings,
  createDefaultTestAccountsFile,
} from './types.js';

// File Utilities
export {
  getProjectZyflowPath,
  getProjectEnvironmentsPath,
  getSettingsPath,
  getTestAccountsPath,
  getEnvironmentFilePath,
  hasZyflowDir,
  ensureZyflowDir,
  hasLocalSettings,
  loadLocalSettings,
  saveLocalSettings,
  initLocalSettings,
  listLocalEnvironments,
  hasLocalEnvironment,
  loadLocalEnvironment,
  saveLocalEnvironment,
  hasLocalTestAccounts,
  loadLocalTestAccounts,
  saveLocalTestAccounts,
  decryptTestAccountPassword,
  encryptTestAccountPassword,
  initLocalZyflow,
  type InitLocalResult,
  type ExportToLocalOptions,
  type ExportToLocalResult,
} from './file-utils.js';

// Settings Resolver
export {
  SettingsResolver,
  resolveProjectContext,
  resolveEnvironment,
  resolveTestAccounts,
  type ResolvedProjectContext,
  type ResolvedEnvironment,
  type ResolvedTestAccount,
} from './resolver.js';
