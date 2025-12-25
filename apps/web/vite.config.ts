import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/ed-workstation/', // 確保這裡跟你的 Repo 名字一模一樣！
  plugins: [
    react(),
    tailwindcss(),
  ],
})