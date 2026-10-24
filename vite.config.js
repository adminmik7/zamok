import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0
  },
  server: {
    host: true,
    port: 5173
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.js'],
    // The store tests derive keys with PBKDF2 (600 000 iterations), so a few
    // of them need more than the default five seconds on a slow machine.
    testTimeout: 30000
  }
})
