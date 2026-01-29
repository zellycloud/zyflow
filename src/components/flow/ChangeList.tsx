import { useState, useEffect, useRef } from 'react'
import { Loader2, FolderOpen } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ChangeItem } from './ChangeItem'
import { SpecItem } from './SpecItem'
import { useFlowItems, useSyncFlowItems } from '@/hooks/useFlowItems'
import { isMoaiSpec } from '@/types'
import type { FlowChange } from '@/types'

export function ChangeList() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const { data: items, isLoading, error, isFetched } = useFlowItems()
  const syncMutation = useSyncFlowItems()
  const hasAutoSynced = useRef(false)

  // 최초 로드 시 데이터가 비어있으면 자동 동기화
  useEffect(() => {
    if (isFetched && !isLoading && items?.length === 0 && !hasAutoSynced.current) {
      hasAutoSynced.current = true
      syncMutation.mutate()
    }
  }, [isFetched, isLoading, items, syncMutation])

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
        <p>{syncMutation.isPending ? '동기화 중...' : '로딩 중...'}</p>
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

      {/* Flow Items */}
      {!items || items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mb-4 opacity-50" />
          <p>등록된 항목이 없습니다</p>
          <p className="text-sm mt-1">.moai/specs 또는 openspec/changes에 항목을 추가하세요</p>
        </div>
      ) : (
        <TooltipProvider>
          <div className="space-y-2">
            {items.map((item) => (
              isMoaiSpec(item) ? (
                <SpecItem
                  key={item.id}
                  spec={item}
                  isExpanded={expandedIds.has(item.id)}
                  onToggle={() => handleToggle(item.id)}
                />
              ) : (
                <ChangeItem
                  key={item.id}
                  change={item as unknown as FlowChange}
                  isExpanded={expandedIds.has(item.id)}
                  onToggle={() => handleToggle(item.id)}
                />
              )
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
