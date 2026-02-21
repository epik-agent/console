import { describe, it, expect, afterAll } from 'vitest'

// These tests require a running nats-server on localhost:4222
// Run: nats-server &

describe('nats module', () => {
  it('exports topic constants matching architecture spec', async () => {
    const { TOPIC_SUPERVISOR, TOPIC_WORKER_0, TOPIC_WORKER_1, TOPIC_WORKER_2, TOPIC_LOG } =
      await import('../server/nats.ts')

    expect(TOPIC_SUPERVISOR).toBe('epik.supervisor')
    expect(TOPIC_WORKER_0).toBe('epik.worker.0')
    expect(TOPIC_WORKER_1).toBe('epik.worker.1')
    expect(TOPIC_WORKER_2).toBe('epik.worker.2')
    expect(TOPIC_LOG).toBe('epik.log')
  })

  it('getNatsConnection() returns a connected NatsConnection', async () => {
    const { getNatsConnection } = await import('../server/nats.ts')
    const nc = await getNatsConnection()
    expect(nc).toBeDefined()
    expect(nc.isClosed()).toBe(false)
  })

  it('getNatsConnection() returns the same singleton on repeated calls', async () => {
    const { getNatsConnection } = await import('../server/nats.ts')
    const nc1 = await getNatsConnection()
    const nc2 = await getNatsConnection()
    expect(nc1).toBe(nc2)
  })

  it('can publish and receive a message via the singleton connection', async () => {
    const { getNatsConnection, TOPIC_LOG } = await import('../server/nats.ts')
    const nc = await getNatsConnection()

    const sub = nc.subscribe(TOPIC_LOG)
    const received: string[] = []

    const collectPromise = sub[Symbol.asyncIterator]().next().then((r) => {
      if (!r.done) received.push(r.value.string())
    })

    nc.publish(TOPIC_LOG, 'hello from test')
    await collectPromise

    expect(received).toEqual(['hello from test'])
  })

  afterAll(async () => {
    // Close the singleton so the test process can exit cleanly
    const { closeNatsConnection } = await import('../server/nats.ts')
    await closeNatsConnection()
  })
})
