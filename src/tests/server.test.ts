import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { WebSocket } from 'ws'
import type { AgentId, AgentEvent, PoolState, ServerMessage } from '../client/types.ts'

// ---------------------------------------------------------------------------
// Mock agentPool module
// ---------------------------------------------------------------------------

type AgentEventListener = (agentId: AgentId, event: AgentEvent) => void

const mockListeners = new Set<AgentEventListener>()

const mockPool: PoolState = [
  { id: 'supervisor', role: 'supervisor', status: 'idle', sessionId: undefined },
  { id: 'worker-0', role: 'worker', status: 'idle', sessionId: undefined },
  { id: 'worker-1', role: 'worker', status: 'idle', sessionId: undefined },
  { id: 'worker-2', role: 'worker', status: 'idle', sessionId: undefined },
]

const mockAgentPool = {
  getPool: vi.fn(() => mockPool),
  registerListener: vi.fn((cb: AgentEventListener) => {
    mockListeners.add(cb)
    return () => mockListeners.delete(cb)
  }),
  injectMessage: vi.fn(),
  interrupt: vi.fn(),
}

vi.mock('../server/agentPool.ts', () => ({
  createAgentPool: vi.fn(() => Promise.resolve(mockAgentPool)),
}))

// ---------------------------------------------------------------------------
// Mock NATS module
// ---------------------------------------------------------------------------

const mockNatsClient = {
  publish: vi.fn(),
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
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
// Mock github module
// ---------------------------------------------------------------------------

vi.mock('../server/github.ts', () => ({
  loadIssueGraph: vi.fn(() =>
    Promise.resolve({
      nodes: [
        {
          number: 1,
          title: 'Test issue',
          state: 'open',
          type: 'Task',
          external: false,
          blockedBy: [],
        },
      ],
    }),
  ),
}))

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let serverModule: typeof import('../server/index.ts')

beforeEach(async () => {
  vi.resetModules()
  mockListeners.clear()
  mockAgentPool.getPool.mockReturnValue(mockPool)
  serverModule = await import('../server/index.ts')
})

afterEach(() => {
  serverModule.server.close()
})

// ---------------------------------------------------------------------------
// REST endpoint tests
// ---------------------------------------------------------------------------

describe('GET /api/pool', () => {
  it('returns 200 with pool state JSON', async () => {
    const res = await request(serverModule.app).get('/api/pool')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(mockPool)
  })
})

describe('GET /api/issues', () => {
  it('returns 400 when repo param is missing', async () => {
    const res = await request(serverModule.app).get('/api/issues')
    expect(res.status).toBe(400)
  })

  it('returns 200 with IssueGraph JSON when repo is provided', async () => {
    const res = await request(serverModule.app).get('/api/issues?repo=owner/repo')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ nodes: expect.any(Array) })
  })
})

describe('POST /api/start', () => {
  it('returns 200 and publishes to supervisor NATS topic', async () => {
    const res = await request(serverModule.app).post('/api/start').send({})
    expect(res.status).toBe(200)
    expect(mockNatsClient.publish).toHaveBeenCalledWith('epik.supervisor', expect.any(String))
  })
})

describe('POST /api/message', () => {
  it('returns 400 when agentId or text is missing', async () => {
    const res = await request(serverModule.app).post('/api/message').send({ agentId: 'supervisor' })
    expect(res.status).toBe(400)
  })

  it('returns 200 and calls injectMessage on the pool', async () => {
    const res = await request(serverModule.app)
      .post('/api/message')
      .send({ agentId: 'supervisor', text: 'hello' })
    expect(res.status).toBe(200)
    expect(mockAgentPool.injectMessage).toHaveBeenCalledWith('supervisor', 'hello')
  })
})

describe('POST /api/interrupt', () => {
  it('returns 400 when agentId is missing', async () => {
    const res = await request(serverModule.app).post('/api/interrupt').send({})
    expect(res.status).toBe(400)
  })

  it('returns 200 and calls interrupt on the pool', async () => {
    const res = await request(serverModule.app).post('/api/interrupt').send({ agentId: 'worker-0' })
    expect(res.status).toBe(200)
    expect(mockAgentPool.interrupt).toHaveBeenCalledWith('worker-0')
  })
})

// ---------------------------------------------------------------------------
// WebSocket tests
// ---------------------------------------------------------------------------

describe('WebSocket /ws', () => {
  it('sends pool_state on connect', async () => {
    await new Promise<void>((resolve, reject) => {
      // Start server listening on a random port for the WS test
      serverModule.server.listen(0, () => {
        const addr = serverModule.server.address() as { port: number }
        const ws = new WebSocket(`ws://localhost:${addr.port}/ws`)

        ws.on('message', (data) => {
          const msg: ServerMessage = JSON.parse(data.toString())
          if (msg.type === 'pool_state') {
            expect(msg.pool).toEqual(mockPool)
            ws.close()
            resolve()
          }
        })

        ws.on('error', reject)
      })
    })
  })

  it('broadcasts agent_event to connected clients', async () => {
    await new Promise<void>((resolve, reject) => {
      serverModule.server.listen(0, () => {
        const addr = serverModule.server.address() as { port: number }
        const ws = new WebSocket(`ws://localhost:${addr.port}/ws`)

        ws.on('message', (data) => {
          const msg: ServerMessage = JSON.parse(data.toString())

          // After receiving pool_state, trigger an agent event
          if (msg.type === 'pool_state') {
            // Broadcast an event via all registered listeners
            for (const cb of mockListeners) {
              cb('supervisor', { kind: 'text_delta', text: 'hello' })
            }
          }

          if (msg.type === 'agent_event') {
            expect(msg.agentId).toBe('supervisor')
            expect(msg.event).toEqual({ kind: 'text_delta', text: 'hello' })
            ws.close()
            resolve()
          }
        })

        ws.on('error', reject)
      })
    })
  })

  it('cleans up listener when client disconnects', async () => {
    const initialListenerCount = mockListeners.size

    await new Promise<void>((resolve, reject) => {
      serverModule.server.listen(0, () => {
        const addr = serverModule.server.address() as { port: number }
        const ws = new WebSocket(`ws://localhost:${addr.port}/ws`)

        ws.on('message', () => {
          // After first message, close the connection
          ws.close()
        })

        ws.on('close', async () => {
          // Give a tick for cleanup
          await new Promise((r) => setTimeout(r, 20))
          expect(mockListeners.size).toBe(initialListenerCount)
          resolve()
        })

        ws.on('error', reject)
      })
    })
  })
})
