import { GitBranch, Book, ListTodo } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'

type View = 'changes' | 'specs'

interface HeaderProps {
  currentView: View
  onViewChange: (view: View) => void
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

      <ThemeToggle />
    </header>
  )
}
