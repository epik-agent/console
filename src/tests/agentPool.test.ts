import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentEvent, AgentId } from '../client/types.ts'
import type { RunAgentOptions } from '../server/runner.ts'
import { tick } from './test-fixtures.ts'

// ---------------------------------------------------------------------------
// Mock runner module
// ---------------------------------------------------------------------------

let runAgentImpl: (opts: RunAgentOptions) => Promise<{ interrupt?: () => void }> = async () => ({})

vi.mock('../server/runner.ts', () => ({
  runAgent: (opts: RunAgentOptions) => runAgentImpl(opts),
}))

// ---------------------------------------------------------------------------
// Mock NATS module
// ---------------------------------------------------------------------------

type MockSubscription = {
  topic: string
  handler: (msg: { data: Uint8Array }) => void
}

const mockSubscriptions: MockSubscription[] = []
const mockNatsClient = {
  subscribe: vi.fn(
    (topic: string, opts: { callback: (err: unknown, msg: { data: Uint8Array }) => void }) => {
      const handler = (msg: { data: Uint8Array }) => opts.callback(null, msg)
      mockSubscriptions.push({ topic, handler })
      return { unsubscribe: vi.fn() }
    },
  ),
  publish: vi.fn(),
}

vi.mock('../server/nats.ts', () => ({
  getNatsConnection: vi.fn(() => Promise.resolve(mockNatsClient)),
  TOPIC_SUPERVISOR: 'epik.supervisor',
  TOPIC_WORKER_0: 'epik.worker.0',
  TOPIC_WORKER_1: 'epik.worker.1',
  TOPIC_WORKER_2: 'epik.worker.2',
  TOPIC_LOG: 'epik.log',
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerNatsMessage(topic: string, text: string) {
  const encoder = new TextEncoder()
  const sub = mockSubscriptions.find((s) => s.topic === topic)
  sub?.handler({ data: encoder.encode(text) })
}

async function makePool() {
  const { createAgentPool } = await import('../server/agentPool.ts')
  return createAgentPool()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agentPool', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSubscriptions.length = 0
    runAgentImpl = async () => ({})
  })

  it('initialises with 1 supervisor and 3 workers', async () => {
    const pool = await makePool()
    const state = pool.getPool()

    expect(state).toHaveLength(4)
    const supervisor = state.find((w) => w.id === 'supervisor')
    expect(supervisor).toBeDefined()
    expect(supervisor?.role).toBe('supervisor')

    const workers = state.filter((w) => w.role === 'worker')
    expect(workers).toHaveLength(3)
    expect(workers.map((w) => w.id).sort()).toEqual(['worker-0', 'worker-1', 'worker-2'])
  })

  it('initialises all agents with idle status', async () => {
    const pool = await makePool()
    for (const agent of pool.getPool()) {
      expect(agent.status).toBe('idle')
    }
  })

  it('initialises all agents with undefined sessionId', async () => {
    const pool = await makePool()
    for (const agent of pool.getPool()) {
      expect(agent.sessionId).toBeUndefined()
    }
  })

  it('registers NATS subscriptions for all four agent topics', async () => {
    await makePool()
    const topics = mockSubscriptions.map((s) => s.topic).sort()
    expect(topics).toEqual(['epik.supervisor', 'epik.worker.0', 'epik.worker.1', 'epik.worker.2'])
  })

  it('transitions agent status idle → busy when a NATS message arrives', async () => {
    let resolveTurn: (() => void) | undefined
    runAgentImpl = () =>
      new Promise<{ interrupt?: () => void }>((resolve) => {
        resolveTurn = () => resolve({})
      })

    const pool = await makePool()

    expect(pool.getPool().find((w) => w.id === 'supervisor')?.status).toBe('idle')

    triggerNatsMessage('epik.supervisor', 'hello supervisor')
    await tick()

    expect(pool.getPool().find((w) => w.id === 'supervisor')?.status).toBe('busy')

    resolveTurn!()
    await tick()

    expect(pool.getPool().find((w) => w.id === 'supervisor')?.status).toBe('idle')
  })

  it('transitions worker status idle → busy → idle on message', async () => {
    let resolveTurn: (() => void) | undefined
    runAgentImpl = () =>
      new Promise<{ interrupt?: () => void }>((resolve) => {
        resolveTurn = () => resolve({})
      })

    const pool = await makePool()

    expect(pool.getPool().find((w) => w.id === 'worker-1')?.status).toBe('idle')

    triggerNatsMessage('epik.worker.1', 'work on issue 5')
    await tick()

    expect(pool.getPool().find((w) => w.id === 'worker-1')?.status).toBe('busy')

    resolveTurn!()
    await tick()

    expect(pool.getPool().find((w) => w.id === 'worker-1')?.status).toBe('idle')
  })

  it('broadcasts AgentEvents to registered listeners', async () => {
    const capturedEvents: Array<{ agentId: AgentId; event: AgentEvent }> = []

    runAgentImpl = async (opts: RunAgentOptions) => {
      opts.send({ kind: 'text_delta', text: 'hello' })
      opts.send({ kind: 'turn_end' })
      return {}
    }

    const pool = await makePool()
    pool.registerListener((agentId, event) => capturedEvents.push({ agentId, event }))

    triggerNatsMessage('epik.supervisor', 'start')
    await tick(50)

    expect(capturedEvents).toContainEqual({
      agentId: 'supervisor',
      event: { kind: 'text_delta', text: 'hello' },
    })
    expect(capturedEvents).toContainEqual({
      agentId: 'supervisor',
      event: { kind: 'turn_end' },
    })
  })

  it('broadcasts events to all registered listeners', async () => {
    runAgentImpl = async (opts: RunAgentOptions) => {
      opts.send({ kind: 'turn_end' })
      return {}
    }

    const pool = await makePool()

    const results1: AgentEvent[] = []
    const results2: AgentEvent[] = []
    pool.registerListener((_id, event) => results1.push(event))
    pool.registerListener((_id, event) => results2.push(event))

    triggerNatsMessage('epik.worker.0', 'work')
    await tick(50)

    expect(results1).toContainEqual({ kind: 'turn_end' })
    expect(results2).toContainEqual({ kind: 'turn_end' })
  })

  it('unregisters a listener when the returned function is called', async () => {
    runAgentImpl = async (opts: RunAgentOptions) => {
      opts.send({ kind: 'turn_end' })
      return {}
    }

    const pool = await makePool()

    const results: AgentEvent[] = []
    const unregister = pool.registerListener((_id, event) => results.push(event))
    unregister()

    triggerNatsMessage('epik.supervisor', 'go')
    await tick(50)

    expect(results).toHaveLength(0)
  })

  it('injectMessage triggers runAgent for the specified agent', async () => {
    const prompts: string[] = []
    runAgentImpl = async (opts: RunAgentOptions) => {
      prompts.push(opts.prompt)
      return {}
    }

    const pool = await makePool()

    pool.injectMessage('worker-2', 'injected text')
    await tick(50)

    expect(prompts).toContain('injected text')
  })

  it('injectMessage broadcasts an inject event to listeners', async () => {
    runAgentImpl = async () => ({})

    const pool = await makePool()

    const events: Array<{ agentId: AgentId; event: AgentEvent }> = []
    pool.registerListener((agentId, event) => events.push({ agentId, event }))

    pool.injectMessage('worker-0', 'injected text')
    await tick(50)

    expect(events).toContainEqual({
      agentId: 'worker-0',
      event: { kind: 'inject', text: 'injected text' },
    })
  })

  it('interrupt calls the interrupt function provided via onInterruptReady', async () => {
    const interrupted: string[] = []

    // runAgentImpl is long-running; it calls onInterruptReady immediately, then waits
    runAgentImpl = (opts: RunAgentOptions) =>
      new Promise<{ interrupt?: () => void }>((resolve) => {
        // Expose interrupt handle immediately
        opts.onInterruptReady?.(() => {
          interrupted.push('worker-2')
          resolve({})
        })
        // Turn would normally run for a long time; resolve above handles it
      })

    const pool = await makePool()

    // Start a turn on worker-2
    triggerNatsMessage('epik.worker.2', 'start work')
    await tick()

    // Interrupt while busy
    pool.interrupt('worker-2')
    await tick()

    expect(interrupted).toContain('worker-2')
  })

  it('stores the sessionId returned by onSessionId callback', async () => {
    runAgentImpl = async (opts: RunAgentOptions) => {
      opts.onSessionId('session-abc-123')
      return {}
    }

    const pool = await makePool()

    triggerNatsMessage('epik.supervisor', 'go')
    await tick(50)

    const supervisor = pool.getPool().find((w) => w.id === 'supervisor')
    expect(supervisor?.sessionId).toBe('session-abc-123')
  })

  it('reuses sessionId on subsequent turns for the same agent', async () => {
    const capturedSessionIds: Array<string | undefined> = []
    runAgentImpl = async (opts: RunAgentOptions) => {
      capturedSessionIds.push(opts.sessionId)
      opts.onSessionId('sess-xyz')
      return {}
    }

    const pool = await makePool()

    triggerNatsMessage('epik.supervisor', 'first message')
    await tick(50)

    triggerNatsMessage('epik.supervisor', 'second message')
    await tick(50)

    expect(capturedSessionIds[0]).toBeUndefined()
    expect(capturedSessionIds[1]).toBe('sess-xyz')
    expect(pool.getPool().find((w) => w.id === 'supervisor')?.sessionId).toBe('sess-xyz')
  })
})
