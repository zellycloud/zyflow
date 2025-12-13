/**
 * Quarantine Tab
 *
 * 격리된 파일 관리 탭
 */

import { useState } from 'react'
import {
  Archive,
  RotateCcw,
  Trash2,
  Calendar,
  FileCode,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useQuarantineList,
  useQuarantineStats,
  useRestoreQuarantine,
  useDeleteQuarantine,
} from '@/hooks/usePostTask'

interface QuarantineTabProps {
  projectPath: string
}

export function QuarantineTab({ projectPath }: QuarantineTabProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: items, isLoading: isItemsLoading } = useQuarantineList(projectPath, {
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  const { data: stats, isLoading: isStatsLoading } = useQuarantineStats(projectPath)

  const restoreMutation = useRestoreQuarantine()
  const deleteMutation = useDeleteQuarantine()

  const handleRestore = async (itemId: string) => {
    try {
      await restoreMutation.mutateAsync({ projectPath, itemId })
      toast.success('파일이 복구되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '복구 실패')
    }
  }

  const handleDelete = async (itemId: string) => {
    try {
      await deleteMutation.mutateAsync({ projectPath, itemId })
      toast.success('파일이 삭제되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제 실패')
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'quarantined':
        return <Badge variant="secondary">격리됨</Badge>
      case 'pending':
        return <Badge variant="outline">대기 중</Badge>
      case 'expired':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            만료됨
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const isLoading = isItemsLoading || isStatsLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>전체</CardDescription>
            <CardTitle className="text-3xl">{stats?.total ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>격리됨</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{stats?.quarantined ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>만료됨</CardDescription>
            <CardTitle className="text-3xl text-red-600">{stats?.expired ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>총 크기</CardDescription>
            <CardTitle className="text-3xl">{formatSize(stats?.totalSize ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* 파일 목록 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>격리된 파일</CardTitle>
              <CardDescription>Post-Task에 의해 격리된 파일 목록</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="상태 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="quarantined">격리됨</SelectItem>
                <SelectItem value="pending">대기 중</SelectItem>
                <SelectItem value="expired">만료됨</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {items?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                <Archive className="h-12 w-12 mb-4 opacity-50" />
                <p>격리된 파일이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items?.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'p-4 rounded-lg border',
                      item.status === 'expired' && 'border-red-500/20 bg-red-500/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-mono text-sm truncate">{item.originalPath}</span>
                          {getStatusBadge(item.status)}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(item.quarantinedAt)}
                          </span>
                          <span>작업: {item.taskType}</span>
                          <span>사유: {item.reason}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(item.id)}
                          disabled={restoreMutation.isPending}
                        >
                          {restoreMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                          <span className="ml-1">복구</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>파일 삭제</AlertDialogTitle>
                              <AlertDialogDescription>
                                이 파일을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(item.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                삭제
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
