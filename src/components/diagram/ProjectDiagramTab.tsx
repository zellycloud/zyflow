/**
 * Project Diagram Tab
 *
 * Dashboard tab for generating and viewing project architecture diagrams
 */

import { useState, useEffect } from 'react'
import { Loader2, RefreshCw, AlertCircle, GitFork, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { DiagramViewer } from './DiagramViewer'

interface ProjectDiagramTabProps {
  projectId: string
  projectPath: string
}

interface GenerateResult {
  mermaidCode: string
  projectPath: string
  generated: 'simple' | 'llm'
  message?: string
}

export function ProjectDiagramTab({ projectId, projectPath }: ProjectDiagramTabProps) {
  const [diagramCode, setDiagramCode] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generationType, setGenerationType] = useState<'simple' | 'llm' | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  // Reset diagram when project changes
  useEffect(() => {
    setDiagramCode(null)
    setError(null)
    setGenerationType(null)
    setInfoMessage(null)
  }, [projectId, projectPath])

  // Generate diagram using API
  const generateDiagram = async () => {
    setIsGenerating(true)
    setError(null)
    setInfoMessage(null)

    try {
      const response = await fetch('/api/diagram/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate diagram')
      }

      const json = await response.json()
      const result: GenerateResult = json.data

      setDiagramCode(result.mermaidCode)
      setGenerationType(result.generated)

      if (result.message) {
        setInfoMessage(result.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate diagram')
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle node click - open file in editor
  const handleNodeClick = (_nodeId: string, _path: string) => {
    // In VSCode extension context, this would open the file
    // TODO: Integrate with VSCode to open file
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitFork className="h-5 w-5" />
            아키텍처 다이어그램
          </CardTitle>
          <CardDescription>
            프로젝트 구조를 시각적으로 표현한 다이어그램입니다. AI가 코드베이스를
            분석하여 자동으로 생성합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              onClick={generateDiagram}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  다이어그램 생성
                </>
              )}
            </Button>

            {generationType && (
              <Badge variant={generationType === 'llm' ? 'default' : 'secondary'}>
                {generationType === 'llm' ? 'AI 생성' : '간단 분석'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Message */}
      {infoMessage && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{infoMessage}</AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Diagram Viewer */}
      {diagramCode ? (
        <DiagramViewer
          code={diagramCode}
          onNodeClick={handleNodeClick}
          className="h-[600px]"
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <GitFork className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-center">
              "다이어그램 생성" 버튼을 클릭하여
              <br />
              프로젝트 아키텍처를 시각화하세요
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
