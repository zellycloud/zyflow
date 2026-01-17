import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { ApiResponse } from '@/types'

export interface InstanceInfo {
  name: string
  displayName: string
  port: string | number
  dataDir: string
  defaultProjectRoot: string
}

async function fetchInstance(): Promise<InstanceInfo> {
  const response = await fetch('/api/instance')
  const json: ApiResponse<InstanceInfo> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch instance info')
  }

  return json.data
}

export function useInstance() {
  const query = useQuery({
    queryKey: ['instance'],
    queryFn: fetchInstance,
    staleTime: Infinity, // Instance info doesn't change during runtime
    gcTime: Infinity,
  })

  // Update document title when instance info is loaded
  useEffect(() => {
    if (query.data?.displayName) {
      document.title = `${query.data.displayName} - Dashboard`
    }
  }, [query.data?.displayName])

  return query
}
