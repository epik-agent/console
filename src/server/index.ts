/**
 * Express + WebSocket server entrypoint (port 3001).
 *
 * Exposes the REST API described in ARCHITECTURE.md and a `/ws` WebSocket
 * endpoint that streams {@link ServerMessage} envelopes to all connected
 * browsers.
 *
 * The module also initialises the agent pool on startup and wires NATS
 * pub/sub to agent turn execution.
 */
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import type { AgentId, ServerMessage } from '../client/types.ts'
import { createAgentPool } from './agentPool.ts'
import { getNatsConnection, TOPIC_SUPERVISOR } from './nats.ts'
import { loadIssueGraph } from './github.ts'

export const app = express()
app.use(express.json())

export const server = createServer(app)
/** WebSocket server mounted at `/ws` on the same HTTP server as the REST API. */
export const wss = new WebSocketServer({ server, path: '/ws' })

// ---------------------------------------------------------------------------
// Agent pool initialisation
// ---------------------------------------------------------------------------

/** Promise that resolves to the fully initialised {@link AgentPool}. */
const poolPromise = createAgentPool()

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

/**
 * `GET /api/issues?repo=owner/repo`
 *
 * Returns the {@link IssueGraph} for the specified repository by calling
 * {@link loadIssueGraph}.
 *
 * Responds with `400` if `repo` is missing or malformed, `500` on upstream
 * errors.
 */
app.get('/api/issues', async (req, res) => {
  const repo = req.query['repo']
  if (typeof repo !== 'string' || !repo) {
    res.status(400).json({ error: 'Missing required query parameter: repo' })
    return
  }
  const [owner, repoName] = repo.split('/')
  if (!owner || !repoName) {
    res.status(400).json({ error: 'repo must be in owner/repo format' })
    return
  }
  try {
    const graph = await loadIssueGraph(owner, repoName)
    res.json(graph)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

/**
 * `GET /api/pool`
 *
 * Returns a {@link PoolState} snapshot — one {@link WorkerState} per agent.
 */
app.get('/api/pool', async (_req, res) => {
  const pool = await poolPromise
  res.json(pool.getPool())
})

/**
 * `POST /api/start`
 *
 * Publishes `"start"` to `epik.supervisor` via NATS, which triggers the
 * Supervisor agent's first turn.
 */
app.post('/api/start', async (_req, res) => {
  try {
    const nc = await getNatsConnection()
    nc.publish(TOPIC_SUPERVISOR, 'start')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

/**
 * `POST /api/message`
 *
 * Body: `{ agentId: AgentId, text: string }`
 *
 * Injects a user message into the specified agent's queue via
 * {@link AgentPool.injectMessage}.
 */
app.post('/api/message', async (req, res) => {
  const { agentId, text } = req.body as { agentId?: AgentId; text?: string }
  if (!agentId || !text) {
    res.status(400).json({ error: 'Missing required fields: agentId, text' })
    return
  }
  const pool = await poolPromise
  pool.injectMessage(agentId, text)
  res.json({ ok: true })
})

/**
 * `POST /api/interrupt`
 *
 * Body: `{ agentId: AgentId }`
 *
 * Cancels the in-progress turn of the specified agent via
 * {@link AgentPool.interrupt}.
 */
app.post('/api/interrupt', async (req, res) => {
  const { agentId } = req.body as { agentId?: AgentId }
  if (!agentId) {
    res.status(400).json({ error: 'Missing required field: agentId' })
    return
  }
  const pool = await poolPromise
  pool.interrupt(agentId)
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

/**
 * `WS /ws`
 *
 * On connection: immediately sends the current {@link PoolState}, then
 * registers a pool listener that forwards every tagged {@link AgentEvent} as a
 * {@link ServerMessage} envelope. The listener is unregistered when the
 * WebSocket closes.
 */
wss.on('connection', async (ws) => {
  const pool = await poolPromise

  // Send current pool state immediately on connect
  const poolStateMsg: ServerMessage = { type: 'pool_state', pool: pool.getPool() }
  ws.send(JSON.stringify(poolStateMsg))

  // Register listener to stream agent events to this client
  const unregister = pool.registerListener((agentId, event) => {
    if (ws.readyState === WebSocket.OPEN) {
      const msg: ServerMessage = { type: 'agent_event', agentId, event }
      ws.send(JSON.stringify(msg))
    }
  })

  ws.on('close', () => {
    unregister()
  })
})

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const PORT = 3001
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)
  })
}
