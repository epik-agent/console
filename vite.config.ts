import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Suppress EPIPE/connection-reset errors on the raw TCP socket during WS
// proxy upgrade. These happen when the browser closes the connection before
// or during the handshake (normal on page reload, Playwright test teardown,
// etc.). Without a listener the unhandled 'error' event crashes Vite.
//
// We attach a no-op error listener in the httpServer 'upgrade' event — before
// http-proxy or the HMR server touch the socket — so any EPIPE that fires
// during the handshake window has a handler and doesn't propagate as an
// uncaught exception.
function suppressWsUpgradeEpipe(): Plugin {
  return {
    name: 'suppress-ws-upgrade-epipe',
    configureServer(server) {
      server.httpServer?.on('upgrade', (_req, socket) => {
        socket.on('error', () => {})
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), suppressWsUpgradeEpipe()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    setupFiles: './src/test-setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/main.tsx'],
    },
    projects: [
      {
        // Client-side: colocated component/hook/util tests
        test: {
          name: 'client',
          include: ['src/client/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: './src/test-setup.ts',
        },
      },
      {
        // Server unit tests: no real external services
        test: {
          name: 'unit',
          include: ['src/tests/unit/**/*.test.ts'],
          environment: 'node',
          globals: true,
        },
      },
      {
        // Integration tests: require NATS
        test: {
          name: 'integration',
          include: ['src/tests/integration/**/*.test.ts'],
          environment: 'node',
          globals: true,
        },
      },
    ],
  },
})
