/**
 * 시스템 설정 Import 서비스
 * Git Config, gh CLI, AWS credentials, GCloud 등에서 서비스 계정 정보를 가져옴
 */

import { execSync } from 'child_process';
import { readFile, access, readdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createServiceAccount, listServiceAccounts } from './accounts.js';
import type { ServiceType } from '../db/schema.js';
import { maskCredentialValue, type ExtendedServiceType, type EnvironmentHint } from '../service-patterns.js';

// =============================================
// 타입 정의
// =============================================

export interface SystemSource {
  id: string;
  name: string;
  description: string;
  icon: string;
  available: boolean;
  error?: string;
}

export interface DetectedSystemService {
  type: ExtendedServiceType;
  displayName: string;
  source: string; // 'git-config', 'gh-cli', 'aws-credentials', 'gcloud', etc.
  credentials: Record<string, string>; // 마스킹된 값
  rawCredentials: Record<string, string>; // 원본 값 (내부용)
  isComplete: boolean;
  missingRequired: string[];
  environment?: EnvironmentHint;
  existingAccount?: {
    id: string;
    name: string;
  };
}

export interface SystemScanResult {
  sources: SystemSource[];
  services: Omit<DetectedSystemService, 'rawCredentials'>[];
}

// 내부용 (rawCredentials 포함)
interface InternalScanResult {
  sources: SystemSource[];
  services: DetectedSystemService[];
}

// =============================================
// Git Config 스캔
// =============================================

interface GitConfigResult {
  userName?: string;
  userEmail?: string;
  githubUsername?: string; // Remote URL에서 추출한 GitHub 사용자명
  remoteUrl?: string;
  scope: 'global' | 'local';
}

/**
 * Git remote URL에서 GitHub 사용자명 추출
 * 지원 형식:
 * - git@github.com:username/repo.git
 * - https://github.com/username/repo.git
 * - https://username@github.com/username/repo.git
 * - ssh://git@github.com/username/repo.git
 */
function extractGitHubUsernameFromUrl(url: string): string | undefined {
  if (!url) return undefined;

  // SSH 형식: git@github.com:username/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\//);
  if (sshMatch) return sshMatch[1];

  // SSH 형식 (ssh:// 프로토콜): ssh://git@github.com/username/repo.git
  const sshProtocolMatch = url.match(/ssh:\/\/git@github\.com\/([^/]+)\//);
  if (sshProtocolMatch) return sshProtocolMatch[1];

  // HTTPS 형식 (인증 포함): https://username@github.com/...
  const httpsAuthMatch = url.match(/https:\/\/([^@]+)@github\.com\//);
  if (httpsAuthMatch) return httpsAuthMatch[1];

  // HTTPS 형식: https://github.com/username/repo.git
  const httpsMatch = url.match(/https:\/\/github\.com\/([^/]+)\//);
  if (httpsMatch) return httpsMatch[1];

  return undefined;
}

/**
 * .git/config 파일에서 remote URL 파싱
 */
async function parseGitConfigFile(gitConfigPath: string): Promise<{ remoteUrl?: string; githubUsername?: string }> {
  try {
    const content = await readFile(gitConfigPath, 'utf-8');

    // [remote "origin"] 섹션에서 url 찾기
    const remoteMatch = content.match(/\[remote\s+"origin"\][^\[]*url\s*=\s*(.+)/m);
    if (remoteMatch) {
      const remoteUrl = remoteMatch[1].trim();
      const githubUsername = extractGitHubUsernameFromUrl(remoteUrl);
      return { remoteUrl, githubUsername };
    }

    // origin이 없으면 첫 번째 remote 사용
    const anyRemoteMatch = content.match(/\[remote\s+"[^"]+"\][^\[]*url\s*=\s*(.+)/m);
    if (anyRemoteMatch) {
      const remoteUrl = anyRemoteMatch[1].trim();
      const githubUsername = extractGitHubUsernameFromUrl(remoteUrl);
      return { remoteUrl, githubUsername };
    }
  } catch {
    // 파일 읽기 실패
  }

  return {};
}

async function scanGitConfig(projectPath?: string): Promise<GitConfigResult | null> {
  try {
    // Global config
    let userName: string | undefined;
    let userEmail: string | undefined;
    let githubUsername: string | undefined;
    let remoteUrl: string | undefined;
    let scope: 'global' | 'local' = 'global';

    try {
      userName = execSync('git config --global user.name', { encoding: 'utf-8' }).trim();
    } catch {
      // Not set
    }

    try {
      userEmail = execSync('git config --global user.email', { encoding: 'utf-8' }).trim();
    } catch {
      // Not set
    }

    // Local config (if projectPath provided)
    if (projectPath) {
      try {
        const localName = execSync('git config --local user.name', {
          cwd: projectPath,
          encoding: 'utf-8',
        }).trim();
        if (localName) {
          userName = localName;
          scope = 'local';
        }
      } catch {
        // Not set or not a git repo
      }

      try {
        const localEmail = execSync('git config --local user.email', {
          cwd: projectPath,
          encoding: 'utf-8',
        }).trim();
        if (localEmail) {
          userEmail = localEmail;
          scope = 'local';
        }
      } catch {
        // Not set
      }

      // .git/config에서 remote URL 파싱하여 GitHub 사용자명 추출
      const gitConfigPath = join(projectPath, '.git', 'config');
      const { remoteUrl: parsedUrl, githubUsername: parsedUsername } = await parseGitConfigFile(gitConfigPath);
      if (parsedUrl) {
        remoteUrl = parsedUrl;
        scope = 'local';
      }
      if (parsedUsername) {
        githubUsername = parsedUsername;
      }
    }

    // Global .gitconfig에서도 remote URL 추출 시도 (credential 관련)
    if (!githubUsername) {
      try {
        // Git credential helper에서 저장된 username 시도
        const credentialOutput = execSync('git config --global credential.https://github.com.username 2>/dev/null', {
          encoding: 'utf-8',
        }).trim();
        if (credentialOutput) {
          githubUsername = credentialOutput;
        }
      } catch {
        // Not set
      }
    }

    if (userName || userEmail || githubUsername) {
      return { userName, userEmail, githubUsername, remoteUrl, scope };
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================
// gh CLI 스캔
// =============================================

interface GhCliResult {
  authenticated: boolean;
  user?: string;
  token?: string;
  scopes?: string[];
}

async function scanGhCli(): Promise<GhCliResult> {
  try {
    // Check if gh is installed and authenticated
    const statusOutput = execSync('gh auth status 2>&1', { encoding: 'utf-8' });

    // Extract username from output
    const userMatch = statusOutput.match(/Logged in to github\.com account (\S+)/i) ||
                      statusOutput.match(/Logged in to github\.com as (\S+)/i);
    const user = userMatch?.[1];

    // Get token
    let token: string | undefined;
    try {
      token = execSync('gh auth token', { encoding: 'utf-8' }).trim();
    } catch {
      // Token retrieval failed
    }

    // Get scopes
    let scopes: string[] = [];
    try {
      const scopesOutput = execSync('gh auth status --show-token 2>&1', { encoding: 'utf-8' });
      const scopeMatch = scopesOutput.match(/Token scopes: (.+)/);
      if (scopeMatch) {
        scopes = scopeMatch[1].split(',').map(s => s.trim());
      }
    } catch {
      // Scopes not available
    }

    return {
      authenticated: !!token,
      user,
      token,
      scopes,
    };
  } catch {
    return { authenticated: false };
  }
}

// =============================================
// AWS Credentials 스캔
// =============================================

interface AwsCredentials {
  profile: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
}

async function scanAwsCredentials(): Promise<AwsCredentials[]> {
  const credentials: AwsCredentials[] = [];
  const home = homedir();
  const awsDir = join(home, '.aws');

  try {
    await access(awsDir);
  } catch {
    return credentials;
  }

  // Parse credentials file
  try {
    const credentialsPath = join(awsDir, 'credentials');
    const content = await readFile(credentialsPath, 'utf-8');

    let currentProfile = '';
    const profiles: Map<string, AwsCredentials> = new Map();

    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      // Profile header
      const profileMatch = trimmed.match(/^\[(.+)\]$/);
      if (profileMatch) {
        currentProfile = profileMatch[1];
        profiles.set(currentProfile, { profile: currentProfile });
        continue;
      }

      // Key-value pairs
      if (currentProfile && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        const profile = profiles.get(currentProfile);

        if (profile) {
          const keyLower = key.trim().toLowerCase();
          if (keyLower === 'aws_access_key_id') {
            profile.accessKeyId = value;
          } else if (keyLower === 'aws_secret_access_key') {
            profile.secretAccessKey = value;
          }
        }
      }
    }

    credentials.push(...profiles.values());
  } catch {
    // Credentials file not found or unreadable
  }

  // Parse config file for regions
  try {
    const configPath = join(awsDir, 'config');
    const content = await readFile(configPath, 'utf-8');

    let currentProfile = '';

    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      // Profile header (format: [profile xxx] or [default])
      const profileMatch = trimmed.match(/^\[(?:profile\s+)?(.+)\]$/);
      if (profileMatch) {
        currentProfile = profileMatch[1];
        continue;
      }

      // Region
      if (currentProfile && trimmed.startsWith('region')) {
        const [, value] = trimmed.split('=');
        const existing = credentials.find(c => c.profile === currentProfile);
        if (existing) {
          existing.region = value?.trim();
        }
      }
    }
  } catch {
    // Config file not found
  }

  return credentials.filter(c => c.accessKeyId && c.secretAccessKey);
}

// =============================================
// GCloud 설정 스캔
// =============================================

interface GCloudConfig {
  account?: string;
  project?: string;
  region?: string;
}

async function scanGCloudConfig(): Promise<GCloudConfig | null> {
  try {
    // Check if gcloud is installed
    execSync('which gcloud', { encoding: 'utf-8' });

    const config: GCloudConfig = {};

    // Get current configuration
    try {
      const accountOutput = execSync('gcloud config get-value account 2>/dev/null', {
        encoding: 'utf-8',
      }).trim();
      if (accountOutput && accountOutput !== '(unset)') {
        config.account = accountOutput;
      }
    } catch {
      // Not set
    }

    try {
      const projectOutput = execSync('gcloud config get-value project 2>/dev/null', {
        encoding: 'utf-8',
      }).trim();
      if (projectOutput && projectOutput !== '(unset)') {
        config.project = projectOutput;
      }
    } catch {
      // Not set
    }

    try {
      const regionOutput = execSync('gcloud config get-value compute/region 2>/dev/null', {
        encoding: 'utf-8',
      }).trim();
      if (regionOutput && regionOutput !== '(unset)') {
        config.region = regionOutput;
      }
    } catch {
      // Not set
    }

    if (config.account || config.project) {
      return config;
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================
// Azure CLI 스캔
// =============================================

interface AzureConfig {
  subscriptionId?: string;
  subscriptionName?: string;
  tenantId?: string;
  userName?: string;
}

async function scanAzureCli(): Promise<AzureConfig | null> {
  try {
    // Check if az is installed and logged in
    const accountOutput = execSync('az account show 2>/dev/null', {
      encoding: 'utf-8',
    });

    const account = JSON.parse(accountOutput);

    return {
      subscriptionId: account.id,
      subscriptionName: account.name,
      tenantId: account.tenantId,
      userName: account.user?.name,
    };
  } catch {
    return null;
  }
}

// =============================================
// npm/yarn 설정 스캔
// =============================================

interface NpmConfig {
  registry?: string;
  authToken?: string;
}

async function scanNpmConfig(): Promise<NpmConfig | null> {
  const home = homedir();

  try {
    // Check .npmrc
    const npmrcPath = join(home, '.npmrc');
    const content = await readFile(npmrcPath, 'utf-8');

    const config: NpmConfig = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('registry=')) {
        config.registry = trimmed.split('=')[1];
      }
      if (trimmed.includes(':_authToken=')) {
        config.authToken = trimmed.split(':_authToken=')[1];
      }
    }

    if (config.registry || config.authToken) {
      return config;
    }
  } catch {
    // .npmrc not found
  }

  return null;
}

// =============================================
// Docker Hub 스캔
// =============================================

interface DockerConfig {
  username?: string;
  hasCredentials: boolean;
}

async function scanDockerConfig(): Promise<DockerConfig | null> {
  const home = homedir();

  try {
    const configPath = join(home, '.docker', 'config.json');
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    // Check for docker hub credentials
    const auths = config.auths || {};
    const dockerHubAuth = auths['https://index.docker.io/v1/'] || auths['docker.io'];

    if (dockerHubAuth) {
      // Try to decode username from auth (base64 encoded username:password)
      let username: string | undefined;
      if (dockerHubAuth.auth) {
        try {
          const decoded = Buffer.from(dockerHubAuth.auth, 'base64').toString('utf-8');
          username = decoded.split(':')[0];
        } catch {
          // Decode failed
        }
      }

      return {
        username,
        hasCredentials: true,
      };
    }
  } catch {
    // Docker config not found
  }

  return null;
}

// =============================================
// 메인 스캔 함수
// =============================================

/**
 * 시스템 설정에서 사용 가능한 서비스 감지
 */
export async function scanSystemSources(projectPath?: string): Promise<InternalScanResult> {
  const sources: SystemSource[] = [];
  const services: DetectedSystemService[] = [];

  // 1. Git Config
  const gitConfig = await scanGitConfig(projectPath);
  sources.push({
    id: 'git-config',
    name: 'Git Config',
    description: gitConfig
      ? `${gitConfig.scope === 'local' ? 'Local' : 'Global'}: ${gitConfig.userName || '(no name)'}`
      : 'Git user configuration',
    icon: 'git-branch',
    available: !!gitConfig,
  });

  // 1.5 Git Remote (로컬 .git/config에서 GitHub 사용자명 추출)
  if (gitConfig?.githubUsername && gitConfig.remoteUrl) {
    sources.push({
      id: 'git-remote',
      name: 'Git Remote',
      description: `GitHub: ${gitConfig.githubUsername}`,
      icon: 'github',
      available: true,
    });
  }

  // 2. gh CLI
  const ghCli = await scanGhCli();
  sources.push({
    id: 'gh-cli',
    name: 'GitHub CLI',
    description: ghCli.authenticated
      ? `Authenticated as ${ghCli.user || 'unknown'}`
      : 'Not authenticated',
    icon: 'github',
    available: ghCli.authenticated,
    error: !ghCli.authenticated ? 'Run `gh auth login` to authenticate' : undefined,
  });

  // GitHub 서비스 생성 (gh CLI + git config + git remote 결합)
  if (ghCli.authenticated && ghCli.token) {
    const githubCredentials: Record<string, string> = {
      token: ghCli.token,
    };

    // 우선순위: gh CLI user > git remote username > git config username
    if (ghCli.user) {
      githubCredentials.username = ghCli.user;
    } else if (gitConfig?.githubUsername) {
      githubCredentials.username = gitConfig.githubUsername;
    } else if (gitConfig?.userName) {
      githubCredentials.username = gitConfig.userName;
    }

    if (gitConfig?.userEmail) {
      githubCredentials.email = gitConfig.userEmail;
    }

    const existingAccounts = await listServiceAccounts('github');
    const existing = existingAccounts.find(a => a.credentials.username === githubCredentials.username);

    services.push({
      type: 'github',
      displayName: 'GitHub',
      source: 'gh-cli',
      credentials: Object.fromEntries(
        Object.entries(githubCredentials).map(([k, v]) => [k, maskCredentialValue(v)])
      ),
      rawCredentials: githubCredentials,
      isComplete: !!(githubCredentials.token && githubCredentials.username),
      missingRequired: [],
      existingAccount: existing ? { id: existing.id, name: existing.name } : undefined,
    });
  } else if (gitConfig?.githubUsername) {
    // .git/config remote URL에서 추출한 GitHub 사용자명 (토큰 없음)
    const githubCredentials: Record<string, string> = {
      username: gitConfig.githubUsername,
    };
    if (gitConfig.userEmail) githubCredentials.email = gitConfig.userEmail;
    if (gitConfig.remoteUrl) githubCredentials.remoteUrl = gitConfig.remoteUrl;

    services.push({
      type: 'github',
      displayName: `GitHub (${gitConfig.githubUsername})`,
      source: 'git-remote',
      credentials: Object.fromEntries(
        Object.entries(githubCredentials).map(([k, v]) => [k, maskCredentialValue(v)])
      ),
      rawCredentials: githubCredentials,
      isComplete: false,
      missingRequired: ['token'],
    });
  } else if (gitConfig?.userName) {
    // Git config만 있는 경우 (토큰 없음)
    const githubCredentials: Record<string, string> = {};
    if (gitConfig.userName) githubCredentials.username = gitConfig.userName;
    if (gitConfig.userEmail) githubCredentials.email = gitConfig.userEmail;

    services.push({
      type: 'github',
      displayName: 'GitHub (from Git Config)',
      source: 'git-config',
      credentials: Object.fromEntries(
        Object.entries(githubCredentials).map(([k, v]) => [k, maskCredentialValue(v)])
      ),
      rawCredentials: githubCredentials,
      isComplete: false,
      missingRequired: ['token'],
    });
  }

  // 3. AWS Credentials
  const awsCredentials = await scanAwsCredentials();
  sources.push({
    id: 'aws-credentials',
    name: 'AWS Credentials',
    description: awsCredentials.length > 0
      ? `${awsCredentials.length} profile(s) found`
      : 'No profiles configured',
    icon: 'cloud',
    available: awsCredentials.length > 0,
  });

  for (const aws of awsCredentials) {
    if (aws.accessKeyId && aws.secretAccessKey) {
      const awsCreds: Record<string, string> = {
        accessKeyId: aws.accessKeyId,
        secretAccessKey: aws.secretAccessKey,
      };
      if (aws.region) awsCreds.region = aws.region;

      const existingAccounts = await listServiceAccounts('custom');
      const existing = existingAccounts.find(
        a => a.metadata?.originalType === 'aws' && a.credentials.accessKeyId === maskCredentialValue(aws.accessKeyId!)
      );

      services.push({
        type: 'aws',
        displayName: `AWS (${aws.profile})`,
        source: 'aws-credentials',
        credentials: Object.fromEntries(
          Object.entries(awsCreds).map(([k, v]) => [k, maskCredentialValue(v)])
        ),
        rawCredentials: awsCreds,
        isComplete: true,
        missingRequired: [],
        existingAccount: existing ? { id: existing.id, name: existing.name } : undefined,
      });
    }
  }

  // 4. GCloud
  const gcloudConfig = await scanGCloudConfig();
  sources.push({
    id: 'gcloud',
    name: 'Google Cloud SDK',
    description: gcloudConfig?.account
      ? `Account: ${gcloudConfig.account}`
      : 'Not configured',
    icon: 'cloud',
    available: !!gcloudConfig?.project,
  });

  if (gcloudConfig?.project) {
    const gcpCreds: Record<string, string> = {
      projectId: gcloudConfig.project,
    };
    if (gcloudConfig.region) gcpCreds.region = gcloudConfig.region;

    services.push({
      type: 'gcp',
      displayName: 'Google Cloud',
      source: 'gcloud',
      credentials: gcpCreds,
      rawCredentials: gcpCreds,
      isComplete: true,
      missingRequired: [],
    });
  }

  // 5. Azure CLI
  const azureConfig = await scanAzureCli();
  sources.push({
    id: 'azure-cli',
    name: 'Azure CLI',
    description: azureConfig?.subscriptionName
      ? `Subscription: ${azureConfig.subscriptionName}`
      : 'Not logged in',
    icon: 'cloud',
    available: !!azureConfig,
  });

  if (azureConfig?.subscriptionId) {
    const azureCreds: Record<string, string> = {
      subscriptionId: azureConfig.subscriptionId,
    };
    if (azureConfig.tenantId) azureCreds.tenantId = azureConfig.tenantId;

    services.push({
      type: 'azure',
      displayName: 'Azure',
      source: 'azure-cli',
      credentials: azureCreds,
      rawCredentials: azureCreds,
      isComplete: true,
      missingRequired: [],
    });
  }

  // 6. Docker Hub
  const dockerConfig = await scanDockerConfig();
  sources.push({
    id: 'docker',
    name: 'Docker Hub',
    description: dockerConfig?.username
      ? `Logged in as ${dockerConfig.username}`
      : 'Not logged in',
    icon: 'package',
    available: !!dockerConfig?.hasCredentials,
  });

  return { sources, services };
}

/**
 * 시스템 설정 스캔 (API용 - rawCredentials 제외)
 */
export async function scanSystemSourcesForApi(projectPath?: string): Promise<SystemScanResult> {
  const result = await scanSystemSources(projectPath);

  return {
    sources: result.sources,
    services: result.services.map(({ rawCredentials, ...rest }) => rest),
  };
}

// 스캔 결과 캐시
const systemScanCache = new Map<string, InternalScanResult>();

/**
 * 스캔 결과 캐시 저장
 */
export async function scanAndCacheSystemSources(projectPath?: string): Promise<SystemScanResult> {
  const result = await scanSystemSources(projectPath);
  const cacheKey = projectPath || '__global__';
  systemScanCache.set(cacheKey, result);

  return {
    sources: result.sources,
    services: result.services.map(({ rawCredentials, ...rest }) => rest),
  };
}

// =============================================
// Import 함수
// =============================================

export interface SystemImportRequest {
  services: Array<{
    type: ExtendedServiceType;
    source: string;
    name: string;
  }>;
}

export interface SystemImportResponse {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{
    type: ExtendedServiceType;
    source: string;
    error: string;
  }>;
  accounts: Array<{
    id: string;
    type: string;
    name: string;
  }>;
}

/**
 * 시스템 설정에서 서비스 Import
 */
export async function importSystemServices(
  request: SystemImportRequest,
  projectPath?: string
): Promise<SystemImportResponse> {
  const result: SystemImportResponse = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    accounts: [],
  };

  const cacheKey = projectPath || '__global__';
  let cached = systemScanCache.get(cacheKey);

  if (!cached) {
    cached = await scanSystemSources(projectPath);
    systemScanCache.set(cacheKey, cached);
  }

  for (const req of request.services) {
    const service = cached.services.find(
      s => s.type === req.type && s.source === req.source
    );

    if (!service) {
      result.errors.push({
        type: req.type,
        source: req.source,
        error: 'Service not found in scan results',
      });
      result.skipped++;
      continue;
    }

    if (!service.isComplete) {
      result.errors.push({
        type: req.type,
        source: req.source,
        error: `Missing required credentials: ${service.missingRequired.join(', ')}`,
      });
      result.skipped++;
      continue;
    }

    try {
      // Integration Hub 타입으로 매핑
      const hubType = mapToHubType(req.type);

      // custom 타입인 경우 원본 타입을 metadata에 저장
      const metadata = hubType === 'custom' ? { originalType: req.type } : undefined;

      const account = await createServiceAccount(
        hubType,
        req.name,
        service.rawCredentials,
        metadata
      );

      result.created++;
      result.accounts.push({
        id: account.id,
        type: hubType,
        name: req.name,
      });
    } catch (error) {
      result.errors.push({
        type: req.type,
        source: req.source,
        error: (error as Error).message,
      });
      result.skipped++;
    }
  }

  // 캐시 정리
  systemScanCache.delete(cacheKey);

  return result;
}

/**
 * ExtendedServiceType을 Hub 타입으로 매핑
 */
function mapToHubType(type: ExtendedServiceType): ServiceType {
  const directMap: Record<string, ServiceType> = {
    github: 'github',
    supabase: 'supabase',
    vercel: 'vercel',
    sentry: 'sentry',
  };
  return directMap[type] || 'custom';
}

/**
 * 캐시 정리
 */
export function clearSystemScanCache(projectPath?: string): void {
  if (projectPath) {
    systemScanCache.delete(projectPath);
    systemScanCache.delete('__global__');
  } else {
    systemScanCache.clear();
  }
}
