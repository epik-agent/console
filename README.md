# Builder

Builder is a multi-agent build console. Give it a GitHub repository with open
issues and it autonomously implements them using a team of Claude Code agents
coordinated over NATS.

## Quick start with Docker

The easiest way to run Builder is with Docker Compose, which starts NATS and
the application server automatically.

### Without GitHub access

```bash
docker compose up
```

Open http://localhost:5173 in your browser. The dashboard loads and you can
see the empty issue graph and agent console. Trying to load a repository will
show a clear error: _"GitHub token not configured"_.

### With GitHub access

```bash
GH_TOKEN=ghp_your_token_here docker compose up
```

Open http://localhost:5173 and enter `epik-agent/builder` (or any
`owner/repo`) in the toolbar. Click **Load** to fetch the issue graph.

### What you should see

- The toolbar at the top with a repository input field and **Load** / **Start** buttons.
- The issue dependency graph in the top half of the screen (empty until a repo is loaded).
- The agent console tabs (Supervisor, Worker 0/1/2) in the bottom half.
- After loading a repo, coloured nodes appear in the graph — one per open issue.

## Local development

### Prerequisites

- Node.js ≥ 20
- `nats-server` binary on PATH (`brew install nats-server` on macOS)
- `gh` CLI authenticated (`gh auth login`)

### Start

```bash
nats-server &        # start NATS in the background
npm install
npm run dev          # Vite on :5173, Express on :3001
```

Open http://localhost:5173/?repo=owner/repo.

### Scripts

| Script                  | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `npm run dev`           | Vite dev server + Express via tsx (hot reload)     |
| `npm run server`        | Express server only (tsx watch)                    |
| `npm run build`         | Type-check + Vite frontend bundle + server bundle  |
| `npm run build:server`  | esbuild server bundle only → `dist/server.js`      |
| `npm run lint`          | ESLint                                             |
| `npm run format`        | Prettier                                           |
| `npm test`              | Vitest unit tests                                  |

### Build strategy

There are three build modes:

**Development** (`npm run dev`): no build step. Vite serves the frontend with
hot module replacement on `:5173`. The Express server runs directly from
TypeScript source via `tsx watch` on `:3001`.

**Production build** (`npm run build`): three sequential steps:
1. `tsc -b` — type-checks the whole project (no output files)
2. `vite build` — bundles the React frontend into `dist/`
3. `esbuild` — bundles the Express server into `dist/server.js`, with
   runtime dependencies (`express`, `ws`, `nats`, `@anthropic-ai/claude-agent-sdk`)
   left as externals so they are resolved from `node_modules` at runtime

**Docker** (`docker compose up --build`): runs the production build inside the
builder stage, then copies only `dist/` into the lean production image.
`node_modules` on the host is excluded via `.dockerignore` so the container
always installs fresh Linux-compatible binaries.

Docker layer caching means the slow steps (`npm ci`, installing `gh`) are only
re-run when `package-lock.json` changes. Changing source files only re-runs
`COPY . .` and `npm run build` (a few seconds).

### Static file serving

In production the Express server serves the Vite-built frontend from the same
`dist/` directory that contains `server.js`. This is controlled by the
`SERVE_STATIC` environment variable, which the Dockerfile sets to `"1"`.

The server code is:

```ts
if (process.env['SERVE_STATIC']) {
  const distDir = resolve(fileURLToPath(import.meta.url), '..')
  app.use(express.static(distDir))
}
```

`import.meta.url` points to `dist/server.js` at runtime, so `resolve(..., '..')`
is the `dist/` directory — exactly where Vite wrote `index.html` and `assets/`.

`SERVE_STATIC` is intentionally not set in development or tests. In development,
Vite runs its own server. In tests, leaving it unset means the static middleware
is never registered regardless of whether a `dist/` directory exists on disk,
eliminating any test-ordering sensitivity to local build state.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design, data types,
NATS topics, and REST API reference.
