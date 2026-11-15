/** Manifest access for the Orchestra V sample libraries.
 *
 * Every library bundles a manifest so the instrument grid works offline, and checks the
 * bucket for a newer one on first use. The VMS Solo manifest is the very same module the
 * M Orchestra engine imports, so Vite emits it once and a browser that cached a violin for
 * one sampler does not download it again for the other.
 */

import soloBundled from '../m-orchestra/manifest.json'
import symphonicBundled from './vms-symphonic-manifest.json'
import { playbackFrom } from '../m-orchestra/playback.js'
import { publicAssetUrl, publicLibraryUrl } from '../../lib/supabase.js'
import { isAudioPayload, isHtmlPayload } from './decode-format.js'
import { DEFAULT_LIBRARY_ID, findLibrary } from './libraries.js'

const BUNDLED = {
  'vms-solo': soloBundled,
  'vms-symphonic': symphonicBundled
}

const state = new Map()

function entry (libraryId) {
  const id = findLibrary(libraryId) ? String(libraryId) : DEFAULT_LIBRARY_ID
  let item = state.get(id)
  if (!item) {
    item = { id, manifest: BUNDLED[id] || { samples: [] }, loadPromise: null }
    state.set(id, item)
  }
  return item
}

export function currentManifest (libraryId) {
  return entry(libraryId).manifest
}

export function librarySamples (libraryId) {
  const manifest = entry(libraryId).manifest
  return (manifest && manifest.samples) || []
}

export function playbackRules (libraryId) {
  return playbackFrom(entry(libraryId).manifest)
}

export function sampleCount (libraryId) {
  if (libraryId == null) {
    let total = 0
    for (const id of Object.keys(BUNDLED)) total += sampleCount(id)
    return total
  }
  const manifest = entry(libraryId).manifest
  return (manifest && manifest.sampleCount) || librarySamples(libraryId).length
}

export function sampleUrl (libraryId, objectPath) {
  const library = findLibrary(libraryId) || findLibrary(DEFAULT_LIBRARY_ID)
  return publicLibraryUrl(library && library.bucket, objectPath)
}

function cloudSampleUrl (libraryId, objectPath) {
  const library = findLibrary(libraryId) || findLibrary(DEFAULT_LIBRARY_ID)
  const bucket = library && library.bucket
  return publicAssetUrl(String(objectPath || '').replace(/^\/+/, ''), bucket)
}

const inflightAudio = new Map()

function abortable (promise, signal) {
  if (!signal) return promise
  if (signal.aborted) {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    return Promise.reject(abort)
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const abort = new Error('aborted')
      abort.name = 'AbortError'
      reject(abort)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}
async function readAudioResponse (url, signal) {
  const response = await fetch(url, signal ? { signal } : undefined)
  const type = String(response.headers.get('content-type') || '')
  // Aborting the fetch does not stop a body read that has already started.
  const bytes = await new Promise((resolve, reject) => {
    const onAbort = () => {
      const abort = new Error('aborted')
      abort.name = 'AbortError'
      reject(abort)
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    response.arrayBuffer().then(resolve, reject).finally(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
    })
  })
  const audio = isAudioPayload(bytes) && !isHtmlPayload(bytes) && !type.includes('text/html')
  if (!response.ok) throw new Error('Download failed (' + response.status + ')')
  if (!audio) throw new Error('Download returned a page instead of audio')
  return bytes
}

/** Encoded sample bytes. A local dev miss, or a page served in place of audio, is
 *  retried against the public bucket. The same URL is not requested twice. */
export function fetchLibraryBytes (libraryId, objectPath, signal, own = false) {
  const primary = sampleUrl(libraryId, objectPath)
  const cloud = cloudSampleUrl(libraryId, objectPath)
  const urls = []
  if (primary) urls.push(primary)
  if (cloud && cloud !== primary) urls.push(cloud)
  const key = urls[0] || ''
  // A download must not sit on a playback request that never finishes.
  if (!own) {
    const existing = key && inflightAudio.get(key)
    if (existing) return abortable(existing, signal)
  }
  const promise = (async () => {
    let last = null
    for (const url of urls) {
      if (signal && signal.aborted) {
        const abort = new Error('aborted')
        abort.name = 'AbortError'
        throw abort
      }
      try {
        return await readAudioResponse(url, signal)
      } catch (err) {
        if (err && err.name === 'AbortError') throw err
        last = err
      }
    }
    throw last || new Error('Download failed')
  })()
  if (key) inflightAudio.set(key, promise)
  return promise.finally(() => {
    if (key && inflightAudio.get(key) === promise) inflightAudio.delete(key)
  })
}

/** Prefer the published manifest when it is at least as complete as the bundled one. */
export async function ensureManifest (libraryId) {
  const item = entry(libraryId)
  if (item.loadPromise) return item.loadPromise
  const bundled = BUNDLED[item.id] || { samples: [] }
  item.loadPromise = (async () => {
    try {
      const response = await fetch(sampleUrl(item.id, 'manifest.json'))
      if (response.ok) {
        const remote = await response.json()
        const bundledCount = ((bundled && bundled.samples) || []).length
        const remoteCount = ((remote && remote.samples) || []).length
        const bundledFormat = Number(bundled && bundled.formatVersion) || 1
        const remoteFormat = Number(remote && remote.formatVersion) || 1
        const remoteReady = !!(remote && remote.playback && remoteCount)
        if (remoteReady && remoteCount >= bundledCount && remoteFormat >= bundledFormat) item.manifest = remote
        else if (!(bundled && bundled.playback)) item.manifest = remote
      }
    } catch (err) {
      console.warn('[orchestra-v] using bundled manifest for ' + item.id, err)
    }
    return item.manifest
  })()
  return item.loadPromise
}
