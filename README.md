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

| Script           | Description                              |
| ---------------- | ---------------------------------------- |
| `npm run dev`    | Vite dev server + Express (concurrently) |
| `npm run server` | Express server only (tsx watch)          |
| `npm run build`  | TypeScript + Vite production build       |
| `npm run lint`   | ESLint                                   |
| `npm run format` | Prettier                                 |
| `npm test`       | Vitest unit tests                        |

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design, data types,
NATS topics, and REST API reference.
