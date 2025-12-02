import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ServiceAccountList } from './ServiceAccountList';
import { Key, Link2 } from 'lucide-react';

export function IntegrationsSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Integrations</h2>
        <p className="text-muted-foreground">
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
  );
}

// 프로젝트 매핑 목록 컴포넌트
function ProjectMappingList() {
  // TODO: 프로젝트 목록과 각 프로젝트에 연결된 서비스 표시
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">프로젝트 매핑</h3>
        <p className="text-sm text-muted-foreground">
          각 프로젝트에 연결된 서비스 계정을 확인하고 변경합니다.
        </p>
      </div>
      <div className="text-center py-8 text-muted-foreground">
        프로젝트를 선택하면 해당 프로젝트의 Integrations 탭에서 서비스를 연결할 수 있습니다.
      </div>
    </div>
  );
}
