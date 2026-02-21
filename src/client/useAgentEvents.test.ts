import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentEvents } from './useAgentEvents'
import type { AgentId, PoolState, ServerMessage } from './types'

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
    expect(MockWebSocket.instances[0].url).toBe('/ws')
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
})
