import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { vi } from 'vitest'
import type { AgentEvent, AgentId } from '../client/types.ts'
import type { RunAgentOptions } from '../server/runner.ts'

// ---------------------------------------------------------------------------
// General helpers
// ---------------------------------------------------------------------------

/** Resolve a path relative to the project root and read its contents, or return '' on error. */
const projectRoot = resolve(fileURLToPath(import.meta.url), '../../..')
export function readProjectFile(filename: string): string {
  try {
    return readFileSync(resolve(projectRoot, filename), 'utf-8')
  } catch {
    return ''
  }
}

/** Pause for `ms` milliseconds (lets async event-loop callbacks run). */
export function tick(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Agent pool mock factory
// ---------------------------------------------------------------------------

export type AgentEventListener = (agentId: AgentId, event: AgentEvent) => void

/**
 * Creates a linked (mockListeners, mockAgentPool) pair suitable for use in
 * vi.mock('../server/agentPool.ts') factories.  Call once at module scope,
 * then close over the returned objects inside vi.mock.
 */
export function makeAgentPoolMock(pool: import('../client/types.ts').PoolState = []) {
  const mockListeners = new Set<AgentEventListener>()
  const mockAgentPool = {
    getPool: vi.fn(() => pool),
    registerListener: vi.fn((cb: AgentEventListener) => {
      mockListeners.add(cb)
      return () => mockListeners.delete(cb)
    }),
    injectMessage: vi.fn(),
    interrupt: vi.fn(),
  }
  return { mockListeners, mockAgentPool }
}

// ---------------------------------------------------------------------------
// SDK iterator helpers
// ---------------------------------------------------------------------------

/** Build a minimal async iterable from an array of SDK message objects. */
export function makeIterator(
  messages: unknown[],
): AsyncIterable<unknown> & { interrupt?: () => void } {
  let interrupted = false
  return {
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        async next() {
          if (interrupted || i >= messages.length) return { value: undefined, done: true }
          return { value: messages[i++], done: false }
        },
      }
    },
    interrupt() {
      interrupted = true
    },
  }
}

/** No-op mock for createSdkMcpServer and tool used in all vi.doMock calls. */
export const sdkMockBase: Record<string, (...args: unknown[]) => unknown> = {
  createSdkMcpServer: () => ({ type: 'sdk', name: 'nats', instance: {} }),
  tool: () => ({}),
}

// ---------------------------------------------------------------------------
// collect helper
// ---------------------------------------------------------------------------

export type CollectOptions = {
  /** SDK messages to feed through the iterator. */
  messages: unknown[]
  /** Overrides applied on top of the default RunAgentOptions. */
  opts?: Partial<RunAgentOptions>
  /**
   * Replace the default `query` implementation.  Receives the options object
   * that runAgent passes to query so tests can inspect it, and must return an
   * async iterable (use makeIterator([]) for an empty stream).
   */
  query?: (opts: unknown) => ReturnType<typeof makeIterator>
  /** Intercept nc.publish calls (topic, decoded message text). */
  onPublish?: (topic: string, message: string) => void
}

/**
 * Run a mocked runAgent through the given SDK messages and collect all emitted
 * AgentEvents.  Returns both the events array and the runAgent return value so
 * tests can inspect result.interrupt etc.
 */
export async function collect({
  messages,
  opts = {},
  query,
  onPublish,
}: CollectOptions): Promise<{ events: AgentEvent[]; result: { interrupt?: () => void } }> {
  const { runAgent } = await import('../server/runner.ts')

  const events: AgentEvent[] = []
  const mockNatsClient = {
    publish: vi.fn((topic: string, data: unknown) => {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data as Uint8Array)
      onPublish?.(topic, text)
    }),
  }

  vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
    ...sdkMockBase,
    query: query ?? (() => makeIterator(messages)),
  }))

  const result = await runAgent({
    config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: undefined },
    sessionId: undefined,
    prompt: 'test',
    send: (e) => events.push(e),
    onSessionId: () => {},
    natsClient: mockNatsClient as unknown as import('nats').NatsConnection,
    ...opts,
  })

  return { events, result }
}
