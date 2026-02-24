/**
 * Express + WebSocket server entrypoint.
 *
 * Exposes the REST API described in ARCHITECTURE.md and a `/ws` WebSocket
 * endpoint that streams {@link ServerMessage} envelopes to all connected
 * browsers.
 *
 * In production the server serves the Vite-built frontend from the `dist/`
 * directory at the project root. In development, Vite's own dev server
 * handles the frontend at `:5173` while this server runs at `:3001`.
 *
 * The HTTP port is read from the `PORT` environment variable, defaulting to
 * `3001` for local development compatibility.
 *
 * The module also initializes the agent pool on startup and wires NATS
 * pub/sub to agent turn execution.
 */
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import type { AgentId, ApiError, ServerMessage } from '../client/types.ts'
import { createAgentPool } from './agentPool.ts'
import { getNatsConnection, registerShutdownHandler, TOPIC_SUPERVISOR } from './nats.ts'
import { loadIssueGraph } from './github.ts'

export const app = express()
app.use(express.json())

// ---------------------------------------------------------------------------
// Static file serving (production)
//
// When the Vite frontend has been built (`npm run build`), the compiled assets
// land in `dist/` at the project root. We serve them here so a single server
// process hosts both the API and the UI.
//
// In local development `dist/` does not exist and the Vite dev server handles
// the frontend separately, so this is effectively a no-op.
// ---------------------------------------------------------------------------

const distDir = resolve(fileURLToPath(import.meta.url), '..')
app.use(express.static(distDir))

export const server = createServer(app)
/** WebSocket server mounted at `/ws` on the same HTTP server as the REST API. */
export const wss = new WebSocketServer({ server, path: '/ws' })

// ---------------------------------------------------------------------------
// Agent pool initialisation
// ---------------------------------------------------------------------------

/** Promise that resolves to the fully initialized {@link AgentPool}. */
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
    res.status(400).json({
      code: 'INVALID_REPO',
      message: 'Missing required query parameter: repo',
    } satisfies ApiError)
    return
  }
  const [owner, repoName] = repo.split('/')
  if (!owner || !repoName) {
    res.status(400).json({
      code: 'INVALID_REPO',
      message: 'repo must be in owner/repo format',
    } satisfies ApiError)
    return
  }
  try {
    const graph = await loadIssueGraph(owner, repoName)
    res.json(graph)
  } catch (err) {
    const message = String(err)
    // Provide a clear error when GitHub credentials are absent rather than
    // surfacing a raw gh-CLI error message.
    if (
      message.includes('401') ||
      message.includes('Bad credentials') ||
      message.includes('GH_TOKEN') ||
      message.includes('authentication')
    ) {
      res.status(500).json({
        code: 'GITHUB_AUTH_ERROR',
        message: 'GitHub token not configured. Set the GH_TOKEN environment variable.',
      } satisfies ApiError)
    } else {
      res.status(500).json({ code: 'GITHUB_ERROR', message } satisfies ApiError)
    }
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
    res.status(500).json({ code: 'NATS_UNAVAILABLE', message: String(err) } satisfies ApiError)
  }
})

/**
 * `POST /api/stop`
 *
 * Publishes `"stop"` to `epik.supervisor` via NATS, which signals the
 * Supervisor agent to begin graceful shutdown.
 */
app.post('/api/stop', async (_req, res) => {
  try {
    const nc = await getNatsConnection()
    nc.publish(TOPIC_SUPERVISOR, 'stop')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ code: 'NATS_UNAVAILABLE', message: String(err) } satisfies ApiError)
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
    res.status(400).json({
      code: 'MISSING_FIELDS',
      message: 'Missing required fields: agentId, text',
    } satisfies ApiError)
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
    res.status(400).json({
      code: 'MISSING_FIELDS',
      message: 'Missing required field: agentId',
    } satisfies ApiError)
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

/* v8 ignore start */
if (process.argv[1] === new URL(import.meta.url).pathname) {
  registerShutdownHandler()
  const PORT = parseInt(process.env['PORT'] ?? '3001', 10)
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)
  })
}
/* v8 ignore end */
