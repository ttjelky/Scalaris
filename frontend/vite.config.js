import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Дозволяє доступ з телефону у Wi-Fi мережі
    port: 5174,      // Порт фронтенду
    https: {
      // Читаємо ваші згенеровані сертифікати з папки certs
      key: fs.readFileSync('./certs/192.168.0.106+2-key.pem'),
      cert: fs.readFileSync('./certs/192.168.0.106+2.pem'),
    },
    proxy: {
      // Усі запити, які починаються з /api, Vite буде перенаправляти на Django
      '/api': {
        target: 'http://192.168.0.106:8000', // IP вашого комп'ютера і порт бекенду
        changeOrigin: true,
        secure: false,
      }
    }
  }
})