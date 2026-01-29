/**
 * Flow API with MoAI SPEC Support
 *
 * Handles both OpenSpec and MoAI SPEC response formats using discriminated unions
 */

import { api } from './client'
import type { FlowItem, OpenSpecChangeWithType, MoaiSpecWithType, FlowChange, FlowTask, FlowSyncResponse, FlowChangeCountsResponse } from '@/types'
import { isOpenSpecChange, isMoaiSpec } from '@/types'

// =============================================
// Response Type Handlers
// =============================================

/**
 * Parse flow item response and ensure proper discriminator
 */
export function parseFlowItem(data: unknown): FlowItem | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const item = data as Record<string, unknown>

  // Check discriminator field
  if (item.type === 'openspec') {
    return item as unknown as OpenSpecChangeWithType
  } else if (item.type === 'spec') {
    return item as unknown as MoaiSpecWithType
  }

  // Default to OpenSpec for backward compatibility
  return {
    ...item,
    type: 'openspec',
  } as unknown as OpenSpecChangeWithType
}

/**
 * Parse array of flow items
 */
export function parseFlowItems(items: unknown[]): FlowItem[] {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map(item => parseFlowItem(item))
    .filter((item): item is FlowItem => item !== null)
}

// =============================================
// Flow API Endpoints
// =============================================

export const flowApi = {
  /**
   * List all flow changes (supports both OpenSpec and MoAI SPEC formats)
   */
  listChanges: async (): Promise<FlowItem[]> => {
    const response = await api.get<{ changes: unknown[] }>('/api/flow/changes')
    return parseFlowItems(response.changes)
  },

  /**
   * Get change counts with detailed breakdown
   */
  getChangeCounts: async (status?: string): Promise<FlowChangeCountsResponse> => {
    return api.get<FlowChangeCountsResponse>(
      `/api/flow/changes/counts${status ? `?status=${status}` : ''}`
    )
  },

  /**
   * Get a single flow change with all details
   */
  getChange: async (changeId: string): Promise<{ change: FlowChange; stages: Record<string, any> }> => {
    return api.get<{ change: FlowChange; stages: Record<string, any> }>(
      `/api/flow/changes/${changeId}`
    )
  },

  /**
   * Sync all flow changes
   */
  syncChanges: async (): Promise<FlowSyncResponse> => {
    return api.post<FlowSyncResponse>('/api/flow/sync')
  },

  /**
   * Sync all changes across projects
   */
  syncAllChanges: async (): Promise<FlowSyncResponse> => {
    return api.post<FlowSyncResponse>('/api/flow/sync/all')
  },

  /**
   * Sync a specific change
   */
  syncChange: async (changeId: string): Promise<{ changeId: string; tasksCreated: number; tasksUpdated: number }> => {
    return api.post<{ changeId: string; tasksCreated: number; tasksUpdated: number }>(
      `/api/flow/changes/${changeId}/sync`
    )
  },

  /**
   * Archive a change
   */
  archiveChange: async (
    changeId: string,
    options?: { skipSpecs?: boolean; force?: boolean }
  ): Promise<{ changeId: string; archived: boolean; filesMoved: boolean }> => {
    return api.post<{ changeId: string; archived: boolean; filesMoved: boolean }>(
      `/api/flow/changes/${changeId}/archive`,
      options
    )
  },

  /**
   * Fix validation errors for a change
   */
  fixValidation: async (changeId: string): Promise<{ changeId: string; proposalFixed: boolean; specsFixed: number }> => {
    return api.post<{ changeId: string; proposalFixed: boolean; specsFixed: number }>(
      `/api/flow/changes/${changeId}/fix-validation`
    )
  },

  /**
   * Get proposal content for a change
   */
  getProposal: async (changeId: string): Promise<{ changeId: string; content: string | null }> => {
    return api.get<{ changeId: string; content: string | null }>(
      `/api/flow/changes/${changeId}/proposal`
    )
  },

  /**
   * Get design content for a change
   */
  getDesign: async (changeId: string): Promise<{ changeId: string; content: string | null }> => {
    return api.get<{ changeId: string; content: string | null }>(
      `/api/flow/changes/${changeId}/design`
    )
  },

  /**
   * Get spec content for a change
   */
  getSpec: async (changeId: string): Promise<{ changeId: string; content: string | null; specId: string | null }> => {
    return api.get<{ changeId: string; content: string | null; specId: string | null }>(
      `/api/flow/changes/${changeId}/spec`
    )
  },

  /**
   * Get specific spec by ID
   */
  getSpecById: async (changeId: string, specId: string): Promise<{ specId: string; content: string | null; location: string | null }> => {
    return api.get<{ specId: string; content: string | null; location: string | null }>(
      `/api/flow/changes/${changeId}/specs/${specId}`
    )
  },

  /**
   * List flow tasks with optional filters
   */
  listTasks: async (params?: {
    changeId?: string
    stage?: string
    status?: string
    standalone?: boolean
    includeArchived?: boolean
  }): Promise<{ tasks: FlowTask[] }> => {
    const searchParams = new URLSearchParams()
    if (params?.changeId) searchParams.set('changeId', params.changeId)
    if (params?.stage) searchParams.set('stage', params.stage)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.standalone) searchParams.set('standalone', 'true')
    if (params?.includeArchived) searchParams.set('includeArchived', 'true')
    const query = searchParams.toString()
    return api.get<{ tasks: FlowTask[] }>(
      `/api/flow/tasks${query ? `?${query}` : ''}`
    )
  },

  /**
   * Create a new flow task
   */
  createTask: async (data: {
    changeId?: string
    stage?: string
    title: string
    description?: string
    priority?: string
  }): Promise<{ task: FlowTask }> => {
    return api.post<{ task: FlowTask }>('/api/flow/tasks', data)
  },

  /**
   * Update a flow task
   */
  updateTask: async (taskId: string, data: Record<string, unknown>): Promise<{ task: FlowTask }> => {
    return api.patch<{ task: FlowTask }>(`/api/flow/tasks/${taskId}`, data)
  },
}

// =============================================
// Type Assertion Helpers
// =============================================

/**
 * Assert that a FlowItem is an OpenSpec change
 * Throws error if not
 */
export function assertOpenSpecChange(item: FlowItem): OpenSpecChangeWithType {
  if (!isOpenSpecChange(item)) {
    throw new Error(`Expected OpenSpec change but got: ${item.type}`)
  }
  return item
}

/**
 * Assert that a FlowItem is a MoAI SPEC
 * Throws error if not
 */
export function assertMoaiSpec(item: FlowItem): MoaiSpecWithType {
  if (!isMoaiSpec(item)) {
    throw new Error(`Expected MoAI SPEC but got: ${item.type}`)
  }
  return item
}

export default flowApi
