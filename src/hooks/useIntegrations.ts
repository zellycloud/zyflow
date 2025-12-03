import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = 'http://localhost:3001/api/integrations';

// =============================================
// Types
// =============================================

export type ServiceType = 'github' | 'supabase' | 'vercel' | 'sentry' | 'custom';

export interface ServiceAccount {
  id: string;
  type: ServiceType;
  name: string;
  credentials: Record<string, string>;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubCredentials {
  username: string;
  token: string;
  email?: string;
  sshKeyPath?: string;
}

export interface SupabaseCredentials {
  projectUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export interface VercelCredentials {
  token: string;
  teamId?: string;
}

export interface SentryCredentials {
  dsn: string;
  authToken?: string;
  orgSlug: string;
  projectSlug: string;
}

export interface CustomCredentials {
  [key: string]: string;
}

export type Credentials =
  | GitHubCredentials
  | SupabaseCredentials
  | VercelCredentials
  | SentryCredentials
  | CustomCredentials;

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  variables: Record<string, string>;
  serverUrl: string | null;
  databaseUrl: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TestAccount {
  id: string;
  projectId: string;
  role: string;
  email: string;
  password: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectIntegration {
  id: string;
  projectId: string;
  integrations: Record<string, string | undefined>;
  defaultEnvironment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectContext {
  projectId: string;
  github?: { username: string; email?: string };
  supabase?: { projectUrl: string };
  vercel?: { teamId?: string };
  sentry?: { orgSlug: string; projectSlug: string };
  environments: string[];
  currentEnvironment?: string;
  testAccounts: Array<{ role: string; email: string }>;
}

// =============================================
// Service Accounts Hooks
// =============================================

export function useServiceAccounts(type?: ServiceType) {
  return useQuery({
    queryKey: ['integrations', 'accounts', type],
    queryFn: async () => {
      const url = type ? `${API_BASE}/accounts?type=${type}` : `${API_BASE}/accounts`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch service accounts');
      const data = await res.json();
      return data.accounts as ServiceAccount[];
    },
  });
}

export function useServiceAccount(id: string) {
  return useQuery({
    queryKey: ['integrations', 'accounts', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/accounts/${id}`);
      if (!res.ok) throw new Error('Failed to fetch service account');
      const data = await res.json();
      return data.account as ServiceAccount;
    },
    enabled: !!id,
  });
}

export function useCreateServiceAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      type: ServiceType;
      name: string;
      credentials: Credentials;
      metadata?: Record<string, string>;
    }) => {
      const res = await fetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create service account');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'accounts'] });
    },
  });
}

export function useUpdateServiceAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      name?: string;
      credentials?: Credentials;
      metadata?: Record<string, string>;
    }) => {
      const { id, ...updates } = params;
      const res = await fetch(`${API_BASE}/accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update service account');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'accounts'] });
    },
  });
}

export function useDeleteServiceAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_BASE}/accounts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete service account');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'accounts'] });
    },
  });
}

export function useServiceAccountCredentials(id: string, enabled = false) {
  return useQuery({
    queryKey: ['integrations', 'accounts', id, 'credentials'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/accounts/${id}/credentials`);
      if (!res.ok) throw new Error('Failed to fetch credentials');
      const data = await res.json();
      return data.credentials as Credentials;
    },
    enabled: enabled && !!id,
  });
}

// =============================================
// Project Integration Hooks
// =============================================

export function useProjectIntegration(projectId: string) {
  return useQuery({
    queryKey: ['integrations', 'projects', projectId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/projects/${projectId}`);
      if (!res.ok) throw new Error('Failed to fetch project integration');
      const data = await res.json();
      return data.integration as ProjectIntegration | null;
    },
    enabled: !!projectId,
  });
}

export function useUpdateProjectIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      integrations?: Record<string, string | undefined>;
      defaultEnvironment?: string;
    }) => {
      const { projectId, ...updates } = params;
      const res = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update project integration');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'projects', variables.projectId],
      });
    },
  });
}

export function useSetProjectService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      serviceType: ServiceType;
      accountId: string | null;
    }) => {
      const { projectId, serviceType, accountId } = params;
      const res = await fetch(`${API_BASE}/projects/${projectId}/services/${serviceType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) throw new Error('Failed to set project service');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'projects', variables.projectId],
      });
    },
  });
}

export function useProjectContext(projectId: string) {
  return useQuery({
    queryKey: ['integrations', 'projects', projectId, 'context'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/projects/${projectId}/context`);
      if (!res.ok) throw new Error('Failed to fetch project context');
      const data = await res.json();
      return data.context as ProjectContext;
    },
    enabled: !!projectId,
  });
}

// =============================================
// Environment Hooks
// =============================================

export function useEnvironments(projectId: string) {
  return useQuery({
    queryKey: ['integrations', 'projects', projectId, 'environments'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/projects/${projectId}/environments`);
      if (!res.ok) throw new Error('Failed to fetch environments');
      const data = await res.json();
      return data.environments as Environment[];
    },
    enabled: !!projectId,
  });
}

export function useCreateEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      name: string;
      variables: Record<string, string>;
      serverUrl?: string;
      databaseUrl?: string;
      description?: string;
      isActive?: boolean;
    }) => {
      const { projectId, ...data } = params;
      const res = await fetch(`${API_BASE}/projects/${projectId}/environments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create environment');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'projects', variables.projectId, 'environments'],
      });
    },
  });
}

export function useUpdateEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      envId: string;
      name?: string;
      variables?: Record<string, string>;
      serverUrl?: string;
      databaseUrl?: string;
      description?: string;
    }) => {
      const { projectId, envId, ...updates } = params;
      const res = await fetch(`${API_BASE}/projects/${projectId}/environments/${envId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update environment');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'projects', variables.projectId, 'environments'],
      });
    },
  });
}

export function useDeleteEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { projectId: string; envId: string }) => {
      const { projectId, envId } = params;
      const res = await fetch(`${API_BASE}/projects/${projectId}/environments/${envId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete environment');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'projects', variables.projectId, 'environments'],
      });
    },
  });
}

export function useActivateEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { projectId: string; envId: string }) => {
      const { projectId, envId } = params;
      const res = await fetch(`${API_BASE}/projects/${projectId}/environments/${envId}/activate`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error('Failed to activate environment');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'projects', variables.projectId, 'environments'],
      });
    },
  });
}

// =============================================
// Test Account Hooks
// =============================================

export function useTestAccounts(projectId: string) {
  return useQuery({
    queryKey: ['integrations', 'projects', projectId, 'test-accounts'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/projects/${projectId}/test-accounts`);
      if (!res.ok) throw new Error('Failed to fetch test accounts');
      const data = await res.json();
      return data.accounts as TestAccount[];
    },
    enabled: !!projectId,
  });
}

export function useCreateTestAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      role: string;
      email: string;
      password: string;
      description?: string;
    }) => {
      const { projectId, ...data } = params;
      const res = await fetch(`${API_BASE}/projects/${projectId}/test-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create test account');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'projects', variables.projectId, 'test-accounts'],
      });
    },
  });
}

export function useUpdateTestAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      id: string;
      role?: string;
      email?: string;
      password?: string;
      description?: string;
    }) => {
      const { projectId, id, ...updates } = params;
      const res = await fetch(`${API_BASE}/projects/${projectId}/test-accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update test account');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'projects', variables.projectId, 'test-accounts'],
      });
    },
  });
}

export function useDeleteTestAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { projectId: string; id: string }) => {
      const { projectId, id } = params;
      const res = await fetch(`${API_BASE}/projects/${projectId}/test-accounts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete test account');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'projects', variables.projectId, 'test-accounts'],
      });
    },
  });
}

export function useTestAccountPassword(projectId: string, id: string, enabled = false) {
  return useQuery({
    queryKey: ['integrations', 'projects', projectId, 'test-accounts', id, 'password'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/projects/${projectId}/test-accounts/${id}/password`);
      if (!res.ok) throw new Error('Failed to fetch password');
      const data = await res.json();
      return data.password as string;
    },
    enabled: enabled && !!projectId && !!id,
  });
}

// =============================================
// Env Import Types
// =============================================

export interface DetectedService {
  type: string;
  displayName: string;
  credentials: Record<string, string>;
  isComplete: boolean;
  missingRequired: string[];
  sources: string[];
  existingAccount?: {
    id: string;
    name: string;
  };
}

export interface EnvScanResult {
  files: string[];
  services: DetectedService[];
  unmatchedCount: number;
}

export interface EnvImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ type: string; error: string }>;
  accounts: Array<{ id: string; type: string; name: string }>;
}

// =============================================
// Env Import Hooks
// =============================================

export function useScanEnv(projectPath: string, enabled = false) {
  return useQuery({
    queryKey: ['integrations', 'env', 'scan', projectPath],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/env/scan?projectPath=${encodeURIComponent(projectPath)}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to scan env files');
      }
      const data = await res.json();
      return data as EnvScanResult;
    },
    enabled: enabled && !!projectPath,
  });
}

export function useImportEnv() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectPath: string;
      services: Array<{ type: string; name: string }>;
    }) => {
      const res = await fetch(`${API_BASE}/env/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to import services');
      }
      return res.json() as Promise<EnvImportResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'accounts'] });
    },
  });
}
