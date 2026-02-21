/**
 * NATS connection singleton and topic constants.
 *
 * All server-side code that needs to publish or subscribe to NATS should
 * obtain the connection via {@link getNatsConnection} rather than calling
 * `nats.connect()` directly, so that the process shares a single underlying
 * TCP connection.
 *
 * The module installs a `SIGINT` handler that drains the connection before
 * the process exits, ensuring in-flight messages are not dropped.
 */
import { connect } from 'nats'
import type { NatsConnection } from 'nats'

/** NATS topic for messages addressed to the Supervisor agent. */
export const TOPIC_SUPERVISOR = 'epik.supervisor'
/** NATS topic for messages addressed to Worker 0. */
export const TOPIC_WORKER_0 = 'epik.worker.0'
/** NATS topic for messages addressed to Worker 1. */
export const TOPIC_WORKER_1 = 'epik.worker.1'
/** NATS topic for messages addressed to Worker 2. */
export const TOPIC_WORKER_2 = 'epik.worker.2'
/** NATS topic used by all agents to emit log/event records for persistence. */
export const TOPIC_LOG = 'epik.log'

/** Module-level NATS connection — lazily created and reused across callers. */
let connection: NatsConnection | null = null

/**
 * Returns the shared NATS connection, creating it if it does not yet exist or
 * has been closed.
 *
 * Connects to `nats://localhost:4222` by default.
 */
export async function getNatsConnection(): Promise<NatsConnection> {
  if (connection === null || connection.isClosed()) {
    connection = await connect({ servers: 'nats://localhost:4222' })
  }
  return connection
}

/**
 * Closes the shared NATS connection and resets the module-level singleton.
 *
 * Safe to call when no connection is open (no-op).
 */
export async function closeNatsConnection(): Promise<void> {
  if (connection !== null && !connection.isClosed()) {
    await connection.close()
    connection = null
  }
}

process.on('SIGINT', async () => {
  await closeNatsConnection()
  process.exit(0)
})
