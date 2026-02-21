import { describe, it, expect, vi } from 'vitest'

vi.mock('../server/nats.ts', () => ({
  getNatsConnection: vi.fn(() => Promise.resolve({ publish: vi.fn(), subscribe: vi.fn() })),
  TOPIC_SUPERVISOR: 'epik.supervisor',
  TOPIC_WORKER_0: 'epik.worker.0',
  TOPIC_WORKER_1: 'epik.worker.1',
  TOPIC_WORKER_2: 'epik.worker.2',
  TOPIC_LOG: 'epik.log',
}))

vi.mock('../server/agentPool.ts', () => ({
  createAgentPool: vi.fn(() =>
    Promise.resolve({
      getPool: vi.fn(() => []),
      registerListener: vi.fn(() => () => {}),
      injectMessage: vi.fn(),
      interrupt: vi.fn(),
    }),
  ),
}))

import { app } from '../server'

describe('project scaffold', () => {
  it('exports an express app', () => {
    expect(app).toBeDefined()
    expect(typeof app).toBe('function')
  })
})
