import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Polling-based watcher — required on Windows where fs.watch is unreliable.
    // Detects every file save in src/ and triggers HMR / full-page reload.
    watch: {
      usePolling: true,
      interval: 100,        // check for changes every 100 ms
    },
    // Explicit HMR config — tells the browser exactly where the websocket is.
    // Without this, after a server restart the browser loses the connection
    // and never receives the reload signal.
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    proxy: {
      // Use 127.0.0.1 (IPv4) not localhost — avoids ECONNREFUSED on Windows
      // where Node resolves localhost → ::1 (IPv6) but uvicorn binds to 127.0.0.1.

      // /api prefix → strip and forward to backend
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Only proxy the specific backend auth routes — NOT /auth/callback
      // which is a frontend route handled by React Router.
      '/auth/google': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/auth/me': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/home': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/candidates': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/jobs': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/pipeline': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/matching': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/interviews': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/email': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/indexing': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
