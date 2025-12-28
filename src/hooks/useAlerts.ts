import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse } from '@/types'
import { API_ENDPOINTS } from '@/config/api'

const API_BASE = API_ENDPOINTS.base

// =============================================
// Alert Types
// =============================================

export type AlertSource = 'github' | 'vercel' | 'sentry' | 'supabase' | 'custom'
export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertStatus = 'pending' | 'processing' | 'resolved' | 'ignored'

export interface AlertMetadata {
  repo?: string
  branch?: string
  commit?: string
  environment?: string
  projectId?: string
}

export interface AlertAnalysis {
  alertId: string
  rootCause?: string
  relatedFiles?: string[]
  suggestedFix?: string
  autoFixable: boolean
  autoFixAction?: 'retry' | 'rollback' | 'patch'
  confidence: number
  similarAlerts?: string[]
  documentation?: string
  analyzedAt: string
}

export interface AlertResolution {
  type: 'auto' | 'manual'
  action: string
  details?: string
  prUrl?: string
}

export interface Alert {
  id: string
  source: AlertSource
  type: string
  severity: AlertSeverity
  status: AlertStatus
  title: string
  summary?: string
  external_url?: string
  payload: string // JSON
  metadata?: string // JSON
  analysis?: string // JSON
  resolution?: string // JSON
  created_at: number
  updated_at: number
  resolved_at?: number
  expires_at: number
}

export interface ActivityLog {
  id: string
  alert_id?: string
  actor: 'system' | 'agent' | 'user'
  action: string
  description: string
  metadata?: string // JSON
  created_at: number
}

export interface WebhookConfig {
  id: string
  source: AlertSource
  name: string
  endpoint: string
  secret?: string
  enabled: boolean
  rules?: string // JSON
  project_ids?: string // JSON
  created_at: number
  updated_at: number
}

export interface NotificationConfig {
  slack: {
    webhookUrl?: string
    channel?: string
    enabled: boolean
  }
  rules: {
    onCritical: boolean
    onAutofix: boolean
    onAll: boolean
  }
}

export interface AlertStats {
  total: number
  bySeverity: Record<AlertSeverity, number>
  bySource: Record<AlertSource, number>
  byStatus: Record<AlertStatus, number>
}

// =============================================
// Alerts API Hooks
// =============================================

interface AlertsListData {
  alerts: Alert[]
  total: number
  limit: number
  offset: number
}

interface AlertsFilter {
  source?: AlertSource
  severity?: AlertSeverity
  status?: AlertStatus
  limit?: number
  offset?: number
}

export function useAlerts(filter?: AlertsFilter) {
  const params = new URLSearchParams()
  if (filter?.source) params.set('source', filter.source)
  if (filter?.severity) params.set('severity', filter.severity)
  if (filter?.status) params.set('status', filter.status)
  if (filter?.limit) params.set('limit', String(filter.limit))
  if (filter?.offset) params.set('offset', String(filter.offset))

  const queryString = params.toString()

  return useQuery({
    queryKey: ['alerts', filter],
    queryFn: async (): Promise<AlertsListData> => {
      const url = queryString
        ? `${API_BASE}/alerts?${queryString}`
        : `${API_BASE}/alerts`
      const res = await fetch(url)
      const json: ApiResponse<AlertsListData> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    staleTime: 10000, // 10초
    refetchInterval: 30000, // 30초마다 자동 refetch
  })
}

export function useAlert(alertId: string | null) {
  return useQuery({
    queryKey: ['alerts', alertId],
    queryFn: async (): Promise<Alert | null> => {
      if (!alertId) return null
      const res = await fetch(`${API_BASE}/alerts/${alertId}`)
      if (res.status === 404) return null
      const json: ApiResponse<Alert> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data ?? null
    },
    enabled: !!alertId,
  })
}

export function useAlertStats() {
  return useQuery({
    queryKey: ['alerts', 'stats'],
    queryFn: async (): Promise<AlertStats> => {
      const res = await fetch(`${API_BASE}/alerts/stats`)
      const json: ApiResponse<AlertStats> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    staleTime: 10000,
    refetchInterval: 30000,
  })
}

export function useUpdateAlertStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ alertId, status }: { alertId: string; status: AlertStatus }) => {
      const res = await fetch(`${API_BASE}/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json: ApiResponse<Alert> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.setQueryData(['alerts', data.id], data)
    },
  })
}

export function useIgnoreAlert() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/ignore`, {
        method: 'POST',
      })
      const json: ApiResponse<Alert> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.setQueryData(['alerts', data.id], data)
    },
  })
}

// 수동 분석 트리거
export function useAnalyzeAlert() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/analyze`, {
        method: 'POST',
      })
      const json: ApiResponse<{ alert: Alert; analysis: AlertAnalysis }> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.setQueryData(['alerts', data.alert.id], data.alert)
    },
  })
}

// 전체 처리 워크플로우 트리거
export function useProcessAlert() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/process`, {
        method: 'POST',
      })
      const json: ApiResponse<{ alert: Alert; result: ProcessingResult }> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.setQueryData(['alerts', data.alert.id], data.alert)
    },
  })
}

interface ProcessingResult {
  alertId: string
  analyzed: boolean
  riskLevel?: 'low' | 'medium' | 'high'
  autoFixAttempted: boolean
  autoFixSuccess?: boolean
  notificationSent: boolean
}

// =============================================
// Activity Logs API Hooks
// =============================================

interface ActivitiesFilter {
  alertId?: string
  actor?: 'system' | 'agent' | 'user'
  limit?: number
  offset?: number
}

export function useActivityLogs(filter?: ActivitiesFilter) {
  const params = new URLSearchParams()
  if (filter?.alertId) params.set('alertId', filter.alertId)
  if (filter?.actor) params.set('actor', filter.actor)
  if (filter?.limit) params.set('limit', String(filter.limit))
  if (filter?.offset) params.set('offset', String(filter.offset))

  const queryString = params.toString()

  return useQuery({
    queryKey: ['alerts', 'activities', filter],
    queryFn: async (): Promise<ActivityLog[]> => {
      const url = queryString
        ? `${API_BASE}/alerts/activities?${queryString}`
        : `${API_BASE}/alerts/activities`
      const res = await fetch(url)
      const json: ApiResponse<ActivityLog[]> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data ?? []
    },
    staleTime: 10000,
  })
}

// =============================================
// Webhook Config API Hooks
// =============================================

export function useWebhookConfigs() {
  return useQuery({
    queryKey: ['alerts', 'webhook-configs'],
    queryFn: async (): Promise<WebhookConfig[]> => {
      const res = await fetch(`${API_BASE}/alerts/webhook-configs`)
      const json: ApiResponse<WebhookConfig[]> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data ?? []
    },
  })
}

export function useCreateWebhookConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { source: AlertSource; name: string; rules?: object; projectIds?: string[] }) => {
      const res = await fetch(`${API_BASE}/alerts/webhook-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json: ApiResponse<{ id: string; endpoint: string; secret: string }> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', 'webhook-configs'] })
    },
  })
}

export function useUpdateWebhookConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ configId, ...data }: { configId: string; name?: string; enabled?: boolean; rules?: object; projectIds?: string[] }) => {
      const res = await fetch(`${API_BASE}/alerts/webhook-configs/${configId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json: ApiResponse<WebhookConfig> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', 'webhook-configs'] })
    },
  })
}

export function useDeleteWebhookConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (configId: string) => {
      const res = await fetch(`${API_BASE}/alerts/webhook-configs/${configId}`, {
        method: 'DELETE',
      })
      const json: ApiResponse<void> = await res.json()
      if (!json.success) throw new Error(json.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', 'webhook-configs'] })
    },
  })
}

export function useRegenerateWebhookSecret() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (configId: string) => {
      const res = await fetch(`${API_BASE}/alerts/webhook-configs/${configId}/regenerate-secret`, {
        method: 'POST',
      })
      const json: ApiResponse<{ secret: string }> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', 'webhook-configs'] })
    },
  })
}

// =============================================
// Notification Config API Hooks
// =============================================

export function useNotificationConfig() {
  return useQuery({
    queryKey: ['alerts', 'notification-config'],
    queryFn: async (): Promise<NotificationConfig> => {
      const res = await fetch(`${API_BASE}/alerts/notification-config`)
      const json: ApiResponse<NotificationConfig> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
  })
}

export function useUpdateNotificationConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Partial<NotificationConfig>) => {
      const res = await fetch(`${API_BASE}/alerts/notification-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json: ApiResponse<void> = await res.json()
      if (!json.success) throw new Error(json.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', 'notification-config'] })
    },
  })
}

export function useTestSlackNotification() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/alerts/notification-config/test`, {
        method: 'POST',
      })
      const json: ApiResponse<void> = await res.json()
      if (!json.success) throw new Error(json.error)
    },
  })
}

// =============================================
// Helper Functions
// =============================================

export function parseAlertMetadata(alert: Alert): AlertMetadata | null {
  if (!alert.metadata) return null
  try {
    return JSON.parse(alert.metadata)
  } catch {
    return null
  }
}

export function parseAlertAnalysis(alert: Alert): AlertAnalysis | null {
  if (!alert.analysis) return null
  try {
    return JSON.parse(alert.analysis)
  } catch {
    return null
  }
}

export function parseAlertResolution(alert: Alert): AlertResolution | null {
  if (!alert.resolution) return null
  try {
    return JSON.parse(alert.resolution)
  } catch {
    return null
  }
}

export function formatAlertTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return '방금 전'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
  return `${Math.floor(diff / 86400000)}일 전`
}

export function getSeverityColor(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return 'text-red-500'
    case 'warning':
      return 'text-yellow-500'
    case 'info':
      return 'text-blue-500'
    default:
      return 'text-gray-500'
  }
}

export function getSeverityBgColor(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/10'
    case 'warning':
      return 'bg-yellow-500/10'
    case 'info':
      return 'bg-blue-500/10'
    default:
      return 'bg-gray-500/10'
  }
}

export function getSourceIcon(source: AlertSource): string {
  switch (source) {
    case 'github':
      return '🐙'
    case 'vercel':
      return '▲'
    case 'sentry':
      return '🐛'
    case 'supabase':
      return '⚡'
    default:
      return '🔔'
  }
}

export function getStatusBadgeClass(status: AlertStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-500/20 text-yellow-600'
    case 'processing':
      return 'bg-blue-500/20 text-blue-600'
    case 'resolved':
      return 'bg-green-500/20 text-green-600'
    case 'ignored':
      return 'bg-gray-500/20 text-gray-600'
    default:
      return 'bg-gray-500/20 text-gray-600'
  }
}

// =============================================
// Phase 3: Dashboard & Advanced Stats Hooks
// =============================================

export interface DashboardStats {
  todayAlerts: number
  pendingAlerts: number
  resolutionRate: number
  autoFixRate: number
  avgResolutionTimeHours: number | null
  criticalToday: number
  weekOverWeekChange: number
  autoFixedCount: number
  manualFixedCount: number
}

export interface TrendData {
  date: string
  totalCount: number
  criticalCount: number
  warningCount: number
  infoCount: number
  resolvedCount: number
  ignoredCount: number
  autoFixedCount: number
  avgResolutionTime?: number
}

export interface AdvancedStats {
  totalAlerts: number
  resolvedAlerts: number
  avgResolutionTime: number
  autoFixRate: number
  topPatterns: AlertPattern[]
  sourceBreakdown: Record<string, number>
  severityBreakdown: Record<string, number>
  resolutionTimeBySource: Record<string, number>
}

export interface AlertPattern {
  id: string
  source: AlertSource
  type: string
  pattern_signature: string
  pattern_keywords?: string
  resolution_count: number
  auto_fix_count: number
  manual_fix_count: number
  avg_resolution_time?: number
  recommended_action?: string
  recommended_fix?: string
  success_rate?: number
  created_at: number
  updated_at: number
}

export interface SimilarAlert {
  id: string
  title: string
  similarity: number
  resolution?: string
  resolvedAt?: number
}

// Dashboard Stats Hook
export function useDashboardStats() {
  return useQuery({
    queryKey: ['alerts', 'dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const res = await fetch(`${API_BASE}/alerts/dashboard-stats`)
      const json: ApiResponse<DashboardStats> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    staleTime: 30000, // 30초
    refetchInterval: 60000, // 1분마다 refetch
  })
}

// Trends Hook
export function useAlertTrends(days: number = 30, source?: AlertSource) {
  return useQuery({
    queryKey: ['alerts', 'trends', { days, source }],
    queryFn: async (): Promise<TrendData[]> => {
      const params = new URLSearchParams({ days: String(days) })
      if (source) params.set('source', source)

      const res = await fetch(`${API_BASE}/alerts/trends?${params}`)
      const json: ApiResponse<TrendData[]> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data ?? []
    },
    staleTime: 60000, // 1분
  })
}

// Advanced Stats Hook
export function useAdvancedStats() {
  return useQuery({
    queryKey: ['alerts', 'advanced-stats'],
    queryFn: async (): Promise<AdvancedStats> => {
      const res = await fetch(`${API_BASE}/alerts/advanced-stats`)
      const json: ApiResponse<AdvancedStats> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    staleTime: 60000, // 1분
  })
}

// Alert Patterns Hook
export function useAlertPatterns(source?: AlertSource, limit: number = 20) {
  return useQuery({
    queryKey: ['alerts', 'patterns', { source, limit }],
    queryFn: async (): Promise<AlertPattern[]> => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (source) params.set('source', source)

      const res = await fetch(`${API_BASE}/alerts/patterns?${params}`)
      const json: ApiResponse<AlertPattern[]> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data ?? []
    },
    staleTime: 60000, // 1분
  })
}

// Similar Alerts Hook
export function useSimilarAlerts(alertId: string | null) {
  return useQuery({
    queryKey: ['alerts', 'similar', alertId],
    queryFn: async (): Promise<SimilarAlert[]> => {
      if (!alertId) return []
      const res = await fetch(`${API_BASE}/alerts/similar/${alertId}`)
      const json: ApiResponse<SimilarAlert[]> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data ?? []
    },
    enabled: !!alertId,
  })
}

// Create PR Hook
export function useCreatePR() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ alertId, patchContent }: { alertId: string; patchContent?: string }) => {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/create-pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patchContent }),
      })
      const json: ApiResponse<{ success: boolean; prUrl?: string; prNumber?: number; error?: string }> = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data!
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['alerts', 'dashboard-stats'] })
        queryClient.invalidateQueries({ queryKey: ['alerts', 'patterns'] })
      }
    },
  })
}

// Format time helpers
export function formatResolutionTime(ms: number | null | undefined): string {
  if (!ms) return '-'
  const hours = ms / 3600000
  if (hours < 1) {
    const minutes = Math.round(ms / 60000)
    return `${minutes}분`
  }
  if (hours < 24) {
    return `${Math.round(hours * 10) / 10}시간`
  }
  const days = Math.round(hours / 24 * 10) / 10
  return `${days}일`
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return `${Math.round(value * 100)}%`
}

export function formatChange(value: number): { text: string; isPositive: boolean } {
  const isPositive = value < 0 // Less alerts is positive
  const text = value === 0 ? '변화 없음' : `${value > 0 ? '+' : ''}${value}%`
  return { text, isPositive }
}
