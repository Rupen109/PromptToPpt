import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { securityHeaders } from '../../scripts/csp.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const dev = mode !== 'production'
  const headers = Object.fromEntries(securityHeaders({
    app: 'editor', dev,
    apiUrl: env['VITE_API_URL'] ?? 'http://localhost:4000', webUrl: env['VITE_WEB_URL'] ?? 'http://localhost:3000', editorUrl: env['VITE_EDITOR_URL'] ?? 'http://localhost:3001',
  }))
  return {
  // Dev/preview servers send the same headers as production (the real host gets them from scripts/gen-security-headers.mjs output).
  server: { headers }, preview: { headers },
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // the original source (admin screens included) must not be downloadable by every visitor; upload maps privately to an error tracker if one is added
  build: { sourcemap: false },
  }
})
