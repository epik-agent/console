import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import App from './App'
import { themes } from './theme'

/** Convert a hex color like "#a0707a" to "rgb(160, 112, 122)" for jsdom comparison. */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}

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

  it('Start button is disabled when no repo is set', () => {
    render(<App />)
    const startButton = screen.getByRole('button', { name: /start/i })
    expect(startButton).toBeDisabled()
  })

  it('handles fetch error for issues gracefully (sets empty graph)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const user = (await import('@testing-library/user-event')).default.setup()
    const { getByRole, getByPlaceholderText } = render(<App />)

    const input = getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    const loadButton = getByRole('button', { name: /load/i })
    await user.click(loadButton)

    // The component should not throw — it should stay rendered
    expect(screen.getByPlaceholderText(/owner\/repo/i)).toBeInTheDocument()
  })

  it('does not fetch when the repo input is empty and Load is clicked', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { getByRole, getByPlaceholderText } = render(<App />)

    // Clear the repo input to empty
    const input = getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)

    const loadButton = getByRole('button', { name: /load/i })
    await user.click(loadButton)

    // fetch should not have been called with /api/issues
    const issuesCalls = mockFetch.mock.calls.filter(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('/api/issues'),
    )
    expect(issuesCalls).toHaveLength(0)
  })

  it('unmounts cleanly while a fetch is in-flight (cancelled flag prevents stale setState)', async () => {
    // Make fetch never resolve during the test
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<{ nodes: never[] }> }) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    const user = (await import('@testing-library/user-event')).default.setup()
    const { getByRole, getByPlaceholderText, unmount } = render(<App />)

    const input = getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    const loadButton = getByRole('button', { name: /load/i })
    await user.click(loadButton)

    // Unmount while fetch is in-flight — this sets the cancelled flag
    unmount()

    // Now resolve the fetch — the stale setState should be suppressed (no warning thrown)
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ nodes: [] }) })
    })
  })

  describe('toolbar contrast — colors from theme palette', () => {
    it('toolbar background uses theme bar color', () => {
      const { container } = render(<App />)
      const toolbar = container.querySelector('[aria-label="toolbar"]') as HTMLElement
      expect(toolbar).toBeInTheDocument()
      expect(toolbar.style.background).toBe(hexToRgb(themes.dark.bg.bar))
    })

    it('repo input background uses theme input color', () => {
      const { container } = render(<App />)
      const input = container.querySelector('input[aria-label="GitHub repository"]') as HTMLElement
      expect(input.style.background).toBe(hexToRgb(themes.dark.bg.input))
    })

    it('repo input border color uses theme border color', () => {
      const { container } = render(<App />)
      const input = container.querySelector('input[aria-label="GitHub repository"]') as HTMLElement
      expect(input.style.borderColor).toBe(hexToRgb(themes.dark.border.strong))
    })

    it('repo input text color uses theme primary text color', () => {
      const { container } = render(<App />)
      const input = container.querySelector('input[aria-label="GitHub repository"]') as HTMLElement
      expect(input.style.color).toBe(hexToRgb(themes.dark.text.primary))
    })

    it('Load button background uses theme inputBar color', () => {
      const { getByRole } = render(<App />)
      const loadButton = getByRole('button', { name: /load/i }) as HTMLElement
      expect(loadButton.style.background).toBe(hexToRgb(themes.dark.bg.inputBar))
    })

    it('Load button text color uses theme secondary text color', () => {
      const { getByRole } = render(<App />)
      const loadButton = getByRole('button', { name: /load/i }) as HTMLElement
      expect(loadButton.style.color).toBe(hexToRgb(themes.dark.text.secondary))
    })

    it('Start button background uses theme accent color', () => {
      const { getByRole } = render(<App />)
      const startButton = getByRole('button', { name: /start/i }) as HTMLElement
      expect(startButton.style.background).toBe(hexToRgb(themes.dark.accent))
    })

    it('toolbar bottom border uses theme border strong color', () => {
      const { container } = render(<App />)
      const toolbar = container.querySelector('[aria-label="toolbar"]') as HTMLElement
      expect(toolbar.style.borderBottomColor).toBe(hexToRgb(themes.dark.border.strong))
    })
  })

  it('renders no hardcoded chrome hex values anywhere in the DOM', () => {
    // These are the original hardcoded near-black values that were replaced with
    // theme palette references. Any recurrence in any child component is a regression.
    const forbidden = [
      '#111827', // old root/input bg
      '#1f2937', // old toolbar/tab-strip bg
      '#374151', // old border / secondary button bg
      '#3b82f6', // old active-tab underline / start button bg
      '#9ca3af', // old inactive tab text
      '#f9fafb', // old primary text (replaced by palette.text.primary)
    ]
    const { container } = render(<App />)
    const html = container.innerHTML
    for (const hex of forbidden) {
      expect(html, `found hardcoded ${hex} in rendered DOM`).not.toContain(hex)
    }
  })

  it('unmounts cleanly when fetch rejects after unmount (cancelled flag suppresses setGraph)', async () => {
    // Make fetch reject after a delay
    let rejectFetch!: (err: Error) => void
    mockFetch.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFetch = reject
      }),
    )

    const user = (await import('@testing-library/user-event')).default.setup()
    const { getByRole, getByPlaceholderText, unmount } = render(<App />)

    const input = getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    const loadButton = getByRole('button', { name: /load/i })
    await user.click(loadButton)

    // Unmount while fetch is in-flight
    unmount()

    // Now reject the fetch — the catch handler should skip setGraph because cancelled=true
    await act(async () => {
      rejectFetch(new Error('Network gone'))
    })
  })
})
