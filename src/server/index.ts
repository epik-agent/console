import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'

export const app = express()
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

export const server = createServer(app)
export const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', () => {
  // WebSocket connections will be handled here
})

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const PORT = 3001
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)
  })
}
