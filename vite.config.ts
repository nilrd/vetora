import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

let versao = 'dev'
try { versao = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* sem git */ }

export default defineConfig({
  base: './',
  define: { __VETORA_VERSAO__: JSON.stringify(versao) },
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false },
  server: { port: 5180 },
})
