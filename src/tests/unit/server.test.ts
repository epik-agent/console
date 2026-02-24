import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { WebSocket } from 'ws'
import type { PoolState, ServerMessage } from '../../client/types.ts'
import { makeAgentPoolMock } from '../test-fixtures.ts'

// ---------------------------------------------------------------------------
// Mock agentPool module
// ---------------------------------------------------------------------------

const mockPool: PoolState = {
  running: false,
  agents: [
    { id: 'supervisor', role: 'supervisor', status: 'idle', sessionId: undefined },
    { id: 'worker-0', role: 'worker', status: 'idle', sessionId: undefined },
    { id: 'worker-1', role: 'worker', status: 'idle', sessionId: undefined },
    { id: 'worker-2', role: 'worker', status: 'idle', sessionId: undefined },
  ],
}

const { mockListeners, mockAgentPool } = makeAgentPoolMock(mockPool)

vi.mock('../../server/agentPool.ts', () => ({
  createAgentPool: vi.fn(() => Promise.resolve(mockAgentPool)),
}))

// ---------------------------------------------------------------------------
// Mock NATS module
// ---------------------------------------------------------------------------

const mockNatsClient = {
  publish: vi.fn(),
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
}

vi.mock('../../server/nats.ts', () => ({
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

vi.mock('../../server/github.ts', () => ({
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

let serverModule: typeof import('../../server/index.ts')

beforeEach(async () => {
  vi.resetModules()
  mockListeners.clear()
  mockAgentPool.getPool.mockReturnValue(mockPool)
  serverModule = await import('../../server/index.ts')
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

  it('returns 400 when repo param is an empty string', async () => {
    const res = await request(serverModule.app).get('/api/issues?repo=')
    expect(res.status).toBe(400)
  })

  it('returns 400 when repo does not contain a slash', async () => {
    const res = await request(serverModule.app).get('/api/issues?repo=nodash')
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_REPO')
  })

  it('returns 200 with IssueGraph JSON when repo is provided', async () => {
    const res = await request(serverModule.app).get('/api/issues?repo=owner/repo')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ nodes: expect.any(Array) })
  })

  it('returns 500 with a GitHub token message when loadIssueGraph rejects with 401', async () => {
    const { loadIssueGraph } = await import('../../server/github.ts')
    vi.mocked(loadIssueGraph).mockRejectedValueOnce(new Error('Request failed with status 401'))

    const res = await request(serverModule.app).get('/api/issues?repo=owner/repo')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('GITHUB_AUTH_ERROR')
    expect(res.body.message).toMatch(/GH_TOKEN/)
  })

  it('returns 500 with a GitHub token message when loadIssueGraph rejects with Bad credentials', async () => {
    const { loadIssueGraph } = await import('../../server/github.ts')
    vi.mocked(loadIssueGraph).mockRejectedValueOnce(new Error('Bad credentials'))

    const res = await request(serverModule.app).get('/api/issues?repo=owner/repo')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('GITHUB_AUTH_ERROR')
    expect(res.body.message).toMatch(/GH_TOKEN/)
  })

  it('returns 500 with a GitHub token message when loadIssueGraph rejects with GH_TOKEN error', async () => {
    const { loadIssueGraph } = await import('../../server/github.ts')
    vi.mocked(loadIssueGraph).mockRejectedValueOnce(new Error('GH_TOKEN not set'))

    const res = await request(serverModule.app).get('/api/issues?repo=owner/repo')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('GITHUB_AUTH_ERROR')
    expect(res.body.message).toMatch(/GH_TOKEN/)
  })

  it('returns 500 with a GitHub token message when loadIssueGraph rejects with authentication error', async () => {
    const { loadIssueGraph } = await import('../../server/github.ts')
    vi.mocked(loadIssueGraph).mockRejectedValueOnce(new Error('authentication required'))

    const res = await request(serverModule.app).get('/api/issues?repo=owner/repo')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('GITHUB_AUTH_ERROR')
    expect(res.body.message).toMatch(/GH_TOKEN/)
  })

  it('returns 500 with the raw error message for non-auth errors', async () => {
    const { loadIssueGraph } = await import('../../server/github.ts')
    vi.mocked(loadIssueGraph).mockRejectedValueOnce(new Error('Network timeout'))

    const res = await request(serverModule.app).get('/api/issues?repo=owner/repo')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('GITHUB_ERROR')
    expect(res.body.message).toMatch(/Network timeout/)
  })
})

describe('POST /api/start', () => {
  it('returns 200 and publishes to supervisor NATS topic', async () => {
    const res = await request(serverModule.app).post('/api/start').send({})
    expect(res.status).toBe(200)
    expect(mockNatsClient.publish).toHaveBeenCalledWith('epik.supervisor', expect.any(String))
  })

  it('returns 500 when getNatsConnection rejects', async () => {
    const { getNatsConnection } = await import('../../server/nats.ts')
    vi.mocked(getNatsConnection).mockRejectedValueOnce(new Error('NATS unreachable'))

    const res = await request(serverModule.app).post('/api/start').send({})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('NATS_UNAVAILABLE')
    expect(res.body.message).toMatch(/NATS unreachable/)
  })
})

describe('POST /api/stop', () => {
  it('returns 200 and publishes "stop" to supervisor NATS topic', async () => {
    const res = await request(serverModule.app).post('/api/stop').send({})
    expect(res.status).toBe(200)
    expect(mockNatsClient.publish).toHaveBeenCalledWith('epik.supervisor', 'stop')
  })

  it('returns 500 when getNatsConnection rejects', async () => {
    const { getNatsConnection } = await import('../../server/nats.ts')
    vi.mocked(getNatsConnection).mockRejectedValueOnce(new Error('NATS unreachable'))

    const res = await request(serverModule.app).post('/api/stop').send({})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('NATS_UNAVAILABLE')
    expect(res.body.message).toMatch(/NATS unreachable/)
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

  it('POST /api/message does not broadcast an inject event to WebSocket clients', async () => {
    await new Promise<void>((resolve, reject) => {
      serverModule.server.listen(0, () => {
        const addr = serverModule.server.address() as { port: number }
        const ws = new WebSocket(`ws://localhost:${addr.port}/ws`)

        const received: ServerMessage[] = []

        ws.on('message', async (data) => {
          const msg: ServerMessage = JSON.parse(data.toString())
          received.push(msg)

          // After pool_state arrives, POST a message and wait to see if an inject echoes back
          if (msg.type === 'pool_state') {
            await request(serverModule.app)
              .post('/api/message')
              .send({ agentId: 'supervisor', text: 'hello' })

            // Wait long enough for any echo to arrive
            await new Promise((r) => setTimeout(r, 200))

            const injectEvents = received.filter(
              (m) => m.type === 'agent_event' && m.event.kind === 'inject',
            )
            expect(injectEvents).toHaveLength(0)
            ws.close()
            resolve()
          }
        })

        ws.on('error', reject)
      })
    })
  })

  it('does not send events to a closed WebSocket client', async () => {
    // This test verifies the ws.readyState === WebSocket.OPEN guard in the listener.
    // We connect, wait for the pool_state, then close from the server side via wss,
    // and fire an agent event — the guard should suppress the send without throwing.
    await new Promise<void>((resolve, reject) => {
      serverModule.server.listen(0, () => {
        const addr = serverModule.server.address() as { port: number }
        const ws = new WebSocket(`ws://localhost:${addr.port}/ws`)

        ws.on('message', () => {
          // Close all server-side connections directly via wss to ensure readyState is CLOSED
          serverModule.wss.clients.forEach((client) => client.terminate())
        })

        ws.on('close', () => {
          // Now fire an event — the server-side ws should be CLOSED
          for (const cb of mockListeners) {
            // This should NOT throw even though the WS is closed
            cb('worker-0', { kind: 'turn_end' })
          }
          resolve()
        })

        ws.on('error', reject)
      })
    })
  })
})
