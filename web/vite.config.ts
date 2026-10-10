/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: true,
    },
  },
  base: process.env.NODE_ENV === 'production' ? '/shadow_caster/' : '/',
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    // Core and CLI tests run in plain Node; component tests opt into jsdom with a docblock.
    environment: 'node',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}', 'cli/**/*.test.ts'],
  },
})
