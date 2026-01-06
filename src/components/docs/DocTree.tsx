import {
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DocItem } from '@/hooks/useDocs'

interface DocTreeItemProps {
  item: DocItem
  level: number
  selectedPath: string | null
  onSelect: (path: string) => void
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
}

export function DocTreeItem({
  item,
  level,
  selectedPath,
  onSelect,
  expandedFolders,
  onToggleFolder,
}: DocTreeItemProps) {
  const isFolder = item.type === 'folder'
  const isExpanded = expandedFolders.has(item.path)
  const isSelected = selectedPath === item.path

  return (
    <div>
      <button
        onClick={() => {
          if (isFolder) {
            onToggleFolder(item.path)
          } else {
            onSelect(item.path)
          }
        }}
        className={cn(
          'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left select-none',
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted text-foreground/80'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isExpanded ? (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/50" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
            )}
            {isExpanded ? (
              <FolderOpen className="size-4 shrink-0 text-blue-500/80" />
            ) : (
              <Folder className="size-4 shrink-0 text-blue-500/80" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <FileText
              className={cn(
                'size-4 shrink-0',
                isSelected ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </>
        )}
        <span className="truncate">{item.name}</span>
      </button>

      {isFolder && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <DocTreeItem
              key={child.id}
              item={child}
              level={level + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}
