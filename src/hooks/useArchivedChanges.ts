import { useQuery } from '@tanstack/react-query'
import type { ArchivedChange, ArchivedChangeDetail, ApiResponse, ArchivedChangesResponse, ArchivedChangeDetailResponse } from '@/types'

async function fetchArchivedChanges(): Promise<ArchivedChange[]> {
  const response = await fetch('/api/changes/archived')
  const json: ApiResponse<ArchivedChangesResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch archived changes')
  }

  return json.data.changes
}

async function fetchArchivedChangeDetail(id: string): Promise<ArchivedChangeDetail> {
  const response = await fetch(`/api/changes/archived/${id}`)
  const json: ApiResponse<ArchivedChangeDetailResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch archived change detail')
  }

  return json.data
}

export function useArchivedChanges() {
  return useQuery({
    queryKey: ['archivedChanges'],
    queryFn: fetchArchivedChanges,
  })
}

export function useArchivedChangeDetail(id: string | null) {
  return useQuery({
    queryKey: ['archivedChange', id],
    queryFn: () => fetchArchivedChangeDetail(id!),
    enabled: !!id,
  })
}
