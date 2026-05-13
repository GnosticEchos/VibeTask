import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

import { fileURLToPath, URL } from 'node:url'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 4000,
    host: true,
    allowedHosts: ['vibetask.local'],
    forwardConsole: true,

    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Forward the Authorization header
            if (req.headers.authorization) {
              proxyReq.setHeader('authorization', req.headers.authorization);
            }
          });
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['vue-demi'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@assets': fileURLToPath(new URL('./src/assets', import.meta.url))
    },
  },
  css: {
    postcss: './postcss.config.cjs',
    preprocessorOptions: {
      scss: {
        // Per-file @use ('sass:map' etc.) lives in partials that need it — avoid prepending @use
        // onto every .scss file (breaks Tailwind v4 when mixed with @import in the same compilation).
        includePaths: [path.resolve(__dirname, './src')],
      },
    },
  },
  build: {
    cssCodeSplit: true,
    cssMinify: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /node_modules/, priority: 10, maxSize: 260000 },
            { name: 'common', minShareCount: 2, minSize: 50000, maxSize: 220000, priority: 5 },
          ],
          minSize: 30000,
          maxSize: 300000,
        },
      },
    },
  }
})
