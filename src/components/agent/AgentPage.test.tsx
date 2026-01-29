/**
 * AgentPage Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentPage } from './AgentPage'

// Mock fetch
global.fetch = vi.fn()

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('AgentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ changes: [] }),
    } as Response)
  })

  it('should render agent header', () => {
    render(<AgentPage projectId="test-project" />, { wrapper: createWrapper() })

    expect(screen.getByText('Agent')).toBeInTheDocument()
  })

  it('should show change selector dropdown', () => {
    render(<AgentPage projectId="test-project" />, { wrapper: createWrapper() })

    expect(screen.getByText('Select Change')).toBeInTheDocument()
  })

  it('should render chat area', () => {
    render(<AgentPage projectId="test-project" />, { wrapper: createWrapper() })

    // Chat component should be present
    expect(screen.getByPlaceholderText(/select a change first/i)).toBeInTheDocument()
  })

  it('should render sidebar by default', () => {
    render(<AgentPage projectId="test-project" />, { wrapper: createWrapper() })

    expect(screen.getByText('Agent Context')).toBeInTheDocument()
  })

  it('should show empty state when no changes', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ changes: [] }),
    } as Response)

    render(<AgentPage projectId="test-project" />, { wrapper: createWrapper() })

    // Wait for query to resolve
    await screen.findByText('Select Change')
  })
})

describe('AgentPage with changeId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    }
    global.localStorage = localStorageMock as any

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        changes: [
          { id: 'test-change', title: 'Test Change', status: 'active' },
        ],
      }),
    } as Response)
  })

  it('should show selected change when changeId is provided', async () => {
    render(
      <AgentPage
        projectId="test-project"
        changeId="test-change"
      />,
      { wrapper: createWrapper() }
    )

    // Wait for the change to be loaded
    await screen.findByText('Test Change')
  })

  it('should enable chat input when change is selected', async () => {
    render(
      <AgentPage
        projectId="test-project"
        changeId="test-change"
      />,
      { wrapper: createWrapper() }
    )

    await screen.findByText('Test Change')

    const input = screen.getByPlaceholderText(/send a message/i)
    expect(input).not.toBeDisabled()
  })
})
