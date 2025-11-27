import { useQuery } from '@tanstack/react-query'
import type { Change, ApiResponse, ChangesResponse } from '@/types'

async function fetchChanges(): Promise<Change[]> {
  const response = await fetch('/api/changes')
  const json: ApiResponse<ChangesResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch changes')
  }

  return json.data.changes
}

export function useChanges() {
  return useQuery({
    queryKey: ['changes'],
    queryFn: fetchChanges,
  })
}
