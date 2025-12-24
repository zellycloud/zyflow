import { GitBranch, Book, ListTodo, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@/config/api'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type View = 'changes' | 'specs'

interface HeaderProps {
  currentView: View
  onViewChange: (view: View) => void
}

function ApiStatusIndicator() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      const res = await fetch(API_ENDPOINTS.health)
      if (!res.ok) throw new Error('API server not responding')
      return res.json()
    },
    refetchInterval: 10000, // 10초마다 체크
    retry: false,
  })

  const status = isLoading ? 'checking' : isError ? 'offline' : 'online'
  const uptime = data?.data?.uptime
    ? `${Math.floor(data.data.uptime / 60)}m ${Math.floor(data.data.uptime % 60)}s`
    : null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle
              className={cn(
                'h-2 w-2 fill-current',
                status === 'online' && 'text-green-500',
                status === 'offline' && 'text-red-500',
                status === 'checking' && 'text-yellow-500 animate-pulse'
              )}
            />
            <span className="hidden sm:inline">API</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs">
            <div className="font-medium">
              API Server: {status === 'online' ? 'Connected' : status === 'offline' ? 'Disconnected' : 'Checking...'}
            </div>
            {uptime && <div className="text-muted-foreground">Uptime: {uptime}</div>}
            {isError && (
              <div className="text-red-400 mt-1">
                Run `npm run dev:all` to start the API server
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function Header({ currentView, onViewChange }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">ZyFlow</h1>
        </div>

        {/* View Tabs */}
        <nav className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewChange('changes')}
            className={cn(
              'gap-2',
              currentView === 'changes' && 'bg-accent'
            )}
          >
            <ListTodo className="h-4 w-4" />
            Changes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewChange('specs')}
            className={cn(
              'gap-2',
              currentView === 'specs' && 'bg-accent'
            )}
          >
            <Book className="h-4 w-4" />
            Specs
          </Button>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <ApiStatusIndicator />
        <ThemeToggle />
      </div>
    </header>
  )
}
