import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MermaidRenderer } from './MermaidRenderer'

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>test diagram</svg>' }),
  },
}))

describe('MermaidRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    render(<MermaidRenderer code="flowchart TD\n  A --> B" />)
    // The component should show a loading spinner or container
    expect(document.querySelector('.mermaid-container')).toBeTruthy()
  })

  it('renders diagram after mermaid processes it', async () => {
    const { container } = render(
      <MermaidRenderer code="flowchart TD\n  A --> B" />
    )

    await waitFor(() => {
      expect(container.querySelector('.mermaid-container')).toBeTruthy()
    })
  })

  it('shows error when code is empty', async () => {
    render(<MermaidRenderer code="" />)
    // Empty code should not attempt to render
    expect(screen.queryByText('다이어그램 렌더링 오류')).not.toBeInTheDocument()
  })

  it('calls onRender callback on successful render', async () => {
    const onRender = vi.fn()
    render(
      <MermaidRenderer code="flowchart TD\n  A --> B" onRender={onRender} />
    )

    await waitFor(() => {
      expect(onRender).toHaveBeenCalled()
    })
  })

  it('applies custom className', () => {
    const { container } = render(
      <MermaidRenderer code="flowchart TD\n  A --> B" className="custom-class" />
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('handles theme prop', async () => {
    const mermaid = await import('mermaid')
    render(
      <MermaidRenderer code="flowchart TD\n  A --> B" theme="dark" />
    )

    await waitFor(() => {
      expect(mermaid.default.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'dark' })
      )
    })
  })
})
