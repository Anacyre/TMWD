/**
 * Media library sources: folders the user picked (File System Access handles, kept in
 * IndexedDB so they survive a reload), folders read through a one-off directory input,
 * and files imported into the browser (iPad). Everything here is free of Vue so it can
 * be tested with fake handles.
 */

export const AUDIO_EXTS = ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'aif', 'aiff']
export const MIDI_EXTS = ['mid', 'midi']
export const MAX_ENTRIES = 3000
export const MAX_DEPTH = 8

export function extOf (name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ''))
  return match ? match[1].toLowerCase() : ''
}

/** 'audio' | 'midi' | '' */
export function mediaKind (name) {
  const ext = extOf(name)
  if (AUDIO_EXTS.includes(ext)) return 'audio'
  if (MIDI_EXTS.includes(ext)) return 'midi'
  return ''
}

export function baseName (name) {
  return String(name || '').replace(/\.[^.]+$/, '')
}

export function formatSize (bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB'
  return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB'
}

function joinPath (dir, name) {
  return dir ? dir + '/' + name : name
}

/**
 * Walk a FileSystemDirectoryHandle (or anything with the same async `values()` shape).
 * Returns `{ entries, truncated }`; entries are files only, each with its folder path.
 */
export async function walkDirectory (root, options = {}) {
  const maxEntries = options.maxEntries || MAX_ENTRIES
  const maxDepth = options.maxDepth != null ? options.maxDepth : MAX_DEPTH
  const sourceId = options.sourceId || ''
  const entries = []
  let truncated = false
  async function visit (handle, dir, depth) {
    if (truncated) return
    for await (const child of handle.values()) {
      if (entries.length >= maxEntries) {
        truncated = true
        return
      }
      if (!child || String(child.name || '').startsWith('.')) continue
      if (child.kind === 'directory') {
        if (depth < maxDepth) await visit(child, joinPath(dir, child.name), depth + 1)
        continue
      }
      const kind = mediaKind(child.name)
      if (!kind) continue
      entries.push({
        id: sourceId + ':' + joinPath(dir, child.name),
        sourceId,
        name: child.name,
        title: baseName(child.name),
        kind,
        dir,
        size: 0,
        getFile: () => child.getFile()
      })
    }
  }
  await visit(root, '', 0)
  return { entries, truncated }
}

/** Entries from an `<input webkitdirectory>` FileList, grouped by relative folder. */
export function entriesFromFileList (files, sourceId) {
  const out = []
  for (const file of Array.from(files || [])) {
    const kind = mediaKind(file.name)
    if (!kind) continue
    const rel = String(file.webkitRelativePath || file.name)
    const parts = rel.split('/')
    parts.pop()
    if (parts.length) parts.shift()
    const dir = parts.join('/')
    out.push({
      id: sourceId + ':' + rel,
      sourceId,
      name: file.name,
      title: baseName(file.name),
      kind,
      dir,
      size: file.size || 0,
      getFile: async () => file
    })
  }
  return out
}

/** Folders directly under `dir` and the files that live in `dir`. */
export function listDir (entries, dir) {
  const prefix = dir ? dir + '/' : ''
  const folders = new Map()
  const files = []
  for (const entry of entries || []) {
    if (entry.dir === dir) {
      files.push(entry)
      continue
    }
    if (dir && !entry.dir.startsWith(prefix)) continue
    const rest = entry.dir.slice(prefix.length)
    const name = rest.split('/')[0]
    if (!name) continue
    folders.set(name, (folders.get(name) || 0) + 1)
  }
  return {
    folders: Array.from(folders, ([name, count]) => ({ name, path: prefix + name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    files: files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }
}

export function searchEntries (entries, query, kind) {
  const needle = String(query || '').trim().toLowerCase()
  return (entries || []).filter((entry) => {
    if (kind && kind !== 'all' && entry.kind !== kind) return false
    if (!needle) return true
    return entry.name.toLowerCase().includes(needle) || entry.dir.toLowerCase().includes(needle)
  }).slice(0, 400)
}

export function breadcrumb (dir) {
  const parts = String(dir || '').split('/').filter(Boolean)
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))
}

export function canPickFolders () {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/* ── persistence ──────────────────────────────────────────────────── */

const DB_NAME = 'dawweb-media'
const DB_VERSION = 1
const SOURCES = 'sources'
const FILES = 'files'
let dbPromise = null
const memory = { sources: new Map(), files: new Map() }

function hasIdb () {
  return typeof indexedDB !== 'undefined'
}

function openDb () {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SOURCES)) db.createObjectStore(SOURCES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function promised (req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function storeOp (name, mode, fn) {
  if (!hasIdb()) return fn(null, memory[name])
  const db = await openDb()
  const tx = db.transaction(name, mode)
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  const result = await fn(tx.objectStore(name), null)
  await done
  return result
}

export function listSources () {
  return storeOp(SOURCES, 'readonly', (store, mem) => (mem ? Array.from(mem.values()) : promised(store.getAll())))
    .then((rows) => (rows || []).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)))
}

export function putSource (source) {
  return storeOp(SOURCES, 'readwrite', (store, mem) => {
    if (mem) mem.set(source.id, source)
    else store.put(source)
    return source
  })
}

export function deleteSource (id) {
  return storeOp(SOURCES, 'readwrite', (store, mem) => {
    if (mem) mem.delete(id)
    else store.delete(id)
  })
}

export function listImportedFiles () {
  return storeOp(FILES, 'readonly', (store, mem) => (mem ? Array.from(mem.values()) : promised(store.getAll())))
    .then((rows) => (rows || []).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })))
}

export function putImportedFile (row) {
  return storeOp(FILES, 'readwrite', (store, mem) => {
    if (mem) mem.set(row.id, row)
    else store.put(row)
    return row
  })
}

export function deleteImportedFile (id) {
  return storeOp(FILES, 'readwrite', (store, mem) => {
    if (mem) mem.delete(id)
    else store.delete(id)
  })
}

export function importedEntry (row) {
  return {
    id: 'imported:' + row.id,
    rowId: row.id,
    sourceId: 'imported',
    name: row.name,
    title: baseName(row.name),
    kind: mediaKind(row.name),
    dir: '',
    size: row.size || 0,
    getFile: async () => (typeof File === 'function' ? new File([row.blob], row.name, { type: row.type || '' }) : row.blob)
  }
}

export function resetMediaMemory () {
  memory.sources.clear()
  memory.files.clear()
}
