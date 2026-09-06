import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [
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
        */
        manualChunks (id) {
          const path = id.split('\\').join('/')
          if (path.includes('/audio/m-orchestra/manifest.json')) return 'm-orchestra-manifest'
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
