import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
