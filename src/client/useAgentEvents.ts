import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEvent, AgentId, PoolState, ServerMessage } from './types'

/** Milliseconds to wait before attempting a WebSocket reconnect after a close. */
const RECONNECT_DELAY_MS = 1000

/**
 * Return value of {@link useAgentEvents}.
 *
 * Provides the live event stream, pool snapshot, and imperative callbacks for
 * sending messages and interrupting in-progress agent turns.
 */
export interface AgentEventsState {
  /** All events received per agent since the WebSocket connected, in arrival order. */
  events: Record<AgentId, AgentEvent[]>
  /** Most recent pool state snapshot pushed by the server. */
  pool: PoolState
  /**
   * POST `/api/message` — injects `text` as a user turn into the specified agent.
   *
   * @param agentId - Target agent.
   * @param text    - Message body.
   */
  sendMessage: (agentId: AgentId, text: string) => void
  /**
   * POST `/api/interrupt` — cancels the in-progress turn of the specified agent.
   *
   * @param agentId - Target agent.
   */
  interrupt: (agentId: AgentId) => void
}

/**
 * Opens (and auto-reconnects) a WebSocket to `/ws`, accumulates incoming
 * {@link AgentEvent}s per agent, and keeps the {@link PoolState} up to date.
 *
 * The WebSocket is closed when the component using this hook unmounts.
 */
export function useAgentEvents(): AgentEventsState {
  const [events, setEvents] = useState<Record<AgentId, AgentEvent[]>>({
    supervisor: [],
    'worker-0': [],
    'worker-1': [],
    'worker-2': [],
  })
  const [pool, setPool] = useState<PoolState>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let active = true

    function connect() {
      if (!active) return
      const ws = new WebSocket('/ws')
      wsRef.current = ws

      ws.onmessage = (event: MessageEvent<string>) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(event.data) as ServerMessage
        } catch {
          return
        }

        if (msg.type === 'pool_state') {
          setPool(msg.pool)
        } else if (msg.type === 'agent_event') {
          const { agentId, event: agentEvent } = msg
          setEvents((prev) => ({
            ...prev,
            [agentId]: [...(prev[agentId] ?? []), agentEvent],
          }))
        }
      }

      ws.onclose = () => {
        if (!active) return
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      active = false
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current)
      }
      wsRef.current?.close()
    }
  }, [])

  const sendMessage = useCallback((agentId: AgentId, text: string) => {
    void fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, text }),
    })
  }, [])

  const interrupt = useCallback((agentId: AgentId) => {
    void fetch('/api/interrupt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    })
  }, [])

  return { events, pool, sendMessage, interrupt }
}
