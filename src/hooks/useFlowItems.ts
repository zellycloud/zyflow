/**
 * Flow Items Hook with MoAI SPEC Support
 *
 * Unified hook for fetching and managing flow items (OpenSpec changes + MoAI SPECs)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { FlowItem, FlowSyncResponse } from '@/types'
import { isOpenSpecChange, isMoaiSpec } from '@/types'
import { flowApi, parseFlowItem } from '@/api/flow'
import { isApiError, getErrorMessage } from '@/api/client'

// =============================================
// Flow Items Query Hook
// =============================================

interface UseFlowItemsOptions {
  enabled?: boolean
  refetchInterval?: number
}

/**
 * Fetch all flow items (OpenSpec changes + MoAI SPECs)
 *
 * @example
 * ```tsx
 * const { data: items, error, isLoading } = useFlowItems()
 *
 * items?.forEach(item => {
 *   if (isOpenSpecChange(item)) {
 *     // Handle OpenSpec change
 *   } else if (isMoaiSpec(item)) {
 *     // Handle MoAI SPEC
 *   }
 * })
 * ```
 */
export function useFlowItems(options?: UseFlowItemsOptions) {
  const { enabled = true, refetchInterval = undefined } = options || {}

  return useQuery({
    queryKey: ['flow', 'items'],
    queryFn: async (): Promise<FlowItem[]> => {
      return flowApi.listChanges()
    },
    enabled,
    staleTime: 30000,
    gcTime: 300000,
    refetchInterval,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

// =============================================
// Filter Hooks (Type-Safe)
// =============================================

/**
 * Get only OpenSpec changes from flow items
 */
export function useOpenSpecChanges(options?: UseFlowItemsOptions) {
  const { data: allItems, ...rest } = useFlowItems(options)

  const data = allItems?.filter(isOpenSpecChange) ?? []

  return {
    data,
    ...rest,
  }
}

/**
 * Get only MoAI SPECs from flow items
 */
export function useMoaiSpecs(options?: UseFlowItemsOptions) {
  const { data: allItems, ...rest } = useFlowItems(options)

  const data = allItems?.filter(isMoaiSpec) ?? []

  return {
    data,
    ...rest,
  }
}

// =============================================
// Single Item Query
// =============================================

/**
 * Fetch a single flow item by ID
 *
 * @param itemId - The ID of the flow item to fetch
 */
export function useFlowItem(itemId: string | null) {
  return useQuery({
    queryKey: ['flow', 'items', itemId],
    queryFn: async (): Promise<FlowItem | null> => {
      if (!itemId) return null

      const response = await flowApi.getChange(itemId)
      return parseFlowItem(response.change)
    },
    enabled: !!itemId,
    staleTime: 30000,
    gcTime: 300000,
  })
}

// =============================================
// Sync Mutations
// =============================================

/**
 * Sync all flow items
 */
export function useSyncFlowItems() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<FlowSyncResponse> => {
      return flowApi.syncChanges()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flow'] })
      return data
    },
    onError: (error) => {
      console.error('Failed to sync flow items:', getErrorMessage(error))
    },
  })
}

/**
 * Sync a specific flow item
 */
export function useSyncFlowItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (itemId: string): Promise<{ changeId: string; tasksCreated: number; tasksUpdated: number }> => {
      return flowApi.syncChange(itemId)
    },
    onSuccess: (_data, itemId) => {
      queryClient.invalidateQueries({ queryKey: ['flow', 'items', itemId] })
      queryClient.invalidateQueries({ queryKey: ['flow'] })
    },
    onError: (error) => {
      console.error('Failed to sync flow item:', getErrorMessage(error))
    },
  })
}

// =============================================
// Archive Mutation
// =============================================

interface ArchiveFlowItemInput {
  itemId: string
  skipSpecs?: boolean
  force?: boolean
}

/**
 * Archive a flow item
 */
export function useArchiveFlowItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ itemId, skipSpecs, force }: ArchiveFlowItemInput): Promise<{ changeId: string; archived: boolean; filesMoved: boolean }> => {
      return flowApi.archiveChange(itemId, { skipSpecs, force })
    },
    onSuccess: (_data, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['flow', 'items', itemId] })
      queryClient.invalidateQueries({ queryKey: ['flow'] })
    },
    onError: (error) => {
      const message = getErrorMessage(error)
      console.error('Failed to archive flow item:', message)

      // Re-throw for UI error handling
      throw error
    },
  })
}

// =============================================
// Error Handling Utilities
// =============================================

/**
 * Check if a flow item fetch error is a 404 (not found)
 */
export function isFlowItemNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404
}

/**
 * Check if a flow item operation is a validation error
 */
export function isFlowItemValidationError(error: unknown): boolean {
  return isApiError(error) && error.status === 422
}
