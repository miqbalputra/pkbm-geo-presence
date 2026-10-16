import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const removeCrossoriginPlugin = () => ({
  name: 'remove-crossorigin',
  transformIndexHtml(html) {
    return html.replace(/\scrossorigin/g, '')
  }
})

export default defineConfig({
  plugins: [react(), tailwindcss(), removeCrossoriginPlugin()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})
