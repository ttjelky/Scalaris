import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Один спільний бекенд-хост для /api і /media — раніше вони були прописані
// окремо і розійшлися на дві різні IP-адреси, через що аватарки/медіа
// тихо йшли в нікуди, поки API-запити працювали нормально.
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