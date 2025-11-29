import type { Stage } from '@/types'

export const STAGES: Stage[] = ['spec', 'changes', 'task', 'code', 'test', 'commit', 'docs']

export const STAGE_CONFIG: Record<Stage, { label: string; icon: string; color: string }> = {
  spec: { label: 'Spec', icon: '📋', color: 'purple' },
  changes: { label: 'Changes', icon: '📝', color: 'indigo' },
  task: { label: 'Tasks', icon: '✅', color: 'blue' },
  code: { label: 'Code', icon: '💻', color: 'green' },
  test: { label: 'Test', icon: '🧪', color: 'orange' },
  commit: { label: 'Commit', icon: '📦', color: 'teal' },
  docs: { label: 'Docs', icon: '📄', color: 'gray' },
}
