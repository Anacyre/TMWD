import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { dawFxWorkletPlugin } from './scripts/daw-fx-worklet-vite-plugin.mjs'
import { dawOrchestraSamplesPlugin } from './scripts/daw-orchestra-samples-vite-plugin.mjs'
import { dawPwaPlugin } from './scripts/daw-pwa-vite-plugin.mjs'

function safeChunkFileName (chunkInfo) {
  // A name that starts with ".." is emitted as import("..-node_modules-@...").
  // That is not a relative specifier, so the Ogg decoder never loads on Cloudflare.
  const raw = String(chunkInfo && chunkInfo.name || 'chunk')
  const name = raw.replace(/@/g, '_').replace(/\./g, '_').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+/, '') || 'chunk'
  return 'assets/' + name + '.[hash].js'
}

function dawSafeChunkNames () {
  return {
    name: 'daw-safe-chunk-names',
    enforce: 'post',
    outputOptions (options) {
      options.chunkFileNames = safeChunkFileName
      const prev = options.sanitizeFileName
      options.sanitizeFileName = (name) => {
        const base = typeof prev === 'function' ? prev(name) : String(name)
        return String(base).replace(/@/g, '_').replace(/\.\./g, '_')
      }
      return options
    }
  }
}

export default defineConfig({
  plugins: [
    dawOrchestraSamplesPlugin(),
    dawFxWorkletPlugin(),
    dawPwaPlugin(),
    dawSafeChunkNames(),
    uni(),
  ],
  build: {
    chunkSizeWarningLimit: 1200,
    // esbuild minify stays in one process. The default terser pool uses every
    // CPU and this machine runs out of memory before the bundle is written.
    minify: 'esbuild',
    rollupOptions: {
      output: {
        /*  The M Orchestra manifest alone is ~2.2 MB and is only reachable
            through the dynamic import in audio/m-orchestra/cloud.js. Splitting
            it off the engine chunk keeps it out of every engine update, but the
            rest of audio/m-orchestra must be left alone: cloud.js is a static
            import of the store, so forcing it into a shared chunk would drag
            the engine and manifest into the entry graph.

            Each Orchestra V library manifest gets the same treatment: they are
            one object literal per sample, which is the shape that makes terser
            expensive, and a library the session never touches should not be
            part of the engine download.
        */
        chunkFileNames: safeChunkFileName,
        manualChunks (id) {
          const path = id.split('\\').join('/')
          if (path.includes('/audio/m-orchestra/manifest.json')) return 'm-orchestra-manifest'
          const library = path.match(/\/audio\/orchestra-v\/([\w-]+)-manifest\.json$/)
          if (library) return 'orchestra-v-manifest-' + library[1]
          if (path.includes('/src/model/piano-roll-')) return 'piano-roll'
          return undefined
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false
  }
})
