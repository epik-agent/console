import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Unit tests for src/server/nats.ts
// These tests mock the `nats` package so no real NATS server is required.
// ---------------------------------------------------------------------------

/** Shared mock connection factory — recreated per test via beforeEach. */
function makeMockConn(closed = false) {
  return {
    isClosed: vi.fn(() => closed),
    close: vi.fn(async () => {}),
    publish: vi.fn(),
  }
}

describe('nats module (unit)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('exports all topic constants', async () => {
    const mockConn = makeMockConn()
    vi.doMock('nats', () => ({ connect: vi.fn(async () => mockConn) }))

    const { TOPIC_SUPERVISOR, TOPIC_WORKER_0, TOPIC_WORKER_1, TOPIC_WORKER_2, TOPIC_LOG } =
      await import('../server/nats.ts')

    expect(TOPIC_SUPERVISOR).toBe('epik.supervisor')
    expect(TOPIC_WORKER_0).toBe('epik.worker.0')
    expect(TOPIC_WORKER_1).toBe('epik.worker.1')
    expect(TOPIC_WORKER_2).toBe('epik.worker.2')
    expect(TOPIC_LOG).toBe('epik.log')
  })

  it('getNatsConnection() creates and returns a connection', async () => {
    const mockConn = makeMockConn()
    const mockConnect = vi.fn(async () => mockConn)
    vi.doMock('nats', () => ({ connect: mockConnect }))

    const { getNatsConnection } = await import('../server/nats.ts')
    const conn = await getNatsConnection()

    expect(mockConnect).toHaveBeenCalledOnce()
    expect(conn).toBe(mockConn)
  })

  it('getNatsConnection() reuses the same connection on repeated calls', async () => {
    const mockConn = makeMockConn()
    const mockConnect = vi.fn(async () => mockConn)
    vi.doMock('nats', () => ({ connect: mockConnect }))

    const { getNatsConnection } = await import('../server/nats.ts')
    const first = await getNatsConnection()
    const second = await getNatsConnection()

    expect(first).toBe(second)
    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it('getNatsConnection() reconnects when the existing connection is closed', async () => {
    const closedConn = makeMockConn(true)
    const freshConn = makeMockConn(false)
    const mockConnect = vi.fn().mockResolvedValueOnce(closedConn).mockResolvedValueOnce(freshConn)
    vi.doMock('nats', () => ({ connect: mockConnect }))

    const { getNatsConnection } = await import('../server/nats.ts')

    // First call — returns closedConn
    const first = await getNatsConnection()
    expect(first).toBe(closedConn)

    // Simulate the connection being closed between calls
    closedConn.isClosed.mockReturnValue(true)

    // Second call — should reconnect and return freshConn
    const second = await getNatsConnection()
    expect(second).toBe(freshConn)
    expect(mockConnect).toHaveBeenCalledTimes(2)
  })

  it('closeNatsConnection() drains and nulls the connection', async () => {
    const mockConn = makeMockConn()
    vi.doMock('nats', () => ({ connect: vi.fn(async () => mockConn) }))

    const { getNatsConnection, closeNatsConnection } = await import('../server/nats.ts')

    await getNatsConnection()
    await closeNatsConnection()

    expect(mockConn.close).toHaveBeenCalledOnce()

    // After closing, a new call should reconnect (verified via the separate reconnect test)
    expect(mockConn.close).toHaveBeenCalledTimes(1)
  })

  it('closeNatsConnection() is a no-op when no connection is open', async () => {
    const mockConnect = vi.fn()
    vi.doMock('nats', () => ({ connect: mockConnect }))

    const { closeNatsConnection } = await import('../server/nats.ts')

    // Should not throw
    await expect(closeNatsConnection()).resolves.toBeUndefined()
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('closeNatsConnection() is a no-op when connection is already closed', async () => {
    const mockConn = makeMockConn()
    vi.doMock('nats', () => ({ connect: vi.fn(async () => mockConn) }))

    const { getNatsConnection, closeNatsConnection } = await import('../server/nats.ts')
    await getNatsConnection()

    // Mark connection as already closed
    mockConn.isClosed.mockReturnValue(true)

    await closeNatsConnection()
    expect(mockConn.close).not.toHaveBeenCalled()
  })

  it('uses NATS_URL env variable when set', async () => {
    const mockConn = makeMockConn()
    const mockConnect = vi.fn(async () => mockConn)
    vi.doMock('nats', () => ({ connect: mockConnect }))

    const originalUrl = process.env['NATS_URL']
    process.env['NATS_URL'] = 'nats://custom-host:5222'

    try {
      const { getNatsConnection } = await import('../server/nats.ts')
      await getNatsConnection()

      expect(mockConnect).toHaveBeenCalledWith({ servers: 'nats://custom-host:5222' })
    } finally {
      if (originalUrl === undefined) {
        delete process.env['NATS_URL']
      } else {
        process.env['NATS_URL'] = originalUrl
      }
    }
  })

  it('defaults to nats://localhost:4222 when NATS_URL is not set', async () => {
    const mockConn = makeMockConn()
    const mockConnect = vi.fn(async () => mockConn)
    vi.doMock('nats', () => ({ connect: mockConnect }))

    const originalUrl = process.env['NATS_URL']
    delete process.env['NATS_URL']

    try {
      const { getNatsConnection } = await import('../server/nats.ts')
      await getNatsConnection()

      expect(mockConnect).toHaveBeenCalledWith({ servers: 'nats://localhost:4222' })
    } finally {
      if (originalUrl !== undefined) {
        process.env['NATS_URL'] = originalUrl
      }
    }
  })

  it('closeNatsConnection() sets connection to null so the next call reconnects', async () => {
    const mockConn = makeMockConn()
    const mockConn2 = makeMockConn()
    const mockConnect = vi.fn().mockResolvedValueOnce(mockConn).mockResolvedValueOnce(mockConn2)
    vi.doMock('nats', () => ({ connect: mockConnect }))

    const { getNatsConnection, closeNatsConnection } = await import('../server/nats.ts')

    const first = await getNatsConnection()
    expect(first).toBe(mockConn)

    await closeNatsConnection()
    expect(mockConn.close).toHaveBeenCalledOnce()

    // After closing, getNatsConnection should create a new connection
    const second = await getNatsConnection()
    expect(second).toBe(mockConn2)
    expect(mockConnect).toHaveBeenCalledTimes(2)
  })

  it('SIGINT handler closes the connection and calls process.exit', async () => {
    const mockConn = makeMockConn()
    vi.doMock('nats', () => ({ connect: vi.fn(async () => mockConn) }))

    // Spy on process.exit to prevent the test process from actually exiting.
    // We use a no-op instead of throwing so the async handler doesn't
    // produce an unhandled rejection.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)

    const { getNatsConnection } = await import('../server/nats.ts')
    await getNatsConnection()

    process.emit('SIGINT', 'SIGINT')

    // Give the async SIGINT handler a chance to run
    await new Promise((r) => setTimeout(r, 20))

    expect(mockConn.close).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)

    exitSpy.mockRestore()
  })
})
