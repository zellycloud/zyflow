import { useQuery } from '@tanstack/react-query'
import type { Spec, ApiResponse, SpecsResponse, SpecContentResponse } from '@/types'

async function fetchSpecs(): Promise<Spec[]> {
  const response = await fetch('/api/specs')
  const json: ApiResponse<SpecsResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch specs')
  }

  return json.data.specs
}

async function fetchSpecContent(specId: string): Promise<string> {
  const response = await fetch(`/api/specs/${specId}`)
  const json: ApiResponse<SpecContentResponse> = await response.json()

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch spec content')
  }

  return json.data.content
}

export function useSpecs() {
  return useQuery({
    queryKey: ['specs'],
    queryFn: fetchSpecs,
  })
}

export function useSpecContent(specId: string | null) {
  return useQuery({
    queryKey: ['spec', specId],
    queryFn: () => fetchSpecContent(specId!),
    enabled: !!specId,
  })
}
