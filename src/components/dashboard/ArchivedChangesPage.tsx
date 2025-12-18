import { useState } from 'react'
import { ArchivedChangeList } from './ArchivedChangeList'
import { ArchivedChangeViewer } from './ArchivedChangeViewer'

interface ArchivedChangesPageProps {
  projectId: string
  initialArchivedChangeId?: string
}

export function ArchivedChangesPage({ initialArchivedChangeId }: ArchivedChangesPageProps) {
  const [selectedArchivedId, setSelectedArchivedId] = useState<string | null>(
    initialArchivedChangeId ?? null
  )

  return (
    <div className="flex h-full gap-4">
      {/* Archived List - 왼쪽 패널 (넓게) */}
      <div className="w-[400px] shrink-0 border rounded-lg overflow-hidden">
        <ArchivedChangeList
          selectedId={selectedArchivedId}
          onSelect={setSelectedArchivedId}
        />
      </div>

      {/* Archived Detail Viewer - 오른쪽 메인 */}
      <div className="flex-1 border rounded-lg overflow-hidden">
        <ArchivedChangeViewer changeId={selectedArchivedId} />
      </div>
    </div>
  )
}
