import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { dawFxWorkletPlugin } from './scripts/daw-fx-worklet-vite-plugin.mjs'
import { dawOrchestraSamplesPlugin } from './scripts/daw-orchestra-samples-vite-plugin.mjs'

export default defineConfig({
  plugins: [
    dawOrchestraSamplesPlugin(),
    dawFxWorkletPlugin(),
    uni(),
  ],
  build: {
    chunkSizeWarningLimit: 1200,
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
