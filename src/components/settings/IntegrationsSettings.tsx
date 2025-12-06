import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ServiceAccountList } from '@/components/integrations/ServiceAccountList'
import { Key, Link2 } from 'lucide-react'

export function IntegrationsSettings() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">외부 서비스 연동</h3>
        <p className="text-sm text-muted-foreground">
          외부 서비스 계정과 프로젝트 연동을 관리합니다.
        </p>
      </div>

      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="accounts" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            서비스 계정
          </TabsTrigger>
          <TabsTrigger value="mappings" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            프로젝트 매핑
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4">
          <ServiceAccountList />
        </TabsContent>

        <TabsContent value="mappings" className="space-y-4">
          <ProjectMappingList />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ProjectMappingList() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        각 프로젝트에 연결된 서비스 계정을 확인하고 변경합니다.
      </p>
      <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/30">
        <p>사이드바에서 프로젝트를 선택하고 Settings 메뉴를 클릭하면</p>
        <p className="mt-1">프로젝트별 Integration 설정을 관리할 수 있습니다.</p>
      </div>
    </div>
  )
}
