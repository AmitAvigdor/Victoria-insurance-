import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig(({ mode }) => ({
  cacheDir: `node_modules/.vite/${mode}`,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@supabase/')) return 'supabase'
          if (id.includes('/node_modules/zod/')) return 'validation'
          if (
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-router')
          )
            return 'react'
        },
      },
    },
  },
}))
