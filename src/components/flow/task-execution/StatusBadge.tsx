/**
 * Status Badge Component
 *
 * 실행 상태 배지 표시
 */

import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'error' | 'failed' | 'stopped'

export interface StatusBadgeProps {
  status: ExecutionStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case 'running':
      return (
        <Badge variant="default" className="bg-blue-500">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          실행 중
        </Badge>
      )
    case 'completed':
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          완료
        </Badge>
      )
    case 'error':
    case 'failed':
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          오류
        </Badge>
      )
    default:
      return null
  }
}
