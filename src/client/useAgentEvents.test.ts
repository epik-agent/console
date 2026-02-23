import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentEvents } from './useAgentEvents'
import type { AgentEvent, AgentId, PoolState, ServerMessage } from './types'

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = []

  url: string
  readyState: number = WebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  open() {
    this.readyState = WebSocket.OPEN
    this.onopen?.()
  }

  receive(data: string) {
    this.onmessage?.({ data })
  }

  close() {
    this.readyState = WebSocket.CLOSED
    this.onclose?.()
  }

  send = vi.fn()
}

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn().mockResolvedValue({ ok: true })

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAgentEvents', () => {
  it('connects to WebSocket on mount', () => {
    renderHook(() => useAgentEvents())
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toMatch(/\/ws$/)
  })

  it('pool updates when a pool_state message arrives', () => {
    const { result } = renderHook(() => useAgentEvents())
    const ws = MockWebSocket.instances[0]

    act(() => {
      ws.open()
    })

    const pool: PoolState = [
      { id: 'supervisor', role: 'supervisor', status: 'idle', sessionId: undefined },
      { id: 'worker-0', role: 'worker', status: 'busy', sessionId: 'abc' },
    ]
    const msg: ServerMessage = { type: 'pool_state', pool }

    act(() => {
      ws.receive(JSON.stringify(msg))
    })

    expect(result.current.pool).toEqual(pool)
  })

  it('events accumulates agent_event messages per agent', () => {
    const { result } = renderHook(() => useAgentEvents())
    const ws = MockWebSocket.instances[0]

    act(() => {
      ws.open()
    })

    const agentId: AgentId = 'worker-0'
    const msg: ServerMessage = {
      type: 'agent_event',
      agentId,
      event: { kind: 'text_delta', text: 'Hello' },
    }

    act(() => {
      ws.receive(JSON.stringify(msg))
    })

    expect(result.current.events[agentId]).toHaveLength(1)
    expect(result.current.events[agentId][0]).toEqual({ kind: 'text_delta', text: 'Hello' })
  })

  it('accumulates multiple events per agent in order', () => {
    const { result } = renderHook(() => useAgentEvents())
    const ws = MockWebSocket.instances[0]

    act(() => {
      ws.open()
    })

    const agentId: AgentId = 'supervisor'
    const msgs: ServerMessage[] = [
      { type: 'agent_event', agentId, event: { kind: 'text_delta', text: 'First' } },
      { type: 'agent_event', agentId, event: { kind: 'text_delta', text: 'Second' } },
      { type: 'agent_event', agentId, event: { kind: 'turn_end' } },
    ]

    act(() => {
      for (const msg of msgs) ws.receive(JSON.stringify(msg))
    })

    expect(result.current.events[agentId]).toHaveLength(3)
    expect(result.current.events[agentId][2]).toEqual({ kind: 'turn_end' })
  })

  it('keeps events for different agents separate', () => {
    const { result } = renderHook(() => useAgentEvents())
    const ws = MockWebSocket.instances[0]

    act(() => {
      ws.open()
    })

    const m0: ServerMessage = {
      type: 'agent_event',
      agentId: 'worker-0',
      event: { kind: 'text_delta', text: 'Worker0' },
    }
    const m1: ServerMessage = {
      type: 'agent_event',
      agentId: 'worker-1',
      event: { kind: 'text_delta', text: 'Worker1' },
    }

    act(() => {
      ws.receive(JSON.stringify(m0))
      ws.receive(JSON.stringify(m1))
    })

    expect(result.current.events['worker-0']).toHaveLength(1)
    expect(result.current.events['worker-1']).toHaveLength(1)
    expect(result.current.events['worker-0'][0]).toEqual({ kind: 'text_delta', text: 'Worker0' })
    expect(result.current.events['worker-1'][0]).toEqual({ kind: 'text_delta', text: 'Worker1' })
  })

  it('sendMessage POSTs to /api/message', async () => {
    const { result } = renderHook(() => useAgentEvents())

    await act(async () => {
      result.current.sendMessage('worker-0', 'Hello agent')
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'worker-0', text: 'Hello agent' }),
    })
  })

  it('interrupt POSTs to /api/interrupt', async () => {
    const { result } = renderHook(() => useAgentEvents())

    await act(async () => {
      result.current.interrupt('supervisor')
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/interrupt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'supervisor' }),
    })
  })

  it('reconnects after disconnect', () => {
    renderHook(() => useAgentEvents())
    const ws0 = MockWebSocket.instances[0]

    act(() => {
      ws0.open()
      ws0.close()
    })

    // Advance time past reconnect delay
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('silently ignores malformed JSON messages', () => {
    const { result } = renderHook(() => useAgentEvents())
    const ws = MockWebSocket.instances[0]

    act(() => {
      ws.open()
      ws.receive('not valid json }{')
    })

    // Pool and events should remain at their initial values
    expect(result.current.pool).toEqual([])
    expect(result.current.events['supervisor']).toHaveLength(0)
  })

  it('does not reconnect after unmount', () => {
    const { unmount } = renderHook(() => useAgentEvents())
    const ws0 = MockWebSocket.instances[0]

    act(() => {
      ws0.open()
    })

    // Unmount first, then close the socket
    unmount()

    act(() => {
      ws0.close()
    })

    // Advance time — no reconnect should happen
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('cancels pending reconnect timer on unmount', () => {
    const { unmount } = renderHook(() => useAgentEvents())
    const ws0 = MockWebSocket.instances[0]

    act(() => {
      ws0.open()
      ws0.close()
    })

    // There should be a pending reconnect timer now; unmounting should cancel it
    unmount()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Only the first WS should have been created
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('unmounts cleanly when no reconnect timer is pending (no-op branch)', () => {
    // When the socket never closes, there's no pending reconnect timer.
    // Unmounting should still work correctly without throwing.
    const { unmount } = renderHook(() => useAgentEvents())
    const ws0 = MockWebSocket.instances[0]

    act(() => {
      ws0.open()
      // Do NOT close the socket — no reconnect timer is set
    })

    // Should not throw
    expect(() => unmount()).not.toThrow()
  })

  it('silently ignores messages with an unrecognised type', () => {
    const { result } = renderHook(() => useAgentEvents())
    const ws = MockWebSocket.instances[0]

    act(() => {
      ws.open()
      // Send a valid JSON object with an unknown type
      ws.receive(JSON.stringify({ type: 'unknown_message', payload: 'something' }))
    })

    // State should remain unchanged
    expect(result.current.pool).toEqual([])
    expect(result.current.events['supervisor']).toHaveLength(0)
  })

  it('delay doubles on consecutive failures', () => {
    renderHook(() => useAgentEvents())
    const ws0 = MockWebSocket.instances[0]

    // attempt 0 → delay = 1000ms
    act(() => {
      ws0.open()
      ws0.close()
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(MockWebSocket.instances).toHaveLength(2)

    // attempt 1 → delay = 2000ms
    act(() => {
      MockWebSocket.instances[1].close()
    })

    // 1999ms is not enough
    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(MockWebSocket.instances).toHaveLength(2)

    // 1ms more crosses the 2000ms threshold
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances).toHaveLength(3)
  })

  it('delay caps at MAX_DELAY_MS (30s)', () => {
    renderHook(() => useAgentEvents())

    // Advance through 5 failures (delays: 1s, 2s, 4s, 8s, 16s)
    const delays = [1000, 2000, 4000, 8000, 16000]
    for (const delay of delays) {
      act(() => {
        MockWebSocket.instances[MockWebSocket.instances.length - 1].close()
      })
      act(() => {
        vi.advanceTimersByTime(delay)
      })
    }

    // At attempt 5 the uncapped value would be 32000ms, but it should be capped at 30000ms.
    // So closing now (attempt 5) should schedule a 30000ms delay.
    const countBefore = MockWebSocket.instances.length
    act(() => {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].close()
    })

    // 29999ms is not enough
    act(() => {
      vi.advanceTimersByTime(29999)
    })
    expect(MockWebSocket.instances).toHaveLength(countBefore)

    // 1ms more crosses 30000ms
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances).toHaveLength(countBefore + 1)
  })

  it('successful connection resets attempt counter', () => {
    renderHook(() => useAgentEvents())
    const ws0 = MockWebSocket.instances[0]

    // attempt 0 → delay = 1000ms; open resets counter to 0
    act(() => {
      ws0.open()
      ws0.close()
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Open the second connection to reset the attempt counter
    act(() => {
      MockWebSocket.instances[1].open()
    })

    // Close it — attempt is back at 0, so delay should again be 1000ms
    act(() => {
      MockWebSocket.instances[1].close()
    })

    // 999ms is not enough
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances).toHaveLength(2)

    // 1ms more crosses 1000ms
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances).toHaveLength(3)
  })

  it('accumulates events for an unknown agentId using ?? [] fallback', () => {
    const { result } = renderHook(() => useAgentEvents())
    const ws = MockWebSocket.instances[0]

    act(() => {
      ws.open()
    })

    // Send an event for an agent ID not in the initial state — triggers the `?? []` fallback
    const msg: ServerMessage = {
      type: 'agent_event',
      agentId: 'worker-99' as AgentId,
      event: { kind: 'text_delta', text: 'surprise' },
    }

    act(() => {
      ws.receive(JSON.stringify(msg))
    })

    expect((result.current.events as Record<string, AgentEvent[]>)['worker-99']).toHaveLength(1)
  })
})
