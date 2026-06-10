import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import sourceIdentifierPlugin from 'vite-plugin-source-identifier'

function patchYTiptapTextSelection() {
  return {
    name: 'patch-y-tiptap-text-selection',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.includes('@tiptap/y-tiptap/dist/y-tiptap')) return null;

      const unsafeSelection = 'tr.setSelection(TextSelection.create(tr.doc, clampedAnchor, clampedHead))';
      if (!code.includes(unsafeSelection)) return null;

      return {
        code: code.replace(
          unsafeSelection,
          `{
          const $clampedAnchor = tr.doc.resolve(clampedAnchor)
          const $clampedHead = tr.doc.resolve(clampedHead)
          if ($clampedAnchor.parent.inlineContent && $clampedHead.parent.inlineContent) {
            tr.setSelection(TextSelection.create(tr.doc, clampedAnchor, clampedHead))
          } else {
            tr.setSelection(TextSelection.near($clampedAnchor, 1))
          }
        }`
        ),
        map: null,
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const isProd = mode === 'prod'
  const isTest = mode === 'test'
  
  return {
    plugins: [
      react(),
      patchYTiptapTextSelection(),
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
