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
const tracked = join(appRoot, 'sample-libraries', 'vms-symphonic')
const destRoot = join(appRoot, 'dist', 'build', 'h5', 'vms-symphonic')

function urlName (name) {
  return name.replace(/([A-G])#(-?\d)/g, '$1s$2')
}

function walk (dir, dest, rel, copied, rename) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const src = join(dir, entry.name)
    const name = rename ? urlName(entry.name) : entry.name
    const next = rel ? rel + '/' + name : name
    if (entry.isDirectory()) walk(src, dest, next, copied, rename)
    else if (statSync(src).isFile()) {
      const file = join(dest, next)
      mkdirSync(dirname(file), { recursive: true })
      copyFileSync(src, file)
      copied.count += 1
      copied.bytes += statSync(src).size
    }
  }
}

const vendorOnly = process.argv.includes('--vendor')
const copied = { count: 0, bytes: 0 }

if (vendorOnly) {
  if (!existsSync(cache)) {
    console.error('[stage-symphonic] no cache to vendor at ' + cache)
    process.exit(1)
  }
  walk(cache, join(tracked, 'samples'), '', copied, true)
  console.log('[stage-symphonic] vendored ' + copied.count + ' files (' + (copied.bytes / 1048576).toFixed(1) + ' MB)')
  process.exit(0)
}

if (!existsSync(join(appRoot, 'dist', 'build', 'h5'))) {
  console.error('[stage-symphonic] dist/build/h5 is missing; run the H5 build first')
  process.exit(1)
}

if (existsSync(join(tracked, 'samples'))) {
  walk(tracked, destRoot, '', copied, false)
} else if (existsSync(cache)) {
  walk(cache, join(destRoot, 'samples'), '', copied, true)
} else {
  console.error('[stage-symphonic] no samples in sample-libraries/vms-symphonic or .sample-cache/vms-symphonic')
  process.exit(1)
}

const probe = join(destRoot, 'samples', '1st Violins', '1st Violins Long', '1st Violins_As4_127.ogg')
if (!existsSync(probe)) {
  console.error('[stage-symphonic] expected sample missing after copy: ' + probe)
  process.exit(1)
}
console.log('[stage-symphonic] copied ' + copied.count + ' files (' + (copied.bytes / 1048576).toFixed(1) + ' MB)')
