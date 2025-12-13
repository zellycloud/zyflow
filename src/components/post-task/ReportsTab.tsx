/**
 * Reports Tab
 *
 * Post-Task 리포트 조회 탭
 */

import { useState } from 'react'
import { FileText, Calendar, Check, X, ChevronRight, Loader2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { usePostTaskReports, usePostTaskReportDetail } from '@/hooks/usePostTask'

interface ReportsTabProps {
  projectPath: string
}

export function ReportsTab({ projectPath }: ReportsTabProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('all')

  const { data: reports, isLoading: isReportsLoading } = usePostTaskReports(projectPath, {
    limit: 50,
    taskType: taskTypeFilter === 'all' ? undefined : taskTypeFilter,
  })

  const { data: reportDetail, isLoading: isDetailLoading } = usePostTaskReportDetail(
    projectPath,
    selectedReportId
  )

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

  if (isReportsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 h-full">
      {/* 리포트 목록 */}
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>리포트 목록</CardTitle>
              <CardDescription>최근 실행 리포트</CardDescription>
            </div>
            <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="lint-fix">Lint Fix</SelectItem>
                <SelectItem value="type-check">Type Check</SelectItem>
                <SelectItem value="test-fix">Test Fix</SelectItem>
                <SelectItem value="test-gen">Test Gen</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0">
          <ScrollArea className="h-[500px]">
            {reports?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p>리포트가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-1 p-4">
                {reports?.map((report) => (
                  <Button
                    key={report.id}
                    variant="ghost"
                    className={cn(
                      'w-full justify-start h-auto py-3 px-4',
                      selectedReportId === report.id && 'bg-accent'
                    )}
                    onClick={() => setSelectedReportId(report.id)}
                  >
                    <div className="flex items-center gap-3 w-full">
                      {report.success ? (
                        <Check className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{report.taskType}</span>
                          <Badge variant="secondary" className="text-xs">
                            {report.tasksRun - report.tasksFailed}/{report.tasksRun}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(report.createdAt)}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 리포트 상세 */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>리포트 상세</CardTitle>
          <CardDescription>
            {selectedReportId ? `ID: ${selectedReportId}` : '리포트를 선택하세요'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          {!selectedReportId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-50" />
              <p>왼쪽에서 리포트를 선택하세요</p>
            </div>
          ) : isDetailLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : reportDetail ? (
            <ScrollArea className="h-[450px]">
              <div className="space-y-4">
                {/* 요약 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{reportDetail.tasksRun}</p>
                    <p className="text-xs text-muted-foreground">실행</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-green-500/10">
                    <p className="text-2xl font-bold text-green-600">
                      {reportDetail.tasksRun - reportDetail.tasksFailed}
                    </p>
                    <p className="text-xs text-muted-foreground">성공</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-500/10">
                    <p className="text-2xl font-bold text-red-600">{reportDetail.tasksFailed}</p>
                    <p className="text-xs text-muted-foreground">실패</p>
                  </div>
                </div>

                {/* 결과 목록 */}
                <div className="space-y-2">
                  {reportDetail.results?.map((item, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'p-3 rounded-lg border',
                        item.success
                          ? 'border-green-500/20 bg-green-500/5'
                          : 'border-red-500/20 bg-red-500/5'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {item.success ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-medium">{item.task}</span>
                      </div>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>발견: {item.issuesFound}</span>
                        <span>수정: {item.issuesFixed}</span>
                      </div>
                      {item.details != null && (
                        <pre className="mt-2 p-2 rounded bg-muted text-xs overflow-x-auto">
                          {typeof item.details === 'string'
                            ? item.details
                            : JSON.stringify(item.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p>리포트를 찾을 수 없습니다</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
