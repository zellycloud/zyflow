import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { PipelineBar } from './PipelineBar'
import { STAGES, STAGE_CONFIG } from '@/constants/stages'
import type { Stage, StageInfo } from '@/types'

describe('PipelineBar', () => {
  const defaultProps = {
    currentStage: 'task' as Stage,
    activeTab: 'task' as Stage,
    onTabChange: vi.fn(),
  }

  it('should render all 7 stages', () => {
    render(<PipelineBar {...defaultProps} />)

    STAGES.forEach((stage) => {
      expect(screen.getByText(STAGE_CONFIG[stage].label)).toBeInTheDocument()
    })
  })

  it('should have correct aria attributes for tabs', () => {
    render(<PipelineBar {...defaultProps} />)

    const tabList = screen.getByRole('tablist')
    expect(tabList).toHaveAttribute('aria-label', 'Development pipeline stages')

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(7)
  })

  it('should mark active tab as selected', () => {
    render(<PipelineBar {...defaultProps} activeTab="code" />)

    const codeTab = screen.getByRole('tab', { name: /code/i })
    expect(codeTab).toHaveAttribute('aria-selected', 'true')

    const taskTab = screen.getByRole('tab', { name: /tasks/i })
    expect(taskTab).toHaveAttribute('aria-selected', 'false')
  })

  it('should call onTabChange when clicking a stage', () => {
    const onTabChange = vi.fn()
    render(<PipelineBar {...defaultProps} onTabChange={onTabChange} />)

    const codeTab = screen.getByRole('tab', { name: /code/i })
    fireEvent.click(codeTab)

    expect(onTabChange).toHaveBeenCalledWith('code')
  })

  it('should display progress count badge when stages have tasks', () => {
    const stages: Record<Stage, StageInfo> = {
      spec: { total: 0, completed: 0, tasks: [] },
      changes: { total: 0, completed: 0, tasks: [] },
      task: { total: 5, completed: 3, tasks: [] },
      code: { total: 0, completed: 0, tasks: [] },
      test: { total: 2, completed: 2, tasks: [] },
      commit: { total: 0, completed: 0, tasks: [] },
      docs: { total: 0, completed: 0, tasks: [] },
    }

    render(<PipelineBar {...defaultProps} stages={stages} />)

    expect(screen.getByText('3/5')).toBeInTheDocument()
    expect(screen.getByText('2/2')).toBeInTheDocument()
  })

  it('should not display badge when stage has no tasks', () => {
    const stages: Record<Stage, StageInfo> = {
      spec: { total: 0, completed: 0, tasks: [] },
      changes: { total: 0, completed: 0, tasks: [] },
      task: { total: 0, completed: 0, tasks: [] },
      code: { total: 0, completed: 0, tasks: [] },
      test: { total: 0, completed: 0, tasks: [] },
      commit: { total: 0, completed: 0, tasks: [] },
      docs: { total: 0, completed: 0, tasks: [] },
    }

    render(<PipelineBar {...defaultProps} stages={stages} />)

    // No progress badges should be displayed for empty stages
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument()
  })
})
