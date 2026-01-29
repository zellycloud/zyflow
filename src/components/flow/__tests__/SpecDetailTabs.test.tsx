import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpecDetailTabs } from '../SpecDetailTabs'
import type { MoaiSpec } from '@/types/flow'

describe('SpecDetailTabs', () => {
  const mockSpec: MoaiSpec = {
    type: 'spec',
    id: 'SPEC-001',
    specId: 'SPEC-001',
    title: 'Test Spec',
    status: 'active',
    progress: {
      completed: 5,
      total: 10,
      percentage: 50,
    },
    spec: {
      content: '# Specification\nTest spec content',
      requirements: [
        {
          id: 'req-1',
          title: 'Requirement 1',
          description: 'Description 1',
          type: 'functional',
          priority: 'high',
        },
      ],
    },
    plan: {
      content: '# Plan\nTest plan content',
      tags: [
        {
          id: 'TAG-001',
          name: 'Backend',
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
      content: '# Acceptance Criteria\nTest acceptance content',
      criteria: [
        {
          id: 'ac-1',
          description: 'Acceptance criterion 1',
          priority: 'critical',
        },
      ],
    },
    createdAt: '2026-01-29T10:00:00Z',
    updatedAt: '2026-01-29T15:00:00Z',
  }

  it('renders all three tabs', () => {
    render(<SpecDetailTabs spec={mockSpec} />)

    expect(screen.getByText(/Spec/)).toBeInTheDocument()
    expect(screen.getByText(/Plan/)).toBeInTheDocument()
    expect(screen.getByText(/Acceptance/)).toBeInTheDocument()
  })

  it('displays spec content by default', () => {
    render(<SpecDetailTabs spec={mockSpec} />)

    expect(screen.getByText(/Specification/)).toBeInTheDocument()
    expect(screen.getByText(/Test spec content/)).toBeInTheDocument()
  })

  it('switches to plan tab when clicked', async () => {
    const user = userEvent.setup()
    render(<SpecDetailTabs spec={mockSpec} />)

    const planTab = screen.getByRole('tab', { name: /Plan/ })
    await user.click(planTab)

    expect(screen.getByText(/Plan/)).toBeInTheDocument()
    expect(screen.getByText(/Test plan content/)).toBeInTheDocument()
  })

  it('switches to acceptance tab when clicked', async () => {
    const user = userEvent.setup()
    render(<SpecDetailTabs spec={mockSpec} />)

    const acceptanceTab = screen.getByRole('tab', { name: /Acceptance/ })
    await user.click(acceptanceTab)

    expect(screen.getByText(/Acceptance Criteria/)).toBeInTheDocument()
    expect(screen.getByText(/Test acceptance content/)).toBeInTheDocument()
  })

  it('renders requirements in spec tab', () => {
    render(<SpecDetailTabs spec={mockSpec} />)

    expect(screen.getByText(/요구사항/)).toBeInTheDocument()
    expect(screen.getByText(/Requirement 1/)).toBeInTheDocument()
    expect(screen.getByText(/Description 1/)).toBeInTheDocument()
  })

  it('renders tags in plan tab', async () => {
    const user = userEvent.setup()
    render(<SpecDetailTabs spec={mockSpec} />)

    const planTab = screen.getByRole('tab', { name: /Plan/ })
    await user.click(planTab)

    expect(screen.getByText(/TAGs/)).toBeInTheDocument()
    expect(screen.getByText(/Backend/)).toBeInTheDocument()
  })

  it('renders acceptance criteria in acceptance tab', async () => {
    const user = userEvent.setup()
    render(<SpecDetailTabs spec={mockSpec} />)

    const acceptanceTab = screen.getByRole('tab', { name: /Acceptance/ })
    await user.click(acceptanceTab)

    expect(screen.getByText(/수용 기준/)).toBeInTheDocument()
    expect(screen.getByText(/Acceptance criterion 1/)).toBeInTheDocument()
  })

  it('shows message when spec content is empty', () => {
    const emptySpec: MoaiSpec = {
      ...mockSpec,
      spec: {
        content: '',
        requirements: [],
      },
    }

    render(<SpecDetailTabs spec={emptySpec} />)

    expect(screen.getByText(/Spec 문서가 없습니다/)).toBeInTheDocument()
  })

  it('displays plan progress bar', async () => {
    const user = userEvent.setup()
    render(<SpecDetailTabs spec={mockSpec} />)

    const planTab = screen.getByRole('tab', { name: /Plan/ })
    await user.click(planTab)

    expect(screen.getByText(/Plan 진행률/)).toBeInTheDocument()
    expect(screen.getByText(/3\/7/)).toBeInTheDocument()
  })
})
