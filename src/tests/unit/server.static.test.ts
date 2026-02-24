import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { PoolState } from '../../client/types.ts'
import { makeAgentPoolMock } from '../test-fixtures.ts'

// ---------------------------------------------------------------------------
// This test file exercises the static-file-serving branch in index.ts by
// making existsSync return true for the dist directory.
// ---------------------------------------------------------------------------

const mockPool: PoolState = [
  { id: 'supervisor', role: 'supervisor', status: 'idle', sessionId: undefined },
]

const { mockListeners, mockAgentPool } = makeAgentPoolMock(mockPool)

vi.mock('../../server/agentPool.ts', () => ({
  createAgentPool: vi.fn(() => Promise.resolve(mockAgentPool)),
}))

vi.mock('../../server/nats.ts', () => ({
  getNatsConnection: vi.fn(() =>
    Promise.resolve({ publish: vi.fn(), subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }),
  ),
  TOPIC_SUPERVISOR: 'epik.supervisor',
  TOPIC_WORKER_0: 'epik.worker.0',
  TOPIC_WORKER_1: 'epik.worker.1',
  TOPIC_WORKER_2: 'epik.worker.2',
  TOPIC_LOG: 'epik.log',
}))

vi.mock('../../server/github.ts', () => ({
  loadIssueGraph: vi.fn(() => Promise.resolve({ nodes: [] })),
}))

// ---------------------------------------------------------------------------
// Mock fs to make existsSync return true for the dist directory check
// ---------------------------------------------------------------------------

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  const mockExistsSync = vi.fn((p: string) => {
    if (p.endsWith('/dist')) return true
    return actual.existsSync(p)
  })
  return {
    ...actual,
    default: { ...actual, existsSync: mockExistsSync },
    existsSync: mockExistsSync,
  }
})

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let serverModule: typeof import('../../server/index.ts')

beforeEach(async () => {
  vi.resetModules()
  mockListeners.clear()
  serverModule = await import('../../server/index.ts')
})

afterEach(() => {
  serverModule.server.close()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('index.ts — static file serving branch', () => {
  it('still responds to API requests when dist directory exists', async () => {
    // When existsSync returns true, express.static is registered.
    // The API routes should still work correctly.
    const res = await request(serverModule.app).get('/api/pool')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(mockPool)
  })
})
