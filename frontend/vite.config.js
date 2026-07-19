import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const BACKEND_TARGET = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/media': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})