/** Download one catalogue instrument's encoded samples into IndexedDB.
 *  Playback already reads that store first, so a finished instrument no longer
 *  waits on the network. Decoded PCM is not stored. */

import { reactive } from 'vue'
import { availableDefinitions, libraryOf } from '../audio/orchestra-v/catalog.js'
import { LIBRARIES } from '../audio/orchestra-v/libraries.js'
import { isAudioPayload, isHtmlPayload } from '../audio/orchestra-v/decode-format.js'
import { ensureManifest, fetchLibraryBytes, librarySamples } from '../audio/orchestra-v/library.js'
import { instrumentSamplePaths } from '../audio/orchestra-v/sfz.js'
import {
  deleteInstrumentStatus,
  encodedCacheKey,
  forgetEncodedSample,
  listInstrumentStatus,
  readEncodedSample,
  writeEncodedSample,
  writeInstrumentStatus
} from '../audio/m-orchestra/sample-cache.js'

const MAX_FILES = 2

export const downloads = reactive({
  ready: false,
  groups: []
})

let loading = null
let running = 0

function cachedAudio (bytes) {
  return !!(bytes && isAudioPayload(bytes) && !isHtmlPayload(bytes))
}

function takeSlot () {
  return new Promise((resolve) => {
    const attempt = () => {
      // A cold playback keeps its own fetch slots full for the whole piece.
      // Waiting on those slots left the instrument percent at 0. Download uses
      // its own two connections and does not take a note slot.
      if (running >= MAX_FILES) {
        setTimeout(attempt, 40)
        return
      }
      running += 1
      resolve()
    }
    attempt()
  })
}

function releaseSlot () {
  running = Math.max(0, running - 1)
}

function allItems () {
  const items = []
  for (const group of downloads.groups) items.push(...group.items)
  return items
}

function findItem (id) {
  return allItems().find((item) => item.id === id) || null
}

async function countCached (item) {
  let done = 0
  for (const path of item.paths) {
    const bytes = await readEncodedSample(encodedCacheKey(item.library, path))
    if (cachedAudio(bytes)) done += 1
  }
  return done
}

async function remember (item, complete, error) {
  await writeInstrumentStatus(item.id, {
    id: item.id,
    library: item.library,
    total: item.total,
    complete: !!complete,
    error: error || ''
  })
}

async function fetchFile (item, path) {
  const key = encodedCacheKey(item.library, path)
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), 20000) : 0
  try {
    const bytes = await fetchLibraryBytes(item.library, path, controller && controller.signal)
    const stored = await writeEncodedSample(key, bytes)
    if (!stored) throw new Error('This browser does not have enough space for the rest of this instrument')
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('Download timed out')
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function runDownload (item) {
  const token = {}
  item.token = token
  item.state = 'downloading'
  item.error = ''
  try {
    item.done = 0
    for (const path of item.paths) {
      if (item.token !== token) return
      const bytes = await readEncodedSample(encodedCacheKey(item.library, path))
      if (cachedAudio(bytes)) {
        item.done += 1
        continue
      }
      await takeSlot()
      try {
        if (item.token !== token) return
        await fetchFile(item, path)
        if (item.token !== token) return
        item.done += 1
        await remember(item, false, '')
      } finally {
        releaseSlot()
      }
    }
    if (item.token !== token) return
    item.state = item.done >= item.total ? 'ready' : 'error'
    if (item.state !== 'ready' && !item.error) item.error = 'Download stopped early'
    await remember(item, item.state === 'ready', item.error)
  } catch (err) {
    if (item.token !== token) return
    item.state = 'error'
    item.error = (err && err.message) || 'Download failed'
    await remember(item, false, item.error)
  }
}

export function startInstrumentDownload (id) {
  const item = findItem(id)
  if (!item || item.state === 'downloading' || item.state === 'ready') return
  runDownload(item)
}

export async function removeInstrumentDownload (id) {
  const item = findItem(id)
  if (!item) return
  item.token = null
  const keep = new Set()
  for (const other of allItems()) {
    if (other.id === item.id) continue
    if (other.state !== 'ready' && other.state !== 'downloading' && other.done <= 0) continue
    for (const path of other.paths) keep.add(encodedCacheKey(other.library, path))
  }
  for (const path of item.paths) {
    const key = encodedCacheKey(item.library, path)
    if (!keep.has(key)) await forgetEncodedSample(key)
  }
  await deleteInstrumentStatus(item.id)
  item.done = 0
  item.state = 'idle'
  item.error = ''
}

async function loadGroups () {
  const saved = new Map((await listInstrumentStatus()).map((record) => [record.id, record]))
  const groups = []
  const pending = []
  for (const library of LIBRARIES) {
    try {
      await ensureManifest(library.id)
    } catch (err) {
      console.warn('[instruments] manifest', library.id, err)
    }
    const samples = librarySamples(library.id)
    const items = []
    for (const def of availableDefinitions()) {
      if (libraryOf(def) !== library.id || !def.sourcePack) continue
      const paths = instrumentSamplePaths(samples, def)
      if (!paths.length) continue
      const record = saved.get(def.id)
      const item = {
        id: def.id,
        name: def.displayName,
        library: library.id,
        paths,
        total: paths.length,
        done: 0,
        state: 'idle',
        error: '',
        token: null
      }
      if (record && record.complete && record.total === item.total) {
        item.state = 'ready'
        item.done = item.total
      } else if (record) {
        item.error = record.error || ''
        pending.push(item)
      }
      items.push(item)
    }
    if (items.length) {
      groups.push({ id: library.id, name: library.displayName, items })
      downloads.groups = groups.slice()
      downloads.ready = true
    }
  }
  downloads.ready = true
  for (const raw of pending) {
    const item = findItem(raw.id) || raw
    if (item.state === 'downloading' || item.state === 'ready') continue
    item.done = await countCached(item)
    item.state = item.done >= item.total ? 'ready' : 'idle'
    if (item.state === 'ready') {
      item.error = ''
      await remember(item, true, '')
    }
  }
}

export function refreshInstrumentDownloads () {
  if (!loading) {
    loading = loadGroups().catch((err) => {
      loading = null
      throw err
    })
  }
  return loading
}

export function instrumentProgress (item) {
  if (!item || !item.total) return '0%'
  if (item.state === 'ready') return '100%'
  const pct = Math.round(Math.max(0, Math.min(1, item.done / item.total)) * 100)
  return pct + '%'
}

export function instrumentAction (item) {
  if (!item) return ''
  if (item.state === 'downloading') return instrumentProgress(item)
  if (item.state === 'ready') return 'Remove'
  if (item.state === 'error') return 'Retry'
  if (item.done > 0) return 'Resume'
  return 'Download'
}
