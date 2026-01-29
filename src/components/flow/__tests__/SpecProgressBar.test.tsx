import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpecProgressBar } from '../SpecProgressBar'
import type { MoaiSpecProgress } from '@/types/flow'

describe('SpecProgressBar', () => {
  const mockProgress: MoaiSpecProgress = {
    completed: 3,
    total: 7,
    percentage: 42.86,
  }

  it('renders progress text with label', () => {
    render(
      <SpecProgressBar
        progress={mockProgress}
        label="Test Progress"
      />
    )

    expect(screen.getByText('Test Progress')).toBeInTheDocument()
    expect(screen.getByText('3/7')).toBeInTheDocument()
  })

  it('renders default label when not provided', () => {
    render(<SpecProgressBar progress={mockProgress} />)

    expect(screen.getByText('Progress')).toBeInTheDocument()
  })

  it('displays correct percentage', () => {
    render(
      <SpecProgressBar
        progress={mockProgress}
        label="Test"
      />
    )

    const percentageText = screen.getByText('42.9%')
    expect(percentageText).toBeInTheDocument()
  })

  it('renders progress bar with correct width', () => {
    const { container } = render(
      <SpecProgressBar
        progress={mockProgress}
        label="Test"
      />
    )

    const progressBar = container.querySelector('div[style*="width"]')
    expect(progressBar).toHaveStyle('width: 42.86%')
  })

  it('applies green color when complete', () => {
    const completeProgress: MoaiSpecProgress = {
      completed: 7,
      total: 7,
      percentage: 100,
    }

    const { container } = render(
      <SpecProgressBar
        progress={completeProgress}
        label="Test"
      />
    )

    const progressBar = container.querySelector('[class*="from-green"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('applies blue color when not complete', () => {
    const { container } = render(
      <SpecProgressBar
        progress={mockProgress}
        label="Test"
      />
    )

    const progressBar = container.querySelector('[class*="from-blue"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('handles zero progress', () => {
    const zeroProgress: MoaiSpecProgress = {
      completed: 0,
      total: 10,
      percentage: 0,
    }

    render(
      <SpecProgressBar
        progress={zeroProgress}
        label="Test"
      />
    )

    expect(screen.getByText('0/10')).toBeInTheDocument()
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })
})
