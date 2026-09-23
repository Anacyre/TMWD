/**
 * Copy the VMS Symphonic cache into the H5 build so the Cloudflare site can serve it.
 *
 * The Supabase bucket for this library answers 400. Object paths spell sharps as `As4`;
 * the cache still has `A#4`, so the copy renames those to match the manifest.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(appRoot, '.sample-cache', 'vms-symphonic')
const destRoot = join(appRoot, 'dist', 'build', 'h5', 'vms-symphonic', 'samples')

function urlName (name) {
  return name.replace(/([A-G])#(-?\d)/g, '$1s$2')
}

function walk (dir, rel, copied) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const src = join(dir, entry.name)
    const next = rel ? rel + '/' + urlName(entry.name) : urlName(entry.name)
    if (entry.isDirectory()) walk(src, next, copied)
    else if (statSync(src).isFile()) {
      const dest = join(destRoot, next)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
      copied.count += 1
      copied.bytes += statSync(src).size
    }
  }
}

if (!existsSync(cache)) {
  console.warn('[stage-symphonic] no cache at ' + cache + '; the deployed site will have no Symphonic samples')
  process.exit(0)
}
if (!existsSync(join(appRoot, 'dist', 'build', 'h5'))) {
  console.warn('[stage-symphonic] dist/build/h5 is missing; run the H5 build first')
  process.exit(0)
}

const copied = { count: 0, bytes: 0 }
walk(cache, '', copied)
console.log('[stage-symphonic] copied ' + copied.count + ' files (' + (copied.bytes / 1048576).toFixed(1) + ' MB)')
