# Console

[![CI](https://github.com/epik-agent/console/actions/workflows/ci.yml/badge.svg)](https://github.com/epik-agent/console/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/epik-agent/console/graph/badge.svg?token=1V88WCNEGN)](https://codecov.io/gh/epik-agent/console)

Console is a multi-agent build console. Give it a GitHub repository with open
issues and it autonomously implements them using a team of Claude Code agents
coordinated over NATS.

## Local development

### Prerequisites

- Node.js ≥ 20
- Docker (for NATS)
- `gh` CLI authenticated (`gh auth login`)

### NATS

Console requires a NATS server. A custom Docker image lives in `nats/` — it
enables the WebSocket endpoint and HTTP monitoring alongside the standard client
port. Build it once and leave the container running; you normally won't need to
restart it between sessions.

```bash
docker build -t epik-nats nats/
docker run -d --name epik-nats \
  -p 4222:4222 \
  -p 8222:8222 \
  -p 9222:9222 \
  epik-nats
```

| Port | Purpose                                 |
| ---- | --------------------------------------- |
| 4222 | NATS client (TCP)                       |
| 8222 | HTTP monitoring — http://localhost:8222 |
| 9222 | WebSocket client                        |

To stop and remove the container:

```bash
docker rm -f epik-nats
```

### App

```bash
pnpm install
pnpm run dev
```

`pnpm run dev` starts Vite on `:5173` and the Express server on `:3001`
concurrently, both with hot reload.

Open http://localhost:5173/?repo=owner/repo.

### Scripts

| Script                      | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `pnpm run dev`              | Vite dev server + Express via tsx (hot reload)    |
| `pnpm run server`           | Express server only (tsx watch)                   |
| `pnpm run build`            | Type-check + Vite frontend bundle + server bundle |
| `pnpm run build:server`     | esbuild server bundle only → `dist/server.js`     |
| `pnpm run lint`             | ESLint + tsc type-check                           |
| `pnpm run format`           | Prettier (write)                                  |
| `pnpm run format:check`     | Prettier (check only)                             |
| `pnpm test`                 | All tests (single run)                            |
| `pnpm test:unit`            | Client + unit tests (no services needed)          |
| `pnpm test:integration`     | Integration tests (requires NATS)                 |
| `pnpm test:coverage`        | All tests with coverage report                    |

## Testing

### Structure

React component and hook tests live **colocated** with their source files in
`src/client/` — the standard React community convention. Server-side tests live
in `src/tests/`, split into two subdirectories:

| Directory | What goes here |
| --- | --- |
| `src/tests/unit/` | Tests that mock all external dependencies (NATS, GitHub, Claude SDK). No real services required. Runs in ~2 seconds. |
| `src/tests/integration/` | Tests that connect to real infrastructure. Currently: NATS pub/sub. Requires the NATS container to be running. |

**The rule of thumb:** mock only what you don't own (Claude API, GitHub API).
Everything you do own — Express, WebSockets, NATS, the agent pool — should run
real in integration tests, because that's where subtle wiring bugs hide.

### Running locally

Unit tests (no services needed):

```bash
pnpm test:unit
```

Integration tests (start NATS first):

```bash
docker run -d --name epik-nats -p 4222:4222 -p 8222:8222 -p 9222:9222 epik-nats
pnpm test:integration
```

## Build

`npm run build` runs three steps in sequence:

1. `tsc -b` — type-checks the whole project (no output files)
2. `vite build` — bundles the React frontend into `dist/`
3. `esbuild` — bundles the Express server into `dist/server.js`, with
   runtime dependencies (`express`, `ws`, `nats`, `@anthropic-ai/claude-agent-sdk`)
   left as externals

In development `dist/` need not exist. The server serves static files from
`dist/` when it finds them there; Vite's dev server handles the frontend
otherwise.

## CI

CI runs on GitHub Actions. The NATS service container uses the same image as
local dev, published to GHCR by `publish-nats.yml` whenever `nats/` changes on
`main`.

The `gh` CLI is used to call the GitHub API. In CI it picks up credentials from
the `GH_TOKEN` environment variable automatically. Locally it uses whatever
account is configured via `gh auth login`.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design, data types,
NATS topics, and REST API reference.
