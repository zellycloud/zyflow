/**
 * Project Diagram Tab
 *
 * Dashboard tab for generating and viewing project architecture diagrams
 */

import { useState } from 'react'
import { Loader2, RefreshCw, AlertCircle, GitFork } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DiagramViewer } from './DiagramViewer'

interface ProjectDiagramTabProps {
  projectId: string // Reserved for future use (e.g., caching diagrams per project)
  projectPath: string
}

interface DiagramContext {
  fileTree: string
  readme: string | null
  projectPath: string
}

export function ProjectDiagramTab({ projectId: _projectId, projectPath }: ProjectDiagramTabProps) {
  const [diagramCode, setDiagramCode] = useState<string | null>(null)
  const [context, setContext] = useState<DiagramContext | null>(null)
  const [isLoadingContext, setIsLoadingContext] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch project context (file tree, readme)
  const fetchContext = async () => {
    setIsLoadingContext(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/diagram/context?projectPath=${encodeURIComponent(projectPath)}`
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch project context')
      }

      const data = await response.json()
      setContext(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoadingContext(false)
    }
  }

  // Generate diagram using MCP tool (via API)
  const generateDiagram = async () => {
    if (!context) {
      await fetchContext()
    }

    setIsGenerating(true)
    setError(null)

    try {
      // For now, show a placeholder message since actual generation
      // requires LLM API integration through MCP
      // In production, this would call the diagram_generate MCP tool

      // Create a sample diagram based on common project structure
      const sampleDiagram = `flowchart TD
    subgraph Frontend["Frontend (React)"]
        App[App.tsx]
        Components[Components]
        Hooks[Hooks]
        Pages[Pages]
    end

    subgraph Backend["Backend (Express)"]
        Server[server/app.ts]
        API[API Routes]
        DB[(Database)]
    end

    subgraph Tools["Development Tools"]
        MCP[MCP Server]
        OpenSpec[OpenSpec]
    end

    App --> Components
    App --> Hooks
    Components --> Pages
    Pages --> API
    API --> Server
    Server --> DB
    MCP --> OpenSpec
    OpenSpec --> Server

    click App "src/App.tsx"
    click Server "server/app.ts"
    click MCP "mcp-server/index.ts"

    style Frontend fill:#e1f5fe
    style Backend fill:#fff3e0
    style Tools fill:#f3e5f5`

      setDiagramCode(sampleDiagram)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate diagram')
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle node click - open file in editor
  const handleNodeClick = (nodeId: string, path: string) => {
    // In VSCode extension context, this would open the file
    console.log('Node clicked:', nodeId, path)
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
              disabled={isGenerating || isLoadingContext}
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

            {context && (
              <span className="text-sm text-muted-foreground">
                {context.fileTree.split('\n').length} 파일/폴더 분석됨
              </span>
            )}
          </div>
        </CardContent>
      </Card>

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
