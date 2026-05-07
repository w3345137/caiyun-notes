import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import sourceIdentifierPlugin from 'vite-plugin-source-identifier'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'prod'
  const isTest = mode === 'test'
  
  return {
    plugins: [
      react(),
      sourceIdentifierPlugin({
        enabled: !isProd,
        attributePrefix: 'data-matrix',
        includeProps: true,
      })
    ],
    base: isTest ? '/test/' : '/',
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/mermaid')) return 'mermaid';
            if (id.includes('node_modules/simple-mind-map')) return 'mindmap';
            if (id.includes('node_modules/@tiptap') || id.includes('node_modules/prosemirror')) return 'editor';
            if (id.includes('node_modules/recharts')) return 'charts';
            if (id.includes('node_modules/@tauri-apps')) return 'tauri';
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
