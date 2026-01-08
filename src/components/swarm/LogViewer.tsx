/**
 * 실행 로그 뷰어 컴포넌트
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react'
import type { SwarmLogEntry, SwarmLogType } from '@/types'

interface LogViewerProps {
  logs: SwarmLogEntry[]
  onClear?: () => void
  maxHeight?: string
  autoScroll?: boolean
}

const LOG_TYPE_STYLES: Record<SwarmLogType, { bg: string; text: string; label: string }> = {
  info: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'INFO' },
  tool_use: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'TOOL' },
  tool_result: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'RESULT' },
  error: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'ERROR' },
  assistant: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'AI' },
  system: { bg: 'bg-gray-500/10', text: 'text-gray-400', label: 'SYS' },
  progress: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'PROG' },
}

export function LogViewer({
  logs,
  onClear,
  maxHeight = '400px',
  autoScroll = true,
}: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isAutoScroll, setIsAutoScroll] = useState(autoScroll)
  const [filter, setFilter] = useState<SwarmLogType | 'all'>('all')
  const [isExpanded, setIsExpanded] = useState(true)

  // 자동 스크롤
  useEffect(() => {
    if (isAutoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, isAutoScroll])

  // 필터링된 로그
  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(log => log.type === filter)

  // 타임스탬프 포맷
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className="border rounded-lg bg-zinc-950">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <span className="text-sm font-medium text-zinc-300">
            실행 로그
          </span>
          <Badge variant="secondary" className="text-xs">
            {filteredLogs.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* 필터 */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as SwarmLogType | 'all')}
            className="h-7 text-xs bg-zinc-800 border-zinc-700 rounded px-2"
          >
            <option value="all">모두</option>
            <option value="assistant">AI</option>
            <option value="tool_use">도구</option>
            <option value="error">에러</option>
            <option value="system">시스템</option>
          </select>

          {/* 자동 스크롤 토글 */}
          <Button
            variant={isAutoScroll ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setIsAutoScroll(!isAutoScroll)}
          >
            자동 스크롤
          </Button>

          {/* 클리어 */}
          {onClear && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onClear}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 로그 목록 */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="overflow-auto font-mono text-xs"
          style={{ maxHeight }}
        >
          {filteredLogs.length === 0 ? (
            <div className="p-4 text-center text-zinc-500">
              로그가 없습니다
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {filteredLogs.map((log, index) => {
                const style = LOG_TYPE_STYLES[log.type]
                return (
                  <div
                    key={index}
                    className={cn(
                      'px-3 py-2 hover:bg-zinc-900/50',
                      log.type === 'error' && 'bg-red-500/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {/* 타임스탬프 */}
                      <span className="text-zinc-500 shrink-0">
                        {formatTime(log.timestamp)}
                      </span>

                      {/* 타입 뱃지 */}
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] px-1.5 py-0 shrink-0',
                          style.bg,
                          style.text
                        )}
                      >
                        {style.label}
                      </Badge>

                      {/* 내용 */}
                      <span className="text-zinc-300 break-all whitespace-pre-wrap">
                        {typeof log.content === 'string'
                          ? log.content
                          : JSON.stringify(log.content, null, 2)}
                      </span>
                    </div>

                    {/* 메타데이터 (tool_use인 경우) */}
                    {log.metadata && log.type === 'tool_use' && (
                      <div className="mt-1 ml-20 text-zinc-500">
                        <code className="text-[10px]">
                          {JSON.stringify(log.metadata.input, null, 2).substring(0, 200)}
                          {JSON.stringify(log.metadata.input).length > 200 && '...'}
                        </code>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
