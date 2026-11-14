import path from 'node:path'
import { readFile } from 'node:fs/promises'

const ICONS = ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']

export const PWA_MANIFEST = {
  name: 'DawWeb',
  short_name: 'DawWeb',
  description: 'Make music in your browser.',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#0b0c0e',
  theme_color: '#0b0c0e',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }
  ]
}

async function serviceWorkerSource (root, version) {
  const routes = await readFile(path.join(root, 'pwa', 'sw-routes.mjs'), 'utf8')
  const main = await readFile(path.join(root, 'pwa', 'sw-main.js'), 'utf8')
  return 'const SW_VERSION = ' + JSON.stringify(version) + '\n' +
    routes.replace(/^export /gm, '') + '\n' + main
}

const TYPES = { '.png': 'image/png', '.svg': 'image/svg+xml' }

/** Manifest and icons at the site root; the service worker only in builds, so dev keeps HMR. */
export function dawPwaPlugin () {
  return {
    name: 'daw-pwa',
    configureServer (server) {
      server.middlewares.use(async (req, res, next) => {
        const name = String(req.url || '').split('?')[0].replace(/^.*\//, '')
        if (name === 'manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json')
          res.end(JSON.stringify(PWA_MANIFEST))
          return
        }
        if (!ICONS.includes(name)) return next()
        try {
          const data = await readFile(path.join(process.cwd(), 'pwa', name))
          res.setHeader('Content-Type', TYPES[path.extname(name)] || 'application/octet-stream')
          res.end(data)
        } catch (err) {
          next()
        }
      })
    },
    async generateBundle () {
      const root = process.cwd()
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(PWA_MANIFEST, null, 2) })
      for (const name of ICONS) {
        this.emitFile({ type: 'asset', fileName: name, source: await readFile(path.join(root, 'pwa', name)) })
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: await serviceWorkerSource(root, Date.now().toString(36)) })
    }
  }
}
