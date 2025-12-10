import type { Stage } from '@/types'
import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  GitBranch,
  CheckSquare,
  Code2,
  TestTube2,
  GitCommit,
  BookOpen
} from 'lucide-react'

export const STAGES: Stage[] = ['spec', 'changes', 'task', 'code', 'test', 'commit', 'docs']

export const STAGE_CONFIG: Record<Stage, {
  label: string
  icon: LucideIcon
  color: string
}> = {
  spec: { label: 'Spec', icon: FileText, color: 'purple' },
  changes: { label: 'Changes', icon: GitBranch, color: 'indigo' },
  task: { label: 'Tasks', icon: CheckSquare, color: 'blue' },
  code: { label: 'Code', icon: Code2, color: 'green' },
  test: { label: 'Test', icon: TestTube2, color: 'orange' },
  commit: { label: 'Commit', icon: GitCommit, color: 'teal' },
  docs: { label: 'Docs', icon: BookOpen, color: 'gray' },
}
