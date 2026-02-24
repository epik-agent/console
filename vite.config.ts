import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        configure: (proxy) => {
          // Intercept proxyReqWs before Vite adds its socket error logger,
          // then remove all socket error listeners so the EPIPE isn't logged.
          // EPIPE is safe to ignore here: it means the browser closed the WS
          // connection before the proxy finished writing, which is normal during
          // HMR reconnects and page reloads.
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            setImmediate(() => socket.removeAllListeners('error'))
          })
        },
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
