#!/usr/bin/env bash
set -euo pipefail

PORT=4222
CONTAINER_NAME=epik-nats
IMAGE=nats:latest
TIMEOUT=10

# Port already open → NATS is running (covers CI service container case).
if nc -z localhost "$PORT" 2>/dev/null; then
  echo "NATS already reachable on port $PORT"
  exit 0
fi

# Container not yet running → start it.
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Starting NATS container ($IMAGE)..."
  docker run -d --name "$CONTAINER_NAME" -p "${PORT}:4222" --rm "$IMAGE"
fi

# Wait for NATS to accept connections.
echo "Waiting for NATS on port $PORT..."
for i in $(seq 1 "$TIMEOUT"); do
  if nc -z localhost "$PORT" 2>/dev/null; then
    echo "NATS ready."
    exit 0
  fi
  sleep 1
done

echo "ERROR: Timed out waiting for NATS on port $PORT" >&2
exit 1
