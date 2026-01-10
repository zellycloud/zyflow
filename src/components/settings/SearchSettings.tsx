/**
 * Search Settings Component
 *
 * LEANN 인덱스 상태 및 관리 UI
 */

import { useState } from 'react'
import { useLeannIndexStatus, useIndexProject } from '@/hooks/useLeannStatus'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  RefreshCw,
  Database,
  Check,
  X,
  AlertTriangle,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function SearchSettings() {
  const { data, isLoading, refetch } = useLeannIndexStatus()
  const indexProject = useIndexProject()
  const [indexingProjectId, setIndexingProjectId] = useState<string | null>(null)
  const [isIndexingAll, setIsIndexingAll] = useState(false)

  const handleIndex = async (project: {
    projectId: string
    projectName: string
    projectPath: string
  }) => {
    setIndexingProjectId(project.projectId)
    try {
      await indexProject.mutateAsync({
        projectPath: project.projectPath,
        projectName: project.projectName,
      })
      toast.success(`${project.projectName} 인덱싱이 완료되었습니다`)
      // 상태 갱신
      refetch()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '인덱싱에 실패했습니다'
      )
    } finally {
      setIndexingProjectId(null)
    }
  }

  const handleIndexAll = async () => {
    if (!data?.projects || isIndexingAll) return

    const unindexedProjects = data.projects.filter((p) => !p.indexed)
    if (unindexedProjects.length === 0) {
      toast.info('모든 프로젝트가 이미 인덱싱되어 있습니다')
      return
    }

    setIsIndexingAll(true)
    let successCount = 0
    let failCount = 0

    for (const project of unindexedProjects) {
      setIndexingProjectId(project.projectId)
      try {
        await indexProject.mutateAsync({
          projectPath: project.projectPath,
          projectName: project.projectName,
        })
        successCount++
      } catch {
        failCount++
      }
    }

    setIndexingProjectId(null)
    setIsIndexingAll(false)
    refetch()

    if (failCount === 0) {
      toast.success(`${successCount}개 프로젝트 인덱싱이 완료되었습니다`)
    } else {
      toast.warning(`${successCount}개 성공, ${failCount}개 실패`)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const indexedCount = data?.projects.filter((p) => p.indexed).length ?? 0
  const totalCount = data?.projects.length ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">시맨틱 검색 인덱스</h3>
          <p className="text-sm text-muted-foreground">
            LEANN을 사용한 AI 검색 인덱스 상태를 관리합니다.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* Summary Card */}
      <div className="p-4 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-lg">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium">
              {indexedCount} / {totalCount} 프로젝트 인덱싱됨
            </p>
            <p className="text-sm text-muted-foreground">
              {indexedCount === 0
                ? 'AI 시맨틱 검색을 사용하려면 프로젝트를 인덱싱하세요.'
                : `${indexedCount}개 프로젝트에서 AI 검색을 사용할 수 있습니다.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {indexedCount > 0 && (
              <Badge variant="secondary" className="text-green-600">
                <Database className="h-3 w-3 mr-1" />
                활성
              </Badge>
            )}
            {indexedCount < totalCount && data?.leannInstalled && (
              <Button
                size="sm"
                onClick={handleIndexAll}
                disabled={isIndexingAll || !!indexingProjectId}
              >
                {isIndexingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    전체 인덱싱 중...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    전체 인덱싱
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* LEANN Not Installed Warning */}
      {data && !data.leannInstalled && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                LEANN이 설치되지 않았습니다
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                AI 시맨틱 검색을 사용하려면 LEANN을 설치하세요:
              </p>
              <code className="block mt-2 text-xs bg-yellow-100 dark:bg-yellow-900 p-2 rounded font-mono">
                uv tool install leann-core --with leann
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Project List */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground mb-3">
          프로젝트 목록
        </h4>
        {data?.projects.map((project) => (
          <div
            key={project.projectId}
            className={cn(
              'p-4 rounded-lg border transition-colors',
              project.indexed
                ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                : 'bg-background hover:bg-muted/30'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {project.indexed ? (
                  <div className="p-1.5 bg-green-100 dark:bg-green-900 rounded">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <div className="p-1.5 bg-muted rounded">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{project.projectName}</p>
                    {project.pathExists === false && (
                      <Badge variant="outline" className="text-xs text-yellow-600">
                        경로 없음
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {project.projectPath}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {project.indexed && project.indexSize && (
                  <Badge variant="outline" className="text-xs">
                    {project.indexSize}
                  </Badge>
                )}
                <Button
                  variant={project.indexed ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => handleIndex(project)}
                  disabled={
                    indexingProjectId === project.projectId ||
                    !data?.leannInstalled ||
                    project.pathExists === false
                  }
                >
                  {indexingProjectId === project.projectId ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      인덱싱 중...
                    </>
                  ) : project.indexed ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      재인덱싱
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4 mr-2" />
                      인덱싱
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground border-t pt-4">
        <p>
          인덱싱하면 해당 프로젝트의 <code className="bg-muted px-1 rounded">docs/</code>,{' '}
          <code className="bg-muted px-1 rounded">openspec/</code>,{' '}
          <code className="bg-muted px-1 rounded">src/</code> 폴더의 문서와 코드가
          AI 검색에 포함됩니다.
        </p>
      </div>
    </div>
  )
}
