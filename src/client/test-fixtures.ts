import { vi } from 'vitest'
import type { AgentEvent, AgentId, PoolState } from './types'

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
export const defaultPool: PoolState = {
  running: false,
  agents: [
    { id: 'supervisor', role: 'supervisor', status: 'idle', sessionId: undefined },
    { id: 'worker-0', role: 'worker', status: 'idle', sessionId: undefined },
    { id: 'worker-1', role: 'worker', status: 'busy', sessionId: 'abc' },
    { id: 'worker-2', role: 'worker', status: 'idle', sessionId: undefined },
  ],
}

/** Default useAgentEvents mock return value. */
export function makeUseAgentEventsMock() {
  return {
    events: makeEvents(),
    pool: { running: false, agents: [] } as PoolState,
    connectionStatus: 'connected' as const,
    sendMessage: vi.fn(),
    interrupt: vi.fn(),
  }
}
