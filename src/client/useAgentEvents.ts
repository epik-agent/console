import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEvent, AgentId, ConnectionStatus, PoolState, ServerMessage } from './types'

/** Base delay in ms before first reconnect attempt. */
const BASE_DELAY_MS = 1_000
/** Maximum delay in ms between reconnect attempts. */
const MAX_DELAY_MS = 30_000

/**
 * Resolve the WebSocket URL to connect to.
 *
 * - If `VITE_WS_URL` is set, use it directly (for split deploys).
 * - Otherwise build a relative URL from `window.location`.
 */
function resolveWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (env) return env
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

/**
 * Resolve the HTTP API base URL.
 *
 * - If `VITE_API_URL` is set, use it (no trailing slash).
 * - Otherwise use an empty string (relative fetch).
 */
export function resolveApiBase(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined
  return env ? env.replace(/\/+$/, '') : ''
}

/**
 * Return value of {@link useAgentEvents}.
 */
export interface AgentEventsState {
  events: Record<AgentId, AgentEvent[]>
  pool: PoolState
  connectionStatus: ConnectionStatus
  sendMessage: (agentId: AgentId, text: string) => void
  interrupt: (agentId: AgentId) => void
}

/**
 * Opens (and auto-reconnects with exponential backoff) a WebSocket,
 * accumulates incoming {@link AgentEvent}s per agent, and keeps the
 * {@link PoolState} up to date.
 *
 * Exposes a {@link ConnectionStatus} so the UI can show a banner when
 * the backend is unavailable.
 */
export function useAgentEvents(): AgentEventsState {
  const [events, setEvents] = useState<Record<AgentId, AgentEvent[]>>({
    supervisor: [],
    'worker-0': [],
    'worker-1': [],
    'worker-2': [],
  })
  const [pool, setPool] = useState<PoolState>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)

  useEffect(() => {
    let active = true

    function connect() {
      if (!active) return
      setConnectionStatus('connecting')

      let ws: WebSocket
      try {
        ws = new WebSocket(resolveWsUrl())
      } catch {
        // WebSocket constructor can throw if the URL is invalid
        setConnectionStatus('disconnected')
        scheduleReconnect()
        return
      }

      wsRef.current = ws

      ws.onopen = () => {
        if (!active) return
        attemptRef.current = 0
        setConnectionStatus('connected')
      }

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

      ws.onerror = () => {
        // onerror is always followed by onclose; no-op here.
      }

      ws.onclose = () => {
        if (!active) return
        setConnectionStatus('disconnected')
        scheduleReconnect()
      }
    }

    function scheduleReconnect() {
      const delay = Math.min(BASE_DELAY_MS * 2 ** attemptRef.current, MAX_DELAY_MS)
      attemptRef.current += 1
      reconnectTimer.current = setTimeout(connect, delay)
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

  const apiBase = resolveApiBase()

  const sendMessage = useCallback(
    (agentId: AgentId, text: string) => {
      void fetch(`${apiBase}/api/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, text }),
      })
    },
    [apiBase],
  )

  const interrupt = useCallback(
    (agentId: AgentId) => {
      void fetch(`${apiBase}/api/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      })
    },
    [apiBase],
  )

  return { events, pool, connectionStatus, sendMessage, interrupt }
}
