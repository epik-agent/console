import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentEvent } from '../client/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal async iterable from an array of SDK message objects. */
function makeIterator(messages: unknown[]): AsyncIterable<unknown> & { interrupt?: () => void } {
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
const sdkMockBase: Record<string, (...args: unknown[]) => unknown> = {
  createSdkMcpServer: () => ({ type: 'sdk', name: 'nats', instance: {} }),
  tool: () => ({}),
}

/** Collect all events sent via the `send` callback into an array. */
async function collect(
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

  // Mock the claude-agent-sdk query function
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAgent', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('emits turn_end after an empty stream', async () => {
    const events = await collect([])
    expect(events).toEqual([{ kind: 'turn_end' }])
  })

  it('emits text_delta for content_block_delta stream events', async () => {
    const messages = [
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello, world!' },
        },
      },
    ]
    const events = await collect(messages)
    expect(events).toContainEqual({ kind: 'text_delta', text: 'Hello, world!' })
    expect(events).toContainEqual({ kind: 'turn_end' })
  })

  it('ignores stream events that are not text_delta', async () => {
    const messages = [
      {
        type: 'stream_event',
        event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      },
    ]
    const events = await collect(messages)
    expect(events).toEqual([{ kind: 'turn_end' }])
  })

  it('emits tool_use for assistant messages with tool_use blocks', async () => {
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
            { type: 'text', text: 'doing stuff' },
          ],
        },
      },
    ]
    const events = await collect(messages)
    expect(events).toContainEqual({ kind: 'tool_use', name: 'Bash', input: { command: 'ls' } })
    // text blocks in assistant messages are not emitted as separate events (text_delta comes via stream_event)
    expect(events.filter((e) => e.kind === 'tool_use')).toHaveLength(1)
  })

  it('emits tool_result for user messages with tool_result blocks', async () => {
    const messages = [
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', content: 'command output' }],
        },
      },
    ]
    const events = await collect(messages)
    expect(events).toContainEqual({ kind: 'tool_result', content: 'command output' })
  })

  it('emits compaction for user messages with compaction summaries', async () => {
    const messages = [
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'text',
              text: 'some text with <parameter name="summary">compact summary</parameter>',
            },
          ],
        },
      },
    ]
    const events = await collect(messages)
    expect(events).toContainEqual({
      kind: 'compaction',
      summary: 'some text with <parameter name="summary">compact summary</parameter>',
    })
  })

  it('calls onSessionId with the session_id from the init system message', async () => {
    const { runAgent } = await import('../server/runner.ts')

    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      ...sdkMockBase,
      query: () => makeIterator([{ type: 'system', subtype: 'init', session_id: 'sess-abc-123' }]),
    }))

    const sessionIds: string[] = []
    await runAgent({
      config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: undefined },
      sessionId: undefined,
      prompt: 'test',
      send: () => {},
      onSessionId: (id) => sessionIds.push(id),
      natsClient: { publish: vi.fn() } as unknown as import('nats').NatsConnection,
    })

    expect(sessionIds).toEqual(['sess-abc-123'])
  })

  it('emits error for result messages where is_error is true', async () => {
    const messages = [
      {
        type: 'result',
        subtype: 'error',
        is_error: true,
        errors: ['something went wrong', 'details here'],
      },
    ]
    const events = await collect(messages)
    expect(events).toContainEqual({
      kind: 'error',
      message: 'something went wrong\ndetails here',
    })
  })

  it('emits error with fallback message when errors array is absent', async () => {
    const messages = [{ type: 'result', subtype: 'error', is_error: true }]
    const events = await collect(messages)
    expect(events).toContainEqual({ kind: 'error', message: 'Unknown error' })
  })
})

// ---------------------------------------------------------------------------
// nats_publish interception
// ---------------------------------------------------------------------------

describe('nats_publish interception', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('intercepts nats_publish tool_use and calls nc.publish', async () => {
    const { runAgent } = await import('../server/runner.ts')

    const natsPublishCalls: Array<{ topic: string; data: string }> = []
    const mockNatsClient = {
      publish: vi.fn((topic: string, data: unknown) => {
        const text = typeof data === 'string' ? data : new TextDecoder().decode(data as Uint8Array)
        natsPublishCalls.push({ topic, data: text })
      }),
    }

    // Simulate: assistant emits nats_publish tool_use, then user provides tool_result
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'nats_publish',
              input: { topic: 'epik.supervisor', message: 'hello supervisor' },
            },
          ],
        },
      },
    ]

    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      ...sdkMockBase,
      query: () => makeIterator(messages),
    }))

    const events: AgentEvent[] = []
    await runAgent({
      config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: undefined },
      sessionId: undefined,
      prompt: 'test',
      send: (e) => events.push(e),
      onSessionId: () => {},
      natsClient: mockNatsClient as unknown as import('nats').NatsConnection,
    })

    // nc.publish should have been called with the right topic and message
    expect(natsPublishCalls).toHaveLength(1)
    expect(natsPublishCalls[0].topic).toBe('epik.supervisor')
    expect(natsPublishCalls[0].data).toBe('hello supervisor')
  })

  it('does NOT emit a tool_use event for nats_publish (it is intercepted)', async () => {
    const { runAgent } = await import('../server/runner.ts')

    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'nats_publish',
              input: { topic: 'epik.worker.0', message: 'work on issue 3' },
            },
          ],
        },
      },
    ]

    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      ...sdkMockBase,
      query: () => makeIterator(messages),
    }))

    const events: AgentEvent[] = []
    await runAgent({
      config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: undefined },
      sessionId: undefined,
      prompt: 'test',
      send: (e) => events.push(e),
      onSessionId: () => {},
      natsClient: { publish: vi.fn() } as unknown as import('nats').NatsConnection,
    })

    const toolUseEvents = events.filter((e) => e.kind === 'tool_use')
    expect(toolUseEvents).toHaveLength(0)
  })

  it('emits a tool_use event for non-nats_publish tools (not intercepted)', async () => {
    const { runAgent } = await import('../server/runner.ts')

    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tool-3', name: 'Bash', input: { command: 'ls' } },
            {
              type: 'tool_use',
              id: 'tool-4',
              name: 'nats_publish',
              input: { topic: 'epik.log', message: 'log' },
            },
          ],
        },
      },
    ]

    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      ...sdkMockBase,
      query: () => makeIterator(messages),
    }))

    const events: AgentEvent[] = []
    await runAgent({
      config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: undefined },
      sessionId: undefined,
      prompt: 'test',
      send: (e) => events.push(e),
      onSessionId: () => {},
      natsClient: { publish: vi.fn() } as unknown as import('nats').NatsConnection,
    })

    const toolUseEvents = events.filter((e) => e.kind === 'tool_use')
    expect(toolUseEvents).toHaveLength(1)
    expect(toolUseEvents[0]).toEqual({ kind: 'tool_use', name: 'Bash', input: { command: 'ls' } })
  })

  it('includes nats_publish in the custom tools list passed to query', async () => {
    const { runAgent } = await import('../server/runner.ts')

    let capturedOptions: unknown = null
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      ...sdkMockBase,
      query: (opts: unknown) => {
        capturedOptions = opts
        return makeIterator([])
      },
    }))

    await runAgent({
      config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: undefined },
      sessionId: undefined,
      prompt: 'test',
      send: () => {},
      onSessionId: () => {},
      natsClient: { publish: vi.fn() } as unknown as import('nats').NatsConnection,
    })

    const opts = capturedOptions as { options?: { mcpServers?: Record<string, unknown> } }
    expect(opts?.options?.mcpServers?.['nats']).toBeDefined()
  })
})
