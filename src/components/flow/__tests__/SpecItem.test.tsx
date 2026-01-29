import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpecItem } from '../SpecItem'
import type { MoaiSpec } from '@/types/flow'

describe('SpecItem', () => {
  const mockSpec: MoaiSpec = {
    type: 'spec',
    id: 'SPEC-001',
    specId: 'SPEC-001',
    title: 'User Authentication System',
    status: 'active',
    progress: {
      completed: 5,
      total: 10,
      percentage: 50,
    },
    spec: {
      content: '# Specification\nThis is a test specification.',
      requirements: [
        {
          id: 'req-1',
          title: 'Login Form',
          description: 'User must be able to login',
          type: 'functional',
          priority: 'high',
        },
      ],
    },
    plan: {
      content: '# Plan\nImplementation plan goes here.',
      tags: [
        {
          id: 'TAG-001',
          name: 'Backend Setup',
          color: '#3b82f6',
        },
      ],
      progress: {
        completed: 3,
        total: 7,
        percentage: 42.86,
      },
    },
    acceptance: {
      content: '# Acceptance Criteria\nCriteria goes here.',
      criteria: [
        {
          id: 'ac-1',
          description: 'Login should succeed with valid credentials',
          priority: 'critical',
        },
      ],
    },
    createdAt: '2026-01-29T10:00:00Z',
    updatedAt: '2026-01-29T15:00:00Z',
  }

  it('renders collapsed state with title and metadata', () => {
    render(
      <SpecItem
        spec={mockSpec}
        isExpanded={false}
        onToggle={() => {}}
      />
    )

    expect(screen.getByText('User Authentication System')).toBeInTheDocument()
    expect(screen.getByText(/SPEC/)).toBeInTheDocument()
    expect(screen.getByText(/5\/10/)).toBeInTheDocument()
  })

  it('renders status badge', () => {
    render(
      <SpecItem
        spec={mockSpec}
        isExpanded={false}
        onToggle={() => {}}
      />
    )

    expect(screen.getByText('진행 중')).toBeInTheDocument()
  })

  it('expands and shows detailed content', async () => {
    const { rerender } = render(
      <SpecItem
        spec={mockSpec}
        isExpanded={false}
        onToggle={() => {}}
      />
    )

    // Initially collapsed
    expect(screen.queryByText(/TAGs 진행률/)).not.toBeInTheDocument()

    // Re-render as expanded
    rerender(
      <SpecItem
        spec={mockSpec}
        isExpanded={true}
        onToggle={() => {}}
      />
    )

    // Should show progress bar label
    expect(screen.getByText(/TAGs 진행률/)).toBeInTheDocument()
  })

  it('calls onToggle when header is clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()

    render(
      <SpecItem
        spec={mockSpec}
        isExpanded={false}
        onToggle={onToggle}
      />
    )

    // Click the toggle button
    const toggleButton = screen.getByRole('button')
    await user.click(toggleButton)

    expect(onToggle).toHaveBeenCalled()
  })

  it('renders dates in metadata footer when expanded', () => {
    render(
      <SpecItem
        spec={mockSpec}
        isExpanded={true}
        onToggle={() => {}}
      />
    )

    // Should show date strings
    const footerText = screen.getByText(/생성:/)
    expect(footerText).toBeInTheDocument()
  })

  it('shows archived date when spec is archived', () => {
    const archivedSpec: MoaiSpec = {
      ...mockSpec,
      status: 'archived',
      archivedAt: '2026-01-30T10:00:00Z',
    }

    render(
      <SpecItem
        spec={archivedSpec}
        isExpanded={true}
        onToggle={() => {}}
      />
    )

    expect(screen.getByText(/보관:/)).toBeInTheDocument()
  })
})
