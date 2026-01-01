import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FolderOpen, Key, Terminal, Server } from 'lucide-react'
import { ProjectsSettings } from './ProjectsSettings'
import { IntegrationsSettings } from './IntegrationsSettings'
import { CLISettings } from './CLISettings'
import { RemoteServerList } from '@/components/remote'

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('projects')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          프로젝트 및 서비스 계정을 관리합니다.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="projects" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="cli" className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            AI CLI
          </TabsTrigger>
          <TabsTrigger value="accounts" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="remote" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Remote
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="space-y-4">
          <ProjectsSettings />
        </TabsContent>

        <TabsContent value="cli" className="space-y-4">
          <CLISettings />
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          <IntegrationsSettings />
        </TabsContent>

        <TabsContent value="remote" className="space-y-4">
          <RemoteServerList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
