import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'

export const FX_WORKLET_FILE = 'daw-fx-chain.js'

async function workletSourceFromDisk (root) {
  const file = path.join(root, 'src', 'dsp', 'fx-worklet.js')
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now())
  return String(mod.FX_WORKLET_SOURCE || '')
}

async function writePublicWorklet (root, source) {
  const dir = path.join(root, 'public')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, FX_WORKLET_FILE), source)
}

function sendWorklet (res, source) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(source)
}

function isWorkletRequest (url) {
  if (!url) return false
  const pathOnly = url.split('?')[0]
  return pathOnly === '/' + FX_WORKLET_FILE || pathOnly.endsWith('/' + FX_WORKLET_FILE)
}

/** Serve / emit a same-origin AudioWorklet file. Safari rejects blob: and data: modules. */
export function dawFxWorkletPlugin () {
  return {
    name: 'daw-fx-worklet-file',
    async buildStart () {
      const root = process.cwd()
      await writePublicWorklet(root, await workletSourceFromDisk(root))
    },
    configureServer (server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        if (!isWorkletRequest(req.url)) return next()
        try {
          let source = ''
          try {
            const mod = await server.ssrLoadModule('/src/dsp/fx-worklet.js')
            source = String(mod.FX_WORKLET_SOURCE || '')
          } catch (err) {
            source = await workletSourceFromDisk(server.config.root)
          }
          sendWorklet(res, source)
        } catch (err) {
          next(err)
        }
      })
    },
    async generateBundle () {
      const root = process.cwd()
      const source = await workletSourceFromDisk(root)
      this.emitFile({ type: 'asset', fileName: FX_WORKLET_FILE, source })
    }
  }
}
