# ---------------------------------------------------------------------------
# Builder stage — install deps and compile the frontend + server
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for layer-caching
COPY package.json package-lock.json ./

RUN npm ci

# Copy source and config
COPY . .

# Build the Vite frontend (outputs to dist/) and compile TypeScript
RUN npm run build

# ---------------------------------------------------------------------------
# Production stage — lean runtime image
# ---------------------------------------------------------------------------
FROM node:20-slim AS production

WORKDIR /app

# Install the gh CLI so the server can call it for GitHub API access.
# The CLI reads GH_TOKEN from the environment automatically.
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled artifacts from builder stage (frontend + bundled server)
COPY --from=builder /app/dist ./dist

# Optional GitHub token — the app starts without it but repo loading will
# return a clear error if it is absent.
ENV SERVE_STATIC="1"
ENV GH_TOKEN=""

# NATS server URL — overridden by docker-compose to point at the nats service
ENV NATS_URL="nats://nats:4222"

# HTTP port the Express server listens on
ENV PORT=5173

EXPOSE 5173

CMD ["node", "dist/server.js"]
