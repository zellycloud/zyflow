import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, CheckSquare, FileCheck } from 'lucide-react'
import type { MoaiSpec } from '@/types/flow'

interface SpecDetailTabsProps {
  spec: MoaiSpec
}

export function SpecDetailTabs({ spec }: SpecDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<'spec' | 'plan' | 'acceptance'>('spec')

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as 'spec' | 'plan' | 'acceptance')}
      className="w-full"
    >
      {/* Tab List */}
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="spec" className="gap-2">
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Spec</span>
        </TabsTrigger>
        <TabsTrigger value="plan" className="gap-2">
          <CheckSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Plan</span>
        </TabsTrigger>
        <TabsTrigger value="acceptance" className="gap-2">
          <FileCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Acceptance</span>
        </TabsTrigger>
      </TabsList>

      {/* Spec Tab */}
      <TabsContent value="spec" className="space-y-4">
        {spec.spec.content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg border bg-card">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {spec.spec.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="p-4 rounded-lg border text-muted-foreground text-center text-sm">
            Spec 문서가 없습니다
          </div>
        )}

        {/* Requirements List */}
        {spec.spec.requirements && spec.spec.requirements.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">요구사항</h3>
            <div className="space-y-1">
              {spec.spec.requirements.map((req) => (
                <div
                  key={req.id}
                  className="flex items-start gap-2 p-2 rounded border bg-muted/30"
                >
                  <span className={`
                    px-1.5 py-0.5 rounded text-xs font-semibold shrink-0
                    ${req.priority === 'critical' ? 'bg-red-500 text-white' : ''}
                    ${req.priority === 'high' ? 'bg-orange-500 text-white' : ''}
                    ${req.priority === 'medium' ? 'bg-yellow-500 text-white' : ''}
                    ${req.priority === 'low' ? 'bg-blue-500 text-white' : ''}
                  `}>
                    {req.type === 'functional' ? 'F' : req.type === 'non-functional' ? 'NF' : 'C'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{req.title}</p>
                    <p className="text-xs text-muted-foreground">{req.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </TabsContent>

      {/* Plan Tab */}
      <TabsContent value="plan" className="space-y-4">
        {spec.plan.content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg border bg-card">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {spec.plan.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="p-4 rounded-lg border text-muted-foreground text-center text-sm">
            Plan 문서가 없습니다
          </div>
        )}

        {/* Tags/TAGs List */}
        {spec.plan.tags && spec.plan.tags.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">TAGs</h3>
            <div className="flex flex-wrap gap-2">
              {spec.plan.tags.map((tag) => (
                <div
                  key={tag.id}
                  className="px-2 py-1 rounded text-xs font-medium border"
                  style={{
                    backgroundColor: tag.color ? `${tag.color}20` : undefined,
                    borderColor: tag.color || undefined,
                    color: tag.color || undefined,
                  }}
                >
                  {tag.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plan Progress */}
        <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
          <p className="text-sm font-medium">Plan 진행률</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full overflow-hidden bg-muted/50 border border-muted">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                style={{ width: `${spec.plan.progress.percentage}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 w-12 text-right">
              {spec.plan.progress.completed}/{spec.plan.progress.total}
            </span>
          </div>
        </div>
      </TabsContent>

      {/* Acceptance Criteria Tab */}
      <TabsContent value="acceptance" className="space-y-4">
        {spec.acceptance.content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg border bg-card">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {spec.acceptance.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="p-4 rounded-lg border text-muted-foreground text-center text-sm">
            수용 기준 문서가 없습니다
          </div>
        )}

        {/* Acceptance Criteria List */}
        {spec.acceptance.criteria && spec.acceptance.criteria.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">수용 기준</h3>
            <div className="space-y-1">
              {spec.acceptance.criteria.map((criterion) => (
                <div
                  key={criterion.id}
                  className="flex items-start gap-2 p-2 rounded border bg-muted/30"
                >
                  <span className={`
                    px-1.5 py-0.5 rounded text-xs font-semibold shrink-0
                    ${criterion.priority === 'critical' ? 'bg-red-500 text-white' : ''}
                    ${criterion.priority === 'high' ? 'bg-orange-500 text-white' : ''}
                    ${criterion.priority === 'medium' ? 'bg-yellow-500 text-white' : ''}
                    ${criterion.priority === 'low' ? 'bg-blue-500 text-white' : ''}
                  `}>
                    {criterion.priority.charAt(0).toUpperCase()}
                  </span>
                  <p className="text-sm flex-1">{criterion.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
