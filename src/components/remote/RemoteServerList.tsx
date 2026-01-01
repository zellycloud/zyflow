/**
 * Remote Server List
 * 원격 서버 목록 및 관리 컴포넌트
 */

import { useState } from 'react'
import {
  useRemoteServers,
  useAddRemoteServer,
  useRemoveRemoteServer,
  useTestConnection,
  useDisconnect,
  useSSHConfigHosts,
  useAddServerFromSSHConfig,
} from '@/hooks/useRemoteServers'
import { RemoteServerDialog } from './RemoteServerDialog'
import { RemoteFileBrowser } from './RemoteFileBrowser'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Server,
  Plus,
  MoreVertical,
  Trash2,
  Plug,
  PlugZap,
  FolderOpen,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileKey,
  ChevronDown,
} from 'lucide-react'
import type { RemoteServer, AddRemoteServerRequest, ConnectionStatus } from '@/types'
import { toast } from 'sonner'

function ConnectionStatusBadge({ status }: { status?: ConnectionStatus }) {
  switch (status) {
    case 'connected':
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="h-3 w-3" />
          연결됨
        </span>
      )
    case 'connecting':
      return (
        <span className="flex items-center gap-1 text-xs text-yellow-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          연결 중...
        </span>
      )
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <XCircle className="h-3 w-3" />
          오류
        </span>
      )
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          연결 안됨
        </span>
      )
  }
}

export function RemoteServerList() {
  const { data: servers = [], isLoading } = useRemoteServers()
  const { data: sshConfigHosts = [] } = useSSHConfigHosts()
  const addServer = useAddRemoteServer()
  const addFromSSHConfig = useAddServerFromSSHConfig()
  const removeServer = useRemoveRemoteServer()
  const testConnection = useTestConnection()
  const disconnect = useDisconnect()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [serverToDelete, setServerToDelete] = useState<RemoteServer | null>(null)
  const [browsing, setBrowsing] = useState<{ server: RemoteServer } | null>(null)
  const [testingServer, setTestingServer] = useState<string | null>(null)

  // 이미 등록된 서버 제외
  const availableSSHHosts = sshConfigHosts.filter(
    (host) => !servers.some((s) => s.host === host.hostName && s.auth.username === host.user)
  )

  const handleAddFromSSHConfig = async (hostAlias: string) => {
    try {
      await addFromSSHConfig.mutateAsync(hostAlias)
      toast.success(`${hostAlias} 서버가 추가되었습니다`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '서버 추가 실패')
    }
  }

  const handleAddServer = async (data: AddRemoteServerRequest) => {
    try {
      await addServer.mutateAsync(data)
      setShowAddDialog(false)
      toast.success('서버가 추가되었습니다')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '서버 추가 실패')
    }
  }

  const handleTestConnection = async (server: RemoteServer) => {
    setTestingServer(server.id)
    try {
      const result = await testConnection.mutateAsync(server.id)
      if (result.success) {
        toast.success(`연결 성공: ${result.serverInfo?.hostname} (${result.serverInfo?.os})`)
      } else {
        toast.error(`연결 실패: ${result.message}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '연결 테스트 실패')
    } finally {
      setTestingServer(null)
    }
  }

  const handleDisconnect = async (serverId: string) => {
    try {
      await disconnect.mutateAsync(serverId)
      toast.success('연결이 종료되었습니다')
    } catch {
      toast.error('연결 종료 실패')
    }
  }

  const handleDeleteServer = async () => {
    if (!serverToDelete) return
    try {
      await removeServer.mutateAsync(serverToDelete.id)
      setServerToDelete(null)
      toast.success('서버가 삭제되었습니다')
    } catch {
      toast.error('서버 삭제 실패')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">원격 서버</h2>
          <p className="text-sm text-muted-foreground">
            SSH로 연결할 개발 서버를 관리합니다
          </p>
        </div>
        <div className="flex gap-2">
          {/* SSH Config에서 가져오기 */}
          {availableSSHHosts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <FileKey className="mr-2 h-4 w-4" />
                  SSH Config
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  ~/.ssh/config 호스트
                </div>
                <DropdownMenuSeparator />
                {availableSSHHosts.map((host) => (
                  <DropdownMenuItem
                    key={host.name}
                    onClick={() => handleAddFromSSHConfig(host.name)}
                    disabled={addFromSSHConfig.isPending}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{host.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {host.user}@{host.hostName}:{host.port}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            서버 추가
          </Button>
        </div>
      </div>

      {/* 서버 목록 */}
      {servers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">등록된 서버가 없습니다</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              원격 서버를 추가하여 프로젝트를 관리하세요
            </p>
            <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              첫 번째 서버 추가
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <Card key={server.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">{server.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleTestConnection(server)}
                        disabled={testingServer === server.id}
                      >
                        {testingServer === server.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plug className="mr-2 h-4 w-4" />
                        )}
                        연결 테스트
                      </DropdownMenuItem>
                      {server.status === 'connected' && (
                        <DropdownMenuItem onClick={() => handleDisconnect(server.id)}>
                          <PlugZap className="mr-2 h-4 w-4" />
                          연결 종료
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setBrowsing({ server })}>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        파일 탐색
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setServerToDelete(server)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">호스트</span>
                    <span className="font-mono">
                      {server.auth.username}@{server.host}:{server.port}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">인증</span>
                    <span>
                      {server.auth.type === 'privateKey'
                        ? 'SSH 키'
                        : server.auth.type === 'password'
                          ? '비밀번호'
                          : 'SSH Agent'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">상태</span>
                    <ConnectionStatusBadge status={server.status} />
                  </div>
                  {server.lastConnectedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">마지막 연결</span>
                      <span className="text-xs">
                        {new Date(server.lastConnectedAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 서버 추가 다이얼로그 */}
      <RemoteServerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSubmit={handleAddServer}
        isLoading={addServer.isPending}
      />

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog
        open={!!serverToDelete}
        onOpenChange={(open) => !open && setServerToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>서버를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {serverToDelete?.name} 서버가 목록에서 제거됩니다.
              이 서버와 연결된 원격 프로젝트도 함께 제거될 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteServer}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 파일 탐색기 다이얼로그 */}
      {browsing && (
        <RemoteFileBrowser
          server={browsing.server}
          open={true}
          onOpenChange={(open) => !open && setBrowsing(null)}
        />
      )}
    </div>
  )
}
