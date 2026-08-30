/** IndexedDB project library. localStorage is only a small recovery fallback. */

const DB_NAME = 'dawweb'
const DB_VERSION = 1
const STORE_PROJECTS = 'projects'
const STORE_ASSETS = 'assets'
const STORE_SETTINGS = 'settings'
const LS_AUTOSAVE = 'dawweb.autosave'
const LS_LAST = 'dawweb.project.last'
const LS_RECENT = 'dawweb.recent'
const LS_ACTIVE = 'dawweb.activeProject'
const ASSET_BUDGET = 80 * 1024 * 1024

let memory = null

function memoryDb () {
  if (!memory) {
    memory = {
      projects: new Map(),
      assets: new Map(),
      settings: new Map()
    }
  }
  return memory
}

function hasIndexedDb () {
  return typeof indexedDB !== 'undefined'
}

function openDb () {
  if (!hasIndexedDb()) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'hash' })
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone (tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('aborted'))
  })
}

function requestToPromise (req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putProject (project) {
  const record = {
    ...project,
    updatedAt: Date.now()
  }
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_PROJECTS, 'readwrite')
    tx.objectStore(STORE_PROJECTS).put(record)
    await txDone(tx)
  } else {
    memoryDb().projects.set(record.id, record)
  }
  writeFallback(record)
  return record
}

export async function getProject (id) {
  if (!id) return null
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_PROJECTS, 'readonly')
    const row = await requestToPromise(tx.objectStore(STORE_PROJECTS).get(id))
    if (row) return row
  } else {
    const row = memoryDb().projects.get(id)
    if (row) return row
  }
  return readFallbackById(id)
}

export async function listProjects () {
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_PROJECTS, 'readonly')
    const rows = await requestToPromise(tx.objectStore(STORE_PROJECTS).getAll())
    return (rows || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }
  return Array.from(memoryDb().projects.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function deleteProject (id) {
  if (!id) return
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_PROJECTS, 'readwrite')
    tx.objectStore(STORE_PROJECTS).delete(id)
    await txDone(tx)
  } else {
    memoryDb().projects.delete(id)
  }
  const recent = readRecent().filter((item) => item.id !== id)
  writeRecent(recent)
  if (readActiveId() === id) writeActiveId('')
}

export async function duplicateProject (id, name) {
  const src = await getProject(id)
  if (!src) return null
  const copy = {
    ...src,
    id: 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    name: name || ((src.name || 'Untitled') + ' copy'),
    updatedAt: Date.now()
  }
  return putProject(copy)
}

export async function renameProject (id, name) {
  const src = await getProject(id)
  if (!src) return null
  src.name = name
  return putProject(src)
}

export async function putAsset (hash, blob, meta = {}) {
  if (!hash || !blob) return null
  const record = {
    hash,
    blob,
    name: meta.name || '',
    bytes: blob.size || meta.bytes || 0,
    updatedAt: Date.now()
  }
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_ASSETS, 'readwrite')
    tx.objectStore(STORE_ASSETS).put(record)
    await txDone(tx)
    await evictAssets(ASSET_BUDGET)
  } else {
    memoryDb().assets.set(hash, record)
  }
  return record
}

export async function getAsset (hash) {
  if (!hash) return null
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_ASSETS, 'readonly')
    return requestToPromise(tx.objectStore(STORE_ASSETS).get(hash))
  }
  return memoryDb().assets.get(hash) || null
}

export async function evictAssets (maxBytes) {
  if (!hasIndexedDb()) return
  const db = await openDb()
  const tx = db.transaction(STORE_ASSETS, 'readwrite')
  const store = tx.objectStore(STORE_ASSETS)
  const rows = await requestToPromise(store.getAll())
  const list = (rows || []).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
  let total = list.reduce((sum, row) => sum + (row.bytes || 0), 0)
  for (const row of list) {
    if (total <= maxBytes) break
    store.delete(row.hash)
    total -= row.bytes || 0
  }
  await txDone(tx)
}

export async function getSetting (key) {
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_SETTINGS, 'readonly')
    const row = await requestToPromise(tx.objectStore(STORE_SETTINGS).get(key))
    if (row) return row.value
  } else if (memoryDb().settings.has(key)) {
    return memoryDb().settings.get(key)
  }
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem('dawweb.setting.' + key)
    return raw == null ? null : JSON.parse(raw)
  } catch (err) {
    return null
  }
}

export async function setSetting (key, value) {
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_SETTINGS, 'readwrite')
    tx.objectStore(STORE_SETTINGS).put({ key, value })
    await txDone(tx)
  } else {
    memoryDb().settings.set(key, value)
  }
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('dawweb.setting.' + key, JSON.stringify(value)) } catch (err) { /* quota */ }
  }
}

export async function setActiveProject (id) {
  writeActiveId(id)
  await setSetting('activeProject', id)
}

export async function getActiveProjectId () {
  const stored = await getSetting('activeProject')
  return stored || readActiveId()
}

export function readRecent () {
  if (typeof localStorage === 'undefined') return memoryDb().settings.get('recent') || []
  try {
    return JSON.parse(localStorage.getItem(LS_RECENT) || '[]') || []
  } catch (err) {
    return []
  }
}

export function writeRecent (list) {
  const next = (list || []).slice(0, 8)
  if (typeof localStorage === 'undefined') {
    memoryDb().settings.set('recent', next)
    return
  }
  try { localStorage.setItem(LS_RECENT, JSON.stringify(next)) } catch (err) { /* quota */ }
}

export function rememberRecent (entry) {
  const next = [entry].concat(readRecent().filter((item) => item.id !== entry.id && item.name !== entry.name)).slice(0, 8)
  writeRecent(next)
  return next
}

function writeFallback (record) {
  if (typeof localStorage === 'undefined') return
  try {
    const slim = { ...record, webMixer: record.webMixer }
    const json = JSON.stringify(slim)
    localStorage.setItem(LS_LAST, json)
    localStorage.setItem(LS_AUTOSAVE, json)
  } catch (err) { /* quota */ }
}

function readFallbackById (id) {
  if (typeof localStorage === 'undefined') return null
  try {
    const last = JSON.parse(localStorage.getItem(LS_LAST) || 'null')
    if (last && last.id === id) return last
  } catch (err) { /* ignore */ }
  return null
}

function readActiveId () {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(LS_ACTIVE) || ''
}

function writeActiveId (id) {
  if (typeof localStorage === 'undefined') return
  if (id) localStorage.setItem(LS_ACTIVE, id)
  else localStorage.removeItem(LS_ACTIVE)
}

export async function hashBlob (blob) {
  const buffer = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer()
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  let hash = 2166136261
  const view = new Uint8Array(buffer)
  for (let i = 0; i < view.length; i++) hash = (hash ^ view[i]) * 16777619
  return 'fnv_' + (hash >>> 0).toString(16) + '_' + view.length
}

export function resetMemoryDb () {
  memory = null
}

export const FALLBACK_KEYS = { LS_AUTOSAVE, LS_LAST, LS_RECENT, LS_ACTIVE }
