import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

export const FX_WORKLET_FILE = 'daw-fx-chain.js'
export const COSMIC_WORKLET_FILE = 'daw-cosmic.js'

async function workletSourceFromDisk (root) {
  const file = path.join(root, 'src', 'dsp', 'fx-worklet.js')
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now())
  return String(mod.FX_WORKLET_SOURCE || '')
}

async function cosmicSourceFromDisk (root) {
  const dsp = await readFile(path.join(root, 'src', 'dsp', 'cosmic', 'dsp.js'), 'utf8')
  const tailFile = path.join(root, 'src', 'dsp', 'cosmic', 'processor-tail.js')
  const mod = await import(pathToFileURL(tailFile).href + '?t=' + Date.now())
  return dsp.replace(/^export /gm, '') + '\n' + String(mod.COSMIC_PROCESSOR_TAIL || '')
}

async function writePublicWorklet (root, fileName, source) {
  const dir = path.join(root, 'public')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, fileName), source)
}

function sendWorklet (res, source) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(source)
}

function workletKind (url) {
  if (!url) return ''
  const pathOnly = url.split('?')[0]
  if (pathOnly === '/' + FX_WORKLET_FILE || pathOnly.endsWith('/' + FX_WORKLET_FILE)) return 'fx'
  if (pathOnly === '/' + COSMIC_WORKLET_FILE || pathOnly.endsWith('/' + COSMIC_WORKLET_FILE)) return 'cosmic'
  return ''
}

/** Serve / emit same-origin AudioWorklet files. Safari rejects blob: and data: modules. */
export function dawFxWorkletPlugin () {
  return {
    name: 'daw-fx-worklet-file',
    async buildStart () {
      const root = process.cwd()
      await writePublicWorklet(root, FX_WORKLET_FILE, await workletSourceFromDisk(root))
      await writePublicWorklet(root, COSMIC_WORKLET_FILE, await cosmicSourceFromDisk(root))
    },
    configureServer (server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const kind = workletKind(req.url)
        if (!kind) return next()
        try {
          const source = kind === 'cosmic'
            ? await cosmicSourceFromDisk(server.config.root)
            : await (async () => {
              try {
                const mod = await server.ssrLoadModule('/src/dsp/fx-worklet.js')
                return String(mod.FX_WORKLET_SOURCE || '')
              } catch (err) {
                return workletSourceFromDisk(server.config.root)
              }
            })()
          sendWorklet(res, source)
        } catch (err) {
          next(err)
        }
      })
    },
    async generateBundle () {
      const root = process.cwd()
      this.emitFile({ type: 'asset', fileName: FX_WORKLET_FILE, source: await workletSourceFromDisk(root) })
      this.emitFile({ type: 'asset', fileName: COSMIC_WORKLET_FILE, source: await cosmicSourceFromDisk(root) })
    }
  }
}
