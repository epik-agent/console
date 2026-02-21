import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import App from './App'

// Mock useAgentEvents to avoid WebSocket connections in tests
vi.mock('./useAgentEvents', () => ({
  useAgentEvents: () => ({
    events: { supervisor: [], 'worker-0': [], 'worker-1': [], 'worker-2': [] },
    pool: [],
    sendMessage: vi.fn(),
    interrupt: vi.fn(),
  }),
}))

// Mock react-force-graph-2d — canvas is not available in jsdom
vi.mock('react-force-graph-2d', () => ({
  default: vi.fn(() => null),
}))

// Mock fetch for API calls
const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ nodes: [] }),
  })
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('App', () => {
  it('mounts without errors', () => {
    render(<App />)
    // If it renders without throwing, the test passes
    expect(document.body).toBeInTheDocument()
  })

  it('renders the Start button', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
  })

  it('renders agent tabs', () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: /supervisor/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /worker 0/i })).toBeInTheDocument()
  })

  it('calls /api/start when Start button is clicked after setting a repo', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { getByRole, getByPlaceholderText } = render(<App />)

    // Set a repo via the input form
    const input = getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    const loadButton = getByRole('button', { name: /load/i })
    await user.click(loadButton)

    // Now click Start
    const startButton = getByRole('button', { name: /start/i })
    await user.click(startButton)

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/start',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows repo input when no repo in URL', () => {
    render(<App />)
    // Should have an input for the repo
    expect(screen.getByPlaceholderText(/owner\/repo/i)).toBeInTheDocument()
  })
})
