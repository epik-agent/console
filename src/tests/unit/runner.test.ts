import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collect, makeIterator, readProjectFile } from '../test-fixtures.ts'

// ---------------------------------------------------------------------------
// githubToken: catch-block coverage
// ---------------------------------------------------------------------------

describe('githubToken catch block', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns undefined when gh auth token throws (catch branch)', async () => {
    // Ensure GH_TOKEN is not set so githubToken doesn't short-circuit.
    const savedGhToken = process.env['GH_TOKEN']
    delete process.env['GH_TOKEN']

    // Point GH_CONFIG_DIR to /tmp which always exists — ensures existsSync returns true.
    // Set PATH to empty so 'gh auth token' fails with ENOENT, triggering the catch block.
    const savedConfigDir = process.env['GH_CONFIG_DIR']
    const savedPath = process.env['PATH']
    process.env['GH_CONFIG_DIR'] = '/tmp'
    process.env['PATH'] = '' // makes 'gh' not found → execSync throws

    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      createSdkMcpServer: () => ({ type: 'sdk', name: 'nats', instance: {} }),
      tool: () => ({}),
      query: () => ({
        [Symbol.asyncIterator]() {
          return {
            async next() {
              return { value: undefined, done: true }
            },
          }
        },
        interrupt() {},
      }),
    }))
    const actualZod = await vi.importActual<typeof import('zod')>('zod')
    vi.doMock('zod', () => actualZod)

    const { runAgent } = await import('../../server/runner.ts')
    const events: string[] = []
    await runAgent({
      config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: undefined },
      sessionId: undefined,
      prompt: 'test',
      send: (e) => events.push(e.kind),
      onSessionId: () => {},
      natsClient: { publish: vi.fn() } as unknown as import('nats').NatsConnection,
    })
    // If we reach here without throwing, githubToken returned undefined gracefully
    expect(events).toContain('turn_end')

    // Restore env vars
    if (savedGhToken !== undefined) process.env['GH_TOKEN'] = savedGhToken
    if (savedConfigDir !== undefined) process.env['GH_CONFIG_DIR'] = savedConfigDir
    else delete process.env['GH_CONFIG_DIR']
    if (savedPath !== undefined) process.env['PATH'] = savedPath
  })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAgent', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('emits turn_end after an empty stream', async () => {
    const { events } = await collect({ messages: [] })
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
    const { events } = await collect({ messages })
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
    const { events } = await collect({ messages })
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
    const { events } = await collect({ messages })
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
    const { events } = await collect({ messages })
    expect(events).toContainEqual({ kind: 'tool_result', content: 'command output' })
  })

  it('emits compaction with fallback defaults when no preceding compact_boundary', async () => {
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
    const { events } = await collect({ messages })
    expect(events).toContainEqual({
      kind: 'compaction',
      summary: 'some text with <parameter name="summary">compact summary</parameter>',
      trigger: 'auto',
      preTokens: 0,
    })
  })

  it('does not emit a compaction event for compact_boundary system message alone', async () => {
    const messages = [
      {
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: { trigger: 'auto', pre_tokens: 50000 },
        uuid: 'uuid-1',
        session_id: 'sess-1',
      },
    ]
    const { events } = await collect({ messages })
    expect(events.filter((e) => e.kind === 'compaction')).toHaveLength(0)
    expect(events).toContainEqual({ kind: 'turn_end' })
  })

  it('emits compaction with SDK metadata when compact_boundary precedes the summary user message', async () => {
    const messages = [
      {
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: { trigger: 'manual', pre_tokens: 75000 },
        uuid: 'uuid-1',
        session_id: 'sess-1',
      },
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
    const { events } = await collect({ messages })
    expect(events).toContainEqual({
      kind: 'compaction',
      summary: 'some text with <parameter name="summary">compact summary</parameter>',
      trigger: 'manual',
      preTokens: 75000,
    })
  })

  it('calls onSessionId with the session_id from the init system message', async () => {
    const sessionIds: string[] = []
    await collect({
      messages: [{ type: 'system', subtype: 'init', session_id: 'sess-abc-123' }],
      opts: { onSessionId: (id) => sessionIds.push(id) },
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
    const { events } = await collect({ messages })
    expect(events).toContainEqual({
      kind: 'error',
      message: 'something went wrong\ndetails here',
    })
  })

  it('emits error with fallback message when errors array is absent', async () => {
    const { events } = await collect({
      messages: [{ type: 'result', subtype: 'error', is_error: true }],
    })
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
    const natsPublishCalls: Array<{ topic: string; data: string }> = []
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

    await collect({
      messages,
      onPublish: (topic, data) => natsPublishCalls.push({ topic, data }),
    })

    expect(natsPublishCalls).toHaveLength(1)
    expect(natsPublishCalls[0].topic).toBe('epik.supervisor')
    expect(natsPublishCalls[0].data).toBe('hello supervisor')
  })

  it('does NOT emit a tool_use event for nats_publish (it is intercepted)', async () => {
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
    const { events } = await collect({ messages })
    expect(events.filter((e) => e.kind === 'tool_use')).toHaveLength(0)
  })

  it('emits a tool_use event for non-nats_publish tools (not intercepted)', async () => {
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
    const { events } = await collect({ messages })
    const toolUseEvents = events.filter((e) => e.kind === 'tool_use')
    expect(toolUseEvents).toHaveLength(1)
    expect(toolUseEvents[0]).toEqual({ kind: 'tool_use', name: 'Bash', input: { command: 'ls' } })
  })

  it('includes nats_publish in the custom tools list passed to query', async () => {
    let capturedOptions: unknown = null
    await collect({
      messages: [],
      query: (opts) => {
        capturedOptions = opts
        return makeIterator([])
      },
    })
    const opts = capturedOptions as { options?: { mcpServers?: Record<string, unknown> } }
    expect(opts?.options?.mcpServers?.['nats']).toBeDefined()
  })

  it('passes systemPrompt to query options when provided', async () => {
    let capturedOptions: unknown = null
    await collect({
      messages: [],
      opts: {
        config: { model: 'claude-sonnet-4-6', cwd: '/tmp', systemPrompt: 'You are a test agent.' },
      },
      query: (opts) => {
        capturedOptions = opts
        return makeIterator([])
      },
    })
    const opts = capturedOptions as { options?: { systemPrompt?: string } }
    expect(opts?.options?.systemPrompt).toBe('You are a test agent.')
  })

  it('passes sessionId as resume option when provided', async () => {
    let capturedOptions: unknown = null
    await collect({
      messages: [],
      opts: { sessionId: 'existing-session-id' },
      query: (opts) => {
        capturedOptions = opts
        return makeIterator([])
      },
    })
    const opts = capturedOptions as { options?: { resume?: string } }
    expect(opts?.options?.resume).toBe('existing-session-id')
  })

  it('invokes onInterruptReady with an interrupt function before the event loop', async () => {
    const interruptFns: Array<() => void> = []
    await collect({
      messages: [],
      opts: { onInterruptReady: (fn) => interruptFns.push(fn) },
    })
    expect(interruptFns).toHaveLength(1)
    expect(() => interruptFns[0]()).not.toThrow()
  })

  it('does not throw when result message has is_error=false', async () => {
    const { events } = await collect({
      messages: [{ type: 'result', subtype: 'success', is_error: false }],
    })
    expect(events).toEqual([{ kind: 'turn_end' }])
  })

  it('ignores user messages with non-object blocks', async () => {
    const messages = [{ type: 'user', message: { content: ['plain string block'] } }]
    const { events } = await collect({ messages })
    expect(events).toEqual([{ kind: 'turn_end' }])
  })

  it('ignores user messages with text blocks that have no summary parameter', async () => {
    const messages = [
      {
        type: 'user',
        message: { content: [{ type: 'text', text: 'regular text without parameter tags' }] },
      },
    ]
    const { events } = await collect({ messages })
    expect(events).toEqual([{ kind: 'turn_end' }])
  })

  it('returns an interrupt function from runAgent', async () => {
    const { result } = await collect({ messages: [] })
    expect(result.interrupt).toBeDefined()
    expect(() => result.interrupt?.()).not.toThrow()
  })

  it('always includes the nats mcp server in mcpServers', async () => {
    let capturedOptions: unknown = null
    await collect({
      messages: [],
      query: (opts) => {
        capturedOptions = opts
        return makeIterator([])
      },
    })
    const opts = capturedOptions as { options?: { mcpServers?: Record<string, unknown> } }
    expect(opts?.options?.mcpServers).toHaveProperty('nats')
  })
})

// ---------------------------------------------------------------------------
// Type guard malformed input handling
// ---------------------------------------------------------------------------

describe('type guard malformed input handling', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('skips nats_publish when input is missing topic field', async () => {
    const publishCalls: unknown[] = []
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'nats_publish', input: { message: 'hello' } }],
        },
      },
    ]
    await collect({ messages, onPublish: (t, m) => publishCalls.push({ t, m }) })
    expect(publishCalls).toHaveLength(0)
  })

  it('skips nats_publish when input message field is not a string', async () => {
    const publishCalls: unknown[] = []
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'nats_publish', input: { topic: 'epik.test', message: 42 } },
          ],
        },
      },
    ]
    await collect({ messages, onPublish: (t, m) => publishCalls.push({ t, m }) })
    expect(publishCalls).toHaveLength(0)
  })

  it('ignores user text block missing text property', async () => {
    const messages = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', summary: '<parameter name="summary">no text key</parameter>' }],
        },
      },
    ]
    const { events } = await collect({ messages })
    expect(events.filter((e) => e.kind === 'compaction')).toHaveLength(0)
    expect(events).toContainEqual({ kind: 'turn_end' })
  })

  it('emits tool_result for tool_result block even when content is unusual', async () => {
    const messages = [
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', content: { nested: 'object' } }],
        },
      },
    ]
    const { events } = await collect({ messages })
    expect(events).toContainEqual({ kind: 'tool_result', content: { nested: 'object' } })
  })
})

// ---------------------------------------------------------------------------
// readProjectFile helper
// ---------------------------------------------------------------------------

describe('readProjectFile', () => {
  it('returns file contents for an existing project file', () => {
    const contents = readProjectFile('package.json')
    // package.json should exist and contain the project name
    expect(contents).toContain('console')
  })

  it('returns empty string for a non-existent file (catch branch)', () => {
    const contents = readProjectFile('this-file-does-not-exist-xyz-abc-123.txt')
    expect(contents).toBe('')
  })
})
