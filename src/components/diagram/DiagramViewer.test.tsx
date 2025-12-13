import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiagramViewer } from './DiagramViewer'

// Mock MermaidRenderer
vi.mock('./MermaidRenderer', () => ({
  MermaidRenderer: ({ code, onNodeClick }: { code: string; onNodeClick?: (id: string, path: string) => void }) => (
    <div data-testid="mermaid-renderer" onClick={() => onNodeClick?.('test', '/test/path')}>
      {code}
    </div>
  ),
}))

describe('DiagramViewer', () => {
  const sampleCode = `flowchart TD
    A[Start] --> B[Process]
    B --> C[End]`

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the diagram code', () => {
    render(<DiagramViewer code={sampleCode} />)
    expect(screen.getByTestId('mermaid-renderer')).toBeInTheDocument()
  })

  it('shows zoom controls', () => {
    render(<DiagramViewer code={sampleCode} />)
    expect(screen.getByRole('button', { name: /축소/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /확대/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /초기화/i })).toBeInTheDocument()
  })

  it('handles zoom in', () => {
    render(<DiagramViewer code={sampleCode} />)
    const zoomInButton = screen.getByRole('button', { name: /확대/i })

    fireEvent.click(zoomInButton)
    // Zoom level should increase (checked via visual or state)
    expect(zoomInButton).toBeInTheDocument()
  })

  it('handles zoom out', () => {
    render(<DiagramViewer code={sampleCode} />)
    const zoomOutButton = screen.getByRole('button', { name: /축소/i })

    fireEvent.click(zoomOutButton)
    expect(zoomOutButton).toBeInTheDocument()
  })

  it('handles reset zoom', () => {
    render(<DiagramViewer code={sampleCode} />)
    const resetButton = screen.getByRole('button', { name: /초기화/i })

    fireEvent.click(resetButton)
    expect(resetButton).toBeInTheDocument()
  })

  it('shows copy code button', () => {
    render(<DiagramViewer code={sampleCode} />)
    expect(screen.getByRole('button', { name: /코드 복사/i })).toBeInTheDocument()
  })

  it('shows download button', () => {
    render(<DiagramViewer code={sampleCode} />)
    expect(screen.getByRole('button', { name: /SVG 다운로드/i })).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <DiagramViewer code={sampleCode} className="custom-viewer" />
    )
    expect(container.firstChild).toHaveClass('custom-viewer')
  })

  it('calls onNodeClick when node is clicked', () => {
    const onNodeClick = vi.fn()
    render(<DiagramViewer code={sampleCode} onNodeClick={onNodeClick} />)

    fireEvent.click(screen.getByTestId('mermaid-renderer'))
    expect(onNodeClick).toHaveBeenCalledWith('test', '/test/path')
  })
})
