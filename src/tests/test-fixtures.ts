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
// runAgent helpers
// ---------------------------------------------------------------------------

/** Default runAgent options — override only what each test needs. */
export function makeRunAgentOpts(
  overrides: Partial<RunAgentOptions> = {},
): RunAgentOptions {
  return {
    config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: undefined },
    sessionId: undefined,
    prompt: 'test',
    send: () => {},
    onSessionId: () => {},
    natsClient: makeNatsClient() as unknown as import('nats').NatsConnection,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// NATS client mock
// ---------------------------------------------------------------------------

/** Build a minimal mock NATS client. */
export function makeNatsClient() {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  }
}

// ---------------------------------------------------------------------------
// collect helper
// ---------------------------------------------------------------------------

/**
 * Run a mocked runAgent through the given SDK messages and collect all emitted
 * AgentEvents.  Optionally intercepts nc.publish calls via the natsPublish hook.
 */
export async function collect(
  messages: unknown[],
  natsPublish?: (topic: string, message: string) => void,
): Promise<AgentEvent[]> {
  const { runAgent } = await import('../server/runner.ts')

  const events: AgentEvent[] = []
  const mockNatsClient = {
    publish: vi.fn((topic: string, data: unknown) => {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data as Uint8Array)
      natsPublish?.(topic, text)
    }),
  }

  vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
    ...sdkMockBase,
    query: () => makeIterator(messages),
  }))

  await runAgent({
    config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: undefined },
    sessionId: undefined,
    prompt: 'test prompt',
    send: (e) => events.push(e),
    onSessionId: () => {},
    natsClient: mockNatsClient as unknown as import('nats').NatsConnection,
  })

  return events
}
