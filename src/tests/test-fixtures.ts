import { vi } from 'vitest'
import type { AgentEvent } from '../client/types.ts'
import type { RunAgentOptions } from '../server/runner.ts'

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
