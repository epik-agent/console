import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import App from './App'
import { makeEvents, makeUseAgentEventsMock } from './test-fixtures'
import type { AgentId, PoolState } from './types'

// Mock useAgentEvents to avoid WebSocket connections in tests
vi.mock('./useAgentEvents', () => ({
  useAgentEvents: () => makeUseAgentEventsMock(),
  resolveApiBase: () => '',
}))

// Mock react-force-graph-2d — canvas is not available in jsdom
vi.mock('react-force-graph-2d', () => ({
  default: vi.fn(() => null),
}))

// Mock fetch for API calls
const mockFetch = vi.fn()

beforeEach(() => {
  localStorage.clear()
  document.documentElement.setAttribute('data-theme', 'dark')
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

/** Render App, type a repo into the input, click Load, and return unmount + the render result. */
async function renderAndLoadRepo() {
  const user = userEvent.setup()
  const result = render(<App />)
  const input = result.getByPlaceholderText(/owner\/repo/i)
  await user.clear(input)
  await user.type(input, 'owner/repo')
  const loadButton = result.getByRole('button', { name: /load/i })
  await user.click(loadButton)
  return result
}

describe('App', () => {
  it('mounts without errors', () => {
    render(<App />)
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
    const user = userEvent.setup()
    const { getByRole, getByPlaceholderText } = render(<App />)

    const input = getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    const loadButton = getByRole('button', { name: /load/i })
    await user.click(loadButton)

    const startButton = getByRole('button', { name: /start/i })
    await user.click(startButton)

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/start',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows repo input when no repo in URL', () => {
    render(<App />)
    expect(screen.getByPlaceholderText(/owner\/repo/i)).toBeInTheDocument()
  })

  it('Start button is disabled when no repo is set', () => {
    render(<App />)
    const startButton = screen.getByRole('button', { name: /start/i })
    expect(startButton).toBeDisabled()
  })

  it('renders the Stop button', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
  })

  it('Stop button is disabled when running is false', () => {
    render(<App />)
    const stopButton = screen.getByRole('button', { name: /stop/i })
    expect(stopButton).toBeDisabled()
  })

  it('Start button is disabled when running is true', async () => {
    const useAgentEventsModule = await import('./useAgentEvents')
    vi.spyOn(useAgentEventsModule, 'useAgentEvents').mockReturnValue({
      events: makeEvents(),
      pool: { running: true, agents: [] } as PoolState,
      connectionStatus: 'connected',
      sendMessage: vi.fn(),
      interrupt: vi.fn(),
    })

    render(<App />)
    const startButton = screen.getByRole('button', { name: /start/i })
    expect(startButton).toBeDisabled()
  })

  it('Stop button is enabled when running is true', async () => {
    const useAgentEventsModule = await import('./useAgentEvents')
    vi.spyOn(useAgentEventsModule, 'useAgentEvents').mockReturnValue({
      events: makeEvents(),
      pool: { running: true, agents: [] } as PoolState,
      connectionStatus: 'connected',
      sendMessage: vi.fn(),
      interrupt: vi.fn(),
    })

    render(<App />)
    const stopButton = screen.getByRole('button', { name: /stop/i })
    expect(stopButton).not.toBeDisabled()
  })

  it('calls /api/stop when Stop button is clicked', async () => {
    const useAgentEventsModule = await import('./useAgentEvents')
    vi.spyOn(useAgentEventsModule, 'useAgentEvents').mockReturnValue({
      events: makeEvents(),
      pool: { running: true, agents: [] } as PoolState,
      connectionStatus: 'connected',
      sendMessage: vi.fn(),
      interrupt: vi.fn(),
    })

    const user = userEvent.setup()
    render(<App />)
    const stopButton = screen.getByRole('button', { name: /stop/i })
    await user.click(stopButton)

    expect(mockFetch).toHaveBeenCalledWith('/api/stop', expect.objectContaining({ method: 'POST' }))
  })

  it('handles fetch error for issues gracefully (sets empty graph)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const user = userEvent.setup()
    const { getByRole, getByPlaceholderText } = render(<App />)

    const input = getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    const loadButton = getByRole('button', { name: /load/i })
    await user.click(loadButton)

    expect(screen.getByPlaceholderText(/owner\/repo/i)).toBeInTheDocument()
  })

  it('does not fetch when the repo input is empty and Load is clicked', async () => {
    const user = userEvent.setup()
    const { getByRole, getByPlaceholderText } = render(<App />)

    const input = getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)

    const loadButton = getByRole('button', { name: /load/i })
    await user.click(loadButton)

    const issuesCalls = mockFetch.mock.calls.filter(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('/api/issues'),
    )
    expect(issuesCalls).toHaveLength(0)
  })

  it('Load button is disabled when input is empty', () => {
    render(<App />)
    const loadButton = screen.getByRole('button', { name: /load/i })
    expect(loadButton).toBeDisabled()
  })

  it('Load button is disabled when input has no slash', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'noslash')
    expect(screen.getByRole('button', { name: /load/i })).toBeDisabled()
  })

  it('Load button is enabled when input contains a slash', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    expect(screen.getByRole('button', { name: /load/i })).not.toBeDisabled()
  })

  it('Load button shows busy state while fetch is in flight', async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<{ nodes: never[] }> }) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    await user.click(screen.getByRole('button', { name: /load/i }))

    const loadButton = screen.getByRole('button', { name: /load/i })
    expect(loadButton).toBeDisabled()
    expect(loadButton).toHaveClass('btn--busy')

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ nodes: [] }) })
    })
  })

  it('Load button clears busy state after fetch resolves', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    await user.click(screen.getByRole('button', { name: /load/i }))

    await act(async () => {})

    const loadButton = screen.getByRole('button', { name: /load/i })
    expect(loadButton).not.toHaveClass('btn--busy')
    expect(loadButton).not.toBeDisabled()
  })

  it('Start button shows busy state after click until running becomes true', async () => {
    const useAgentEventsModule = await import('./useAgentEvents')
    const mockReturn = {
      events: makeEvents(),
      pool: { running: false, agents: [] } as PoolState,
      connectionStatus: 'connected' as const,
      sendMessage: vi.fn(),
      interrupt: vi.fn(),
    }
    vi.spyOn(useAgentEventsModule, 'useAgentEvents').mockReturnValue(mockReturn)

    const user = userEvent.setup()
    const { rerender } = render(<App />)

    // Load a repo first to enable Start
    const input = screen.getByPlaceholderText(/owner\/repo/i)
    await user.clear(input)
    await user.type(input, 'owner/repo')
    await user.click(screen.getByRole('button', { name: /load/i }))
    await act(async () => {})

    const startButton = screen.getByRole('button', { name: /start/i })
    await user.click(startButton)

    expect(startButton).toHaveClass('btn--busy')
    expect(startButton).toBeDisabled()

    // Simulate running becoming true
    vi.spyOn(useAgentEventsModule, 'useAgentEvents').mockReturnValue({
      ...mockReturn,
      pool: { running: true, agents: [] } as PoolState,
    })
    rerender(<App />)

    expect(screen.getByRole('button', { name: /start/i })).not.toHaveClass('btn--busy')
  })

  it('Stop button shows busy state after click until running becomes false', async () => {
    const useAgentEventsModule = await import('./useAgentEvents')
    const mockReturn = {
      events: makeEvents(),
      pool: { running: true, agents: [] } as PoolState,
      connectionStatus: 'connected' as const,
      sendMessage: vi.fn(),
      interrupt: vi.fn(),
    }
    vi.spyOn(useAgentEventsModule, 'useAgentEvents').mockReturnValue(mockReturn)

    const user = userEvent.setup()
    const { rerender } = render(<App />)

    const stopButton = screen.getByRole('button', { name: /stop/i })
    await user.click(stopButton)

    expect(stopButton).toHaveClass('btn--busy')
    expect(stopButton).toBeDisabled()

    // Simulate running becoming false
    vi.spyOn(useAgentEventsModule, 'useAgentEvents').mockReturnValue({
      ...mockReturn,
      pool: { running: false, agents: [] } as PoolState,
    })
    rerender(<App />)

    expect(screen.getByRole('button', { name: /stop/i })).not.toHaveClass('btn--busy')
  })

  it('unmounts cleanly while a fetch is in-flight (cancelled flag prevents stale setState)', async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<{ nodes: never[] }> }) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    const { unmount } = await renderAndLoadRepo()

    unmount()

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ nodes: [] }) })
    })
  })

  describe('toolbar structure', () => {
    it('renders the brand mark and name', () => {
      render(<App />)
      expect(screen.getByText('Epik')).toBeInTheDocument()
    })

    it('renders a connection badge', () => {
      render(<App />)
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })
  })

  describe('theme toggle button', () => {
    it('renders a toggle button in the toolbar', () => {
      render(<App />)
      expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument()
    })

    it('aria-label flips between modes on toggle', async () => {
      const user = userEvent.setup()
      render(<App />)
      const btn = screen.getByRole('button', { name: /switch to light mode/i })
      await user.click(btn)
      expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument()
    })

    it('writes theme to localStorage after toggle', async () => {
      const user = userEvent.setup()
      render(<App />)
      const btn = screen.getByRole('button', { name: /switch to light mode/i })
      await user.click(btn)
      expect(localStorage.getItem('theme')).toBe('light')
    })

    it('renders in light mode when localStorage is pre-set to light', () => {
      localStorage.setItem('theme', 'light')
      render(<App />)
      // data-theme attribute should be set to light
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })
  })

  describe('repo history datalist', () => {
    it('renders a datalist with id="repo-history"', () => {
      render(<App />)
      expect(document.getElementById('repo-history')).toBeInTheDocument()
    })

    it('repo input has list="repo-history" attribute', () => {
      render(<App />)
      const input = screen.getByPlaceholderText(/owner\/repo/i)
      expect(input).toHaveAttribute('list', 'repo-history')
    })

    it('datalist shows the repo as an option after loading it', async () => {
      const user = userEvent.setup()
      render(<App />)
      const input = screen.getByPlaceholderText(/owner\/repo/i)
      await user.clear(input)
      await user.type(input, 'owner/repo')
      await user.click(screen.getByRole('button', { name: /load/i }))

      const datalist = document.getElementById('repo-history')
      const options = datalist?.querySelectorAll('option')
      const values = Array.from(options ?? []).map((o) => o.value)
      expect(values).toContain('owner/repo')
    })

    it('does not duplicate a repo when loaded twice', async () => {
      const user = userEvent.setup()
      render(<App />)
      const input = screen.getByPlaceholderText(/owner\/repo/i)
      for (let i = 0; i < 2; i++) {
        await user.clear(input)
        await user.type(input, 'owner/repo')
        await user.click(screen.getByRole('button', { name: /load/i }))
      }

      const datalist = document.getElementById('repo-history')
      const options = datalist?.querySelectorAll('option')
      const values = Array.from(options ?? []).map((o) => o.value)
      expect(values.filter((v) => v === 'owner/repo')).toHaveLength(1)
    })

    it('pre-existing localStorage history appears as options on mount', () => {
      localStorage.setItem('repoHistory', JSON.stringify(['facebook/react', 'torvalds/linux']))
      render(<App />)

      const datalist = document.getElementById('repo-history')
      const options = datalist?.querySelectorAll('option')
      const values = Array.from(options ?? []).map((o) => o.value)
      expect(values).toContain('facebook/react')
      expect(values).toContain('torvalds/linux')
    })
  })

  it('does not scroll on initial load', () => {
    const spy = vi.fn()
    HTMLElement.prototype.scrollIntoView = spy
    render(<App />)
    expect(spy).not.toHaveBeenCalled()
    HTMLElement.prototype.scrollIntoView = () => {}
  })

  it('unmounts cleanly when fetch rejects after unmount (cancelled flag suppresses setGraph)', async () => {
    let rejectFetch!: (err: Error) => void
    mockFetch.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFetch = reject
      }),
    )

    const { unmount } = await renderAndLoadRepo()

    unmount()

    await act(async () => {
      rejectFetch(new Error('Network gone'))
    })
  })

  describe('agentIssueMap wiring', () => {
    let capturedAgentIssueMap: Partial<Record<AgentId, number>> | undefined

    beforeEach(async () => {
      capturedAgentIssueMap = undefined
      const IssueGraphModule = await import('./IssueGraph')
      vi.spyOn(IssueGraphModule, 'default').mockImplementation(
        (props: Parameters<typeof IssueGraphModule.default>[0]) => {
          capturedAgentIssueMap = props.agentIssueMap
          return null as unknown as React.ReactElement
        },
      )
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('passes agentIssueMap=undefined to IssueGraph when no inject events exist', async () => {
      await act(async () => {
        render(<App />)
      })
      expect(capturedAgentIssueMap).toEqual({})
    })

    it('passes agentIssueMap with correct entry when worker has inject event', async () => {
      const useAgentEventsModule = await import('./useAgentEvents')
      vi.spyOn(useAgentEventsModule, 'useAgentEvents').mockReturnValue({
        events: makeEvents({ 'worker-0': [{ kind: 'inject', text: 'Please work on issue #17.' }] }),
        pool: { running: false, agents: [] } as PoolState,
        connectionStatus: 'connected',
        sendMessage: vi.fn(),
        interrupt: vi.fn(),
      })

      await act(async () => {
        render(<App />)
      })

      expect(capturedAgentIssueMap?.['worker-0']).toBe(17)
    })

    it('clears agentIssueMap entry after turn_end follows inject', async () => {
      const useAgentEventsModule = await import('./useAgentEvents')
      vi.spyOn(useAgentEventsModule, 'useAgentEvents').mockReturnValue({
        events: makeEvents({
          'worker-0': [{ kind: 'inject', text: 'Please work on issue #17.' }, { kind: 'turn_end' }],
        }),
        pool: { running: false, agents: [] } as PoolState,
        connectionStatus: 'connected',
        sendMessage: vi.fn(),
        interrupt: vi.fn(),
      })

      await act(async () => {
        render(<App />)
      })

      expect(capturedAgentIssueMap?.['worker-0']).toBeUndefined()
    })
  })
})
