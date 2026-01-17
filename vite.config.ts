/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// Port configuration from environment variables
const VITE_PORT = parseInt(process.env.VITE_PORT || '3200', 10)
const API_PORT = parseInt(process.env.API_PORT || '3100', 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: VITE_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${API_PORT}`,
        ws: true,
      },
    },
    // SPA 라우팅: 하드 리프레시 시에도 index.html로 폴백
    fs: {
      strict: false,
    },
  },
  // 프리뷰 서버에도 동일 적용
  preview: {
    port: VITE_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${API_PORT}`,
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react'
          }
          // UI framework - Radix
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix'
          }
          // Data fetching - TanStack
          if (id.includes('node_modules/@tanstack')) {
            return 'vendor-tanstack'
          }
          // Drag and drop
          if (id.includes('node_modules/@dnd-kit')) {
            return 'vendor-dnd'
          }
          // Heavy visualization
          if (id.includes('node_modules/mermaid')) {
            return 'vendor-mermaid'
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'dist', '.shadcn-admin-ref'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
