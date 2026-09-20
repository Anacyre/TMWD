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
import { publicLibraryUrl } from '../../lib/supabase.js'
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
