/**
 * Portable project files: audio clips, sampler samples and SF2 banks live in the local
 * asset store by hash. A file that leaves the device (download, cloud, publish) carries
 * them inline as base64 under `assets`; opening it puts them back into the store.
 */

import { collectAssetRefs } from './project-io.js'

function bytesToBase64 (bytes) {
  let out = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(out)
}

function base64ToBytes (text) {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function blobBytes (blob) {
  if (!blob) return null
  if (blob instanceof Uint8Array) return blob
  if (blob instanceof ArrayBuffer) return new Uint8Array(blob)
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  return null
}

/**
 * Returns `{ project, bytes, missing, skipped }`. `project` is a shallow copy with an
 * `assets` map. Assets that would push the packed size past `maxBytes` are skipped so
 * the caller can explain what was left out.
 */
export async function packProjectAssets (project, readAsset, options = {}) {
  const maxBytes = Number(options.maxBytes) || Infinity
  const assets = {}
  const missing = []
  const skipped = []
  let bytes = 0
  const seen = new Set()
  for (const ref of collectAssetRefs(project || {})) {
    if (!ref.hash || seen.has(ref.hash)) continue
    seen.add(ref.hash)
    const asset = await readAsset(ref.hash)
    const data = asset && await blobBytes(asset.blob)
    if (!data) {
      missing.push(ref.hash)
      continue
    }
    const encoded = Math.ceil(data.length / 3) * 4
    if (bytes + encoded > maxBytes) {
      skipped.push({ hash: ref.hash, name: asset.name || ref.name || '', bytes: data.length })
      continue
    }
    assets[ref.hash] = {
      name: asset.name || ref.name || '',
      type: (asset.blob && asset.blob.type) || asset.type || '',
      data: bytesToBase64(data)
    }
    bytes += encoded
  }
  const packed = { ...project }
  if (Object.keys(assets).length) packed.assets = assets
  else delete packed.assets
  return { project: packed, bytes, missing, skipped }
}

/** Write inline assets into the store. Returns the number restored. Hashes are trusted
 * only as keys: a corrupt entry is skipped, never fatal. */
export async function unpackProjectAssets (project, writeAsset, makeBlob) {
  const assets = project && project.assets
  if (!assets || typeof assets !== 'object') return 0
  let count = 0
  for (const [hash, entry] of Object.entries(assets)) {
    if (!hash || !entry || typeof entry.data !== 'string') continue
    try {
      const bytes = base64ToBytes(entry.data)
      const blob = makeBlob ? makeBlob(bytes, entry.type) : bytes
      await writeAsset(hash, blob, { name: entry.name || '', bytes: bytes.length })
      count++
    } catch (err) { /* corrupt entry */ }
  }
  return count
}

export function stripPackedAssets (project) {
  if (!project || !project.assets) return project
  const copy = { ...project }
  delete copy.assets
  return copy
}
