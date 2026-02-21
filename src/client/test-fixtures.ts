import { vi } from 'vitest'
import type { AgentEvent, AgentId, PoolState } from './types'

/** Convert a hex color like "#a0707a" to "rgb(160, 112, 122)" for jsdom comparison. */
export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}

/** Empty no-op callback suitable as a placeholder for onSend / onInterrupt props. */
export const noop = () => {}

/**
 * Build a full events map with empty arrays for all four agents, optionally
 * overriding individual agent entries.
 */
export function makeEvents(
  overrides: Partial<Record<AgentId, AgentEvent[]>> = {},
): Record<AgentId, AgentEvent[]> {
  return {
    supervisor: [],
    'worker-0': [],
    'worker-1': [],
    'worker-2': [],
    ...overrides,
  }
}

/** Standard four-agent pool fixture covering all statuses used in tests. */
export const defaultPool: PoolState = [
  { id: 'supervisor', role: 'supervisor', status: 'idle', sessionId: undefined },
  { id: 'worker-0', role: 'worker', status: 'idle', sessionId: undefined },
  { id: 'worker-1', role: 'worker', status: 'busy', sessionId: 'abc' },
  { id: 'worker-2', role: 'worker', status: 'idle', sessionId: undefined },
]

/** Default useAgentEvents mock return value. */
export function makeUseAgentEventsMock() {
  return {
    events: makeEvents(),
    pool: [],
    sendMessage: vi.fn(),
    interrupt: vi.fn(),
  }
}
