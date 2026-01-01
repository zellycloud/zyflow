/**
 * Remote Server Dialog
 * 원격 서버 추가/수정 다이얼로그
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Server, Key, Lock } from 'lucide-react'
import type { RemoteAuthType, AddRemoteServerRequest } from '@/types'

interface RemoteServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: AddRemoteServerRequest) => Promise<void>
  isLoading?: boolean
  initialData?: Partial<AddRemoteServerRequest>
  mode?: 'add' | 'edit'
}

export function RemoteServerDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  initialData,
  mode = 'add',
}: RemoteServerDialogProps) {
  const [name, setName] = useState(initialData?.name || '')
  const [host, setHost] = useState(initialData?.host || '')
  const [port, setPort] = useState(initialData?.port?.toString() || '22')
  const [authType, setAuthType] = useState<RemoteAuthType>(
    initialData?.auth?.type || 'privateKey'
  )
  const [username, setUsername] = useState(initialData?.auth?.username || '')
  const [password, setPassword] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState(
    initialData?.auth?.privateKeyPath || '~/.ssh/id_rsa'
  )
  const [passphrase, setPassphrase] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const request: AddRemoteServerRequest = {
      name,
      host,
      port: parseInt(port, 10) || 22,
      auth: {
        type: authType,
        username,
        ...(authType === 'password' && { password }),
        ...(authType === 'privateKey' && {
          privateKeyPath,
          ...(passphrase && { passphrase }),
        }),
      },
    }

    await onSubmit(request)
  }

  const isValid = name && host && username && (
    authType === 'agent' ||
    (authType === 'password' && password) ||
    (authType === 'privateKey' && privateKeyPath)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {mode === 'add' ? '원격 서버 추가' : '서버 정보 수정'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 서버 이름 */}
          <div className="space-y-2">
            <Label htmlFor="name">서버 이름</Label>
            <Input
              id="name"
              placeholder="Production Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* 호스트 & 포트 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="host">호스트</Label>
              <Input
                id="host"
                placeholder="192.168.1.100 또는 server.example.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">포트</Label>
              <Input
                id="port"
                type="number"
                placeholder="22"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>

          {/* 인증 방식 */}
          <div className="space-y-2">
            <Label>인증 방식</Label>
            <Select
              value={authType}
              onValueChange={(v) => setAuthType(v as RemoteAuthType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="privateKey">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    SSH 키
                  </div>
                </SelectItem>
                <SelectItem value="password">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    비밀번호
                  </div>
                </SelectItem>
                <SelectItem value="agent">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    SSH Agent
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 사용자명 */}
          <div className="space-y-2">
            <Label htmlFor="username">사용자명</Label>
            <Input
              id="username"
              placeholder="root"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {/* 비밀번호 (password auth) */}
          {authType === 'password' && (
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {/* SSH 키 경로 (privateKey auth) */}
          {authType === 'privateKey' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="privateKeyPath">SSH 키 경로</Label>
                <Input
                  id="privateKeyPath"
                  placeholder="~/.ssh/id_rsa"
                  value={privateKeyPath}
                  onChange={(e) => setPrivateKeyPath(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passphrase">패스프레이즈 (선택)</Label>
                <Input
                  id="passphrase"
                  type="password"
                  placeholder="키에 패스프레이즈가 있는 경우"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              취소
            </Button>
            <Button type="submit" disabled={!isValid || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'add' ? '추가' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
