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

/** Library owner: 'guest' or a Supabase user id. Rows saved before scoping existed have
 * no owner and belong to the guest library, so nothing an account saved is ever listed
 * for a signed-out visitor and nothing a guest saved shows up inside an account. */
export const GUEST_OWNER = 'guest'
let currentOwner = readStoredAuthOwner()

function readStoredAuthOwner () {
  if (typeof localStorage === 'undefined') return GUEST_OWNER
  try {
    const raw = JSON.parse(localStorage.getItem('dawweb.auth') || 'null')
    const user = raw && (raw.user || (raw.currentSession && raw.currentSession.user))
    return user && user.id ? String(user.id) : GUEST_OWNER
  } catch (err) {
    return GUEST_OWNER
  }
}

export function ownerOf (row) {
  return (row && row.owner) || GUEST_OWNER
}

export function getLibraryOwner () {
  return currentOwner
}

export function setLibraryOwner (owner) {
  currentOwner = owner ? String(owner) : GUEST_OWNER
  return currentOwner
}

function scopedKey (base) {
  return currentOwner === GUEST_OWNER ? base : base + '.' + currentOwner
}

function settingKey (key) {
  return currentOwner === GUEST_OWNER ? key : key + ':' + currentOwner
}

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

function cloneForStore (project) {
  try {
    return JSON.parse(JSON.stringify(project || {}))
  } catch (err) {
    throw new Error('Project could not be saved (contains data that cannot be stored)')
  }
}

async function writeProjectRecord (record) {
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_PROJECTS, 'readwrite')
    tx.objectStore(STORE_PROJECTS).put(record)
    await txDone(tx)
  } else {
    memoryDb().projects.set(record.id, record)
  }
}

export async function putProject (project, options = {}) {
  const record = {
    ...cloneForStore(project),
    owner: options.owner || currentOwner,
    updatedAt: Date.now()
  }
  delete record.kind
  delete record.sourceId
  delete record.sourceName
  if (record.id) {
    const existing = await readProjectRow(record.id)
    if (existing && ownerOf(existing) !== record.owner) {
      record.id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
      record.cloudId = ''
    }
  }
  await writeProjectRecord(record)
  writeFallback(record)
  return record
}

const AUTOSAVE_PER_PROJECT = 3
const AUTOSAVE_TOTAL = 20

function staleAutosaves (rows) {
  const bySource = new Map()
  for (const row of rows) {
    const key = row.sourceId || ''
    const group = bySource.get(key)
    if (group) group.push(row)
    else bySource.set(key, [row])
  }
  const drop = []
  const kept = []
  for (const group of bySource.values()) {
    kept.push(...group.slice(0, AUTOSAVE_PER_PROJECT))
    drop.push(...group.slice(AUTOSAVE_PER_PROJECT))
  }
  kept.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  drop.push(...kept.slice(AUTOSAVE_TOTAL))
  return drop
}

export async function putAutosave (project) {
  const sourceId = project && project.id ? project.id : ''
  const record = {
    ...cloneForStore(project),
    id: 'as_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    owner: currentOwner,
    kind: 'autosave',
    sourceId,
    sourceName: (project && project.name) || 'Untitled',
    updatedAt: Date.now()
  }
  await writeProjectRecord(record)
  const autos = (await listProjectRows()).filter(isAutosaveRecord)
  for (const row of staleAutosaves(autos)) await deleteProject(row.id)
  return record
}

async function readProjectRow (id) {
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_PROJECTS, 'readonly')
    return (await requestToPromise(tx.objectStore(STORE_PROJECTS).get(id))) || null
  }
  return memoryDb().projects.get(id) || null
}

/** A project from the current owner's library; another owner's row reads as missing. */
export async function getProject (id) {
  if (!id) return null
  const row = await readProjectRow(id)
  if (row) return ownerOf(row) === currentOwner ? row : null
  return readFallbackById(id)
}

async function listProjectRows () {
  let rows = []
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_PROJECTS, 'readonly')
    rows = await requestToPromise(tx.objectStore(STORE_PROJECTS).getAll())
  } else {
    rows = Array.from(memoryDb().projects.values())
  }
  return (rows || [])
    .filter((row) => ownerOf(row) === currentOwner)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

/** Saved (non-autosave) projects of one owner, regardless of the active library. */
export async function listOwnerProjects (owner) {
  const want = owner || GUEST_OWNER
  let rows = []
  if (hasIndexedDb()) {
    const db = await openDb()
    const tx = db.transaction(STORE_PROJECTS, 'readonly')
    rows = await requestToPromise(tx.objectStore(STORE_PROJECTS).getAll())
  } else {
    rows = Array.from(memoryDb().projects.values())
  }
  return (rows || [])
    .filter((row) => ownerOf(row) === want && !isAutosaveRecord(row))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

/** Hand a project to another owner (explicit "Move to my account"). `from` defaults to
 * the active library. */
export async function moveProjectToOwner (id, owner, from) {
  const row = await readProjectRow(id)
  if (!row || !owner || ownerOf(row) !== (from || currentOwner)) return null
  const record = { ...row, owner: String(owner), updatedAt: Date.now() }
  await writeProjectRecord(record)
  const recent = readRecent().filter((item) => item.id !== id)
  writeRecent(recent)
  if (readActiveId() === id) writeActiveId('')
  return record
}

export async function listProjects () {
  return (await listProjectRows()).filter((row) => !isAutosaveRecord(row))
}

export async function listAutosaves () {
  return (await listProjectRows()).filter(isAutosaveRecord)
}

export async function deleteProject (id) {
  if (!id) return
  const existing = await readProjectRow(id)
  if (existing && ownerOf(existing) !== currentOwner) return
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
    cloudId: '',
    updatedAt: Date.now()
  }
  if (copy.meta) copy.meta = { ...copy.meta, title: copy.name, publishedId: '', publishedAt: 0 }
  return putProject(copy)
}

export async function renameProject (id, name) {
  const src = await getProject(id)
  if (!src) return null
  src.name = name
  if (src.meta) src.meta = { ...src.meta, title: name }
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
  await setSetting(settingKey('activeProject'), id)
}

export async function getActiveProjectId () {
  const stored = await getSetting(settingKey('activeProject'))
  return stored || readActiveId()
}

export function readRecent () {
  if (typeof localStorage === 'undefined') return memoryDb().settings.get(settingKey('recent')) || []
  try {
    return JSON.parse(localStorage.getItem(scopedKey(LS_RECENT)) || '[]') || []
  } catch (err) {
    return []
  }
}

export function writeRecent (list) {
  const next = (list || []).slice(0, 8)
  if (typeof localStorage === 'undefined') {
    memoryDb().settings.set(settingKey('recent'), next)
    return
  }
  try { localStorage.setItem(scopedKey(LS_RECENT), JSON.stringify(next)) } catch (err) { /* quota */ }
}

export function rememberRecent (entry) {
  const next = [entry].concat(readRecent().filter((item) => item.id !== entry.id && item.name !== entry.name)).slice(0, 8)
  writeRecent(next)
  return next
}

export function isAutosaveRecord (row) {
  if (!row) return false
  return row.kind === 'autosave' || String(row.id || '').indexOf('as_') === 0
}

function writeFallback (record) {
  if (typeof localStorage === 'undefined' || isAutosaveRecord(record)) return
  if (ownerOf(record) !== currentOwner) return
  try {
    const slim = { ...record, webMixer: record.webMixer }
    localStorage.setItem(scopedKey(LS_LAST), JSON.stringify(slim))
  } catch (err) { /* quota */ }
}

function readFallbackById (id) {
  if (typeof localStorage === 'undefined') return null
  try {
    const last = JSON.parse(localStorage.getItem(scopedKey(LS_LAST)) || 'null')
    if (last && last.id === id && ownerOf(last) === currentOwner) return last
  } catch (err) { /* ignore */ }
  return null
}

function readActiveId () {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(scopedKey(LS_ACTIVE)) || ''
}

function writeActiveId (id) {
  if (typeof localStorage === 'undefined') return
  if (id) localStorage.setItem(scopedKey(LS_ACTIVE), id)
  else localStorage.removeItem(scopedKey(LS_ACTIVE))
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

/** localStorage keys for the current owner. Guest keys keep their historical names. */
export const FALLBACK_KEYS = {
  get LS_AUTOSAVE () { return scopedKey(LS_AUTOSAVE) },
  get LS_LAST () { return scopedKey(LS_LAST) },
  get LS_RECENT () { return scopedKey(LS_RECENT) },
  get LS_ACTIVE () { return scopedKey(LS_ACTIVE) }
}
