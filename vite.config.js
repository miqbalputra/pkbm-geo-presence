import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const removeCrossoriginPlugin = () => ({
  name: 'remove-crossorigin',
  transformIndexHtml(html) {
    return html.replace(/\scrossorigin/g, '')
  }
})

export default defineConfig({
  plugins: [react(), removeCrossoriginPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
