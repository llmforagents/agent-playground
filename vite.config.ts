import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 4301,
      strictPort: true,
      host: true,
      allowedHosts: ['skywalker'],
      proxy: {
        '/proxy/api': {
          target: env.VITE_API_BASE ?? 'https://api.llm4agents.com',
          changeOrigin: true,
          secure: true,
          // Strip /proxy/api prefix and any trailing slash on the path (the
          // SDK uses /api/v1/balance/ while the backend expects /api/v1/balance).
          rewrite: (p) => p.replace(/^\/proxy\/api/, '').replace(/\/(\?|$)/, '$1'),
        },
        '/proxy/mcp': {
          target: env.VITE_MCP_BASE ?? 'https://mcp.llm4agents.com',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/proxy\/mcp/, '/mcp'),
        },
      },
    },
    preview: { port: 4301, strictPort: true, host: true, allowedHosts: ['skywalker'] },
  }
})
