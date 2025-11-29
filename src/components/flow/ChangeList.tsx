import { useState, useEffect, useRef } from 'react'
import { Loader2, FolderOpen } from 'lucide-react'
import { ChangeItem } from './ChangeItem'
import { useFlowChanges, useSyncFlowChanges } from '@/hooks/useFlowChanges'

export function ChangeList() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const { data: changes, isLoading, error, isFetched } = useFlowChanges()
  const syncMutation = useSyncFlowChanges()
  const hasAutoSynced = useRef(false)

  // 최초 로드 시 데이터가 비어있으면 자동 동기화
  useEffect(() => {
    if (isFetched && !isLoading && changes?.length === 0 && !hasAutoSynced.current) {
      hasAutoSynced.current = true
      syncMutation.mutate()
    }
  }, [isFetched, isLoading, changes, syncMutation])

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (isLoading || syncMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
        <p>{syncMutation.isPending ? 'OpenSpec 동기화 중...' : '로딩 중...'}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        에러: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Changes</h2>
      </div>

      {/* Changes */}
      {!changes || changes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mb-4 opacity-50" />
          <p>등록된 Change가 없습니다</p>
          <p className="text-sm mt-1">openspec/changes 디렉토리에 proposal을 추가하세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {changes.map((change) => (
            <ChangeItem
              key={change.id}
              change={change}
              isExpanded={expandedIds.has(change.id)}
              onToggle={() => handleToggle(change.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
