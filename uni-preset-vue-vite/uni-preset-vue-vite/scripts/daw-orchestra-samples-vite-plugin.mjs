import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'

export const ORCHESTRA_SAMPLE_PREFIX = '/m-orchestra/'
export const SYMPHONIC_SAMPLE_PREFIX = '/vms-symphonic/'

const M_ORCHESTRA_ROOTS = [
  process.env.DAWWEB_M_ORCHESTRA_ROOT,
  'D:\\FL Plugin\\Sample library\\M Orchestra'
].filter(Boolean)

function cacheRoot (id) {
  return join(process.cwd(), '.sample-cache', id)
}

function mimeFor (file) {
  const ext = extname(file).toLowerCase()
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.ogg') return 'audio/ogg'
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.zip') return 'application/zip'
  return 'application/octet-stream'
}

function insideRoot (root, file) {
  const base = resolve(root)
  const full = resolve(file)
  return full === base || full.startsWith(base + sep)
}

/** Manifest object paths spell sharps as `As4` so URLs stay valid; the encoded cache
 * files keep the original `A#4` names from the source library. */
function pathVariants (rel) {
  const clean = normalize(String(rel || '')).replace(/^([/\\])+/, '').split(sep).join('/')
  if (!clean || clean.includes('..')) return []
  const hashed = clean.replace(/([A-G])s(-?\d)/g, '$1#$2')
  const names = hashed === clean ? [clean] : [clean, hashed]
  const out = []
  for (const name of names) {
    if (name.startsWith('samples/')) out.push(name.slice('samples/'.length))
    out.push(name)
  }
  return out
}

function resolveUnder (roots, rel) {
  for (const root of roots) {
    if (!root || !existsSync(root)) continue
    for (const item of pathVariants(rel)) {
      const file = join(root, item)
      if (insideRoot(root, file) && existsSync(file) && statSync(file).isFile()) return file
    }
  }
  return null
}

function libraries () {
  return [
    { prefix: ORCHESTRA_SAMPLE_PREFIX, roots: M_ORCHESTRA_ROOTS },
    { prefix: SYMPHONIC_SAMPLE_PREFIX, roots: [cacheRoot('vms-symphonic')] }
  ]
}

function requestRel (url, prefix) {
  if (!url) return null
  const pathOnly = decodeURIComponent(url.split('?')[0] || '')
  if (pathOnly === prefix.slice(0, -1) || pathOnly === prefix) return ''
  if (!pathOnly.startsWith(prefix)) return null
  return pathOnly.slice(prefix.length)
}

function sendFile (req, res, file) {
  const size = statSync(file).size
  res.statusCode = 200
  res.setHeader('Content-Type', mimeFor(file))
  res.setHeader('Content-Length', String(size))
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

/** Dev-only: serve local Orchestra sample caches so H5 does not depend on Supabase. */
export function dawOrchestraSamplesPlugin () {
  return {
    name: 'daw-orchestra-samples',
    configureServer (server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        for (const lib of libraries()) {
          const rel = requestRel(req.url, lib.prefix)
          if (rel == null || rel === '') continue
          const file = resolveUnder(lib.roots, rel)
          if (!file) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end('orchestra sample not found')
            return
          }
          sendFile(req, res, file)
          return
        }
        next()
      })
    }
  }
}
