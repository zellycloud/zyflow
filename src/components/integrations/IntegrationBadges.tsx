import {
  Globe,
  HardDrive,
  Github,
  Database,
  Cloud,
  AlertCircle,
  Settings,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SettingsSource } from '@/types'

// Source 배지 컴포넌트 - 설정 소스 표시 (local/global)
export function SourceBadge({ source }: { source: SettingsSource }) {
  if (source === 'local') {
    return (
      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
        <HardDrive className="h-3 w-3 mr-1" />
        Local
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-xs bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20">
      <Globe className="h-3 w-3 mr-1" />
      Global
    </Badge>
  )
}

// 서비스 아이콘 컴포넌트
export function ServiceIcon({ type, className }: { type: string; className?: string }) {
  const iconClass = className || 'h-4 w-4'

  switch (type) {
    case 'github':
      return <Github className={iconClass} />
    case 'supabase':
      return <Database className={iconClass} />
    case 'vercel':
      return <Cloud className={iconClass} />
    case 'sentry':
      return <AlertCircle className={iconClass} />
    default:
      return <Settings className={iconClass} />
  }
}

// 로컬 설정 상태 배지 (한국어)
export function LocalSettingsStatusBadge({
  hasLocal,
  hasGlobal
}: {
  hasLocal: boolean
  hasGlobal: boolean
}) {
  if (hasLocal) {
    return (
      <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
        <HardDrive className="h-3 w-3" />
        로컬
      </span>
    )
  }

  if (hasGlobal) {
    return (
      <span className="text-xs bg-gray-500/10 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
        <Globe className="h-3 w-3" />
        전역
      </span>
    )
  }

  return null
}

// 연결 상태 배지
export function ConnectionStatusBadge({ connected }: { connected: boolean }) {
  return (
    <Badge
      variant={connected ? 'default' : 'secondary'}
      className={connected
        ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
        : ''
      }
    >
      {connected ? 'Connected' : 'Not Connected'}
    </Badge>
  )
}
