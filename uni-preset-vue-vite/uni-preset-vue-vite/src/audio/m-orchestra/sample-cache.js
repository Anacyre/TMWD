const DB_NAME = 'dawweb-m-orchestra-v2'
const STORE_NAME = 'encoded-samples'
const STATUS_STORE = 'instrument-downloads'
const DB_VERSION = 2

function openDb () {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
      if (!db.objectStoreNames.contains(STATUS_STORE)) db.createObjectStore(STATUS_STORE)
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        dbPromise = null
      }
      finish(database)
    }
    request.onerror = () => finish(null)
    // Another open connection can block the upgrade. Resolving null here used to
    // be cached forever, so later downloads and playback thought there was no database.
    request.onblocked = () => {}
    setTimeout(() => finish(null), 4000)
  })
}

let dbPromise = null

async function db () {
  if (dbPromise) {
    const existing = await dbPromise
    if (existing) return existing
    dbPromise = null
  }
  dbPromise = openDb()
  const database = await dbPromise
  if (!database) dbPromise = null
  return database
}

export async function readEncodedSample (key) {
  const database = await db()
  if (!database) return null
  return new Promise((resolve) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result instanceof ArrayBuffer ? request.result : null)
    request.onerror = () => resolve(null)
  })
}

export async function forgetEncodedSample (key) {
  const database = await db()
  if (!database || !key) return false
  return new Promise((resolve) => {
    const tx = database.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
    tx.onabort = () => resolve(false)
  })
}

/** Solo files are keyed by object path so M Orchestra can share them.
 *  Other libraries prefix the library id, because only the bucket makes a path unique. */
export function encodedCacheKey (library, objectPath) {
  return library === 'vms-solo' ? objectPath : library + '/' + objectPath
}

let liveNoteFetches = 0

export function noteFetchBegin () {
  liveNoteFetches += 1
}

export function noteFetchEnd () {
  liveNoteFetches = Math.max(0, liveNoteFetches - 1)
}

export function noteFetches () {
  return liveNoteFetches
}

export async function writeEncodedSample (key, bytes) {
  const database = await db()
  if (!database || !(bytes instanceof ArrayBuffer)) return false
  return new Promise((resolve) => {
    const tx = database.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(bytes, key)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
    tx.onabort = () => resolve(false)
  })
}

export class AsyncLimiter {
  constructor (limit = 2) {
    this.limit = Math.max(1, limit | 0)
    this.active = 0
    // 'now' is a note that has to sound. Urgent is the playhead window.
    // Background warm stays last. Each tier is FIFO, so a chord's notes
    // are not pushed behind whichever note was requested last.
    this.now = []
    this.urgent = []
    this.waiting = []
  }

  get pending () {
    return this.now.length + this.urgent.length + this.waiting.length
  }

  run (task, priority = false) {
    return new Promise((resolve, reject) => {
      const job = { task, resolve, reject }
      if (priority === 'now') this.now.push(job)
      else if (priority) this.urgent.push(job)
      else this.waiting.push(job)
      this.drain()
    })
  }

  drain () {
    while (this.active < this.limit && (this.now.length || this.urgent.length || this.waiting.length)) {
      const job = this.now.shift() || this.urgent.shift() || this.waiting.shift()
      this.active += 1
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active -= 1
          this.drain()
        })
    }
  }
}

export class AudioBufferLru {
  constructor (budgetBytes = 96 * 1024 * 1024) {
    this.budgetBytes = budgetBytes
    this.bytes = 0
    this.entries = new Map()
    this.pinned = new Set()
  }

  get (key) {
    const value = this.entries.get(key)
    if (!value) return null
    this.entries.delete(key)
    this.entries.set(key, value)
    return value.decoded
  }

  pin (key) {
    this.pinned.add(key)
  }

  unpin (key) {
    this.pinned.delete(key)
  }

  set (key, decoded) {
    const previous = this.entries.get(key)
    if (previous) this.bytes -= previous.bytes
    const audio = decoded && decoded.audio
    const bytes = audio ? audio.length * audio.numberOfChannels * 4 : 0
    this.entries.delete(key)
    this.entries.set(key, { decoded, bytes })
    this.bytes += bytes
    while (this.bytes > this.budgetBytes && this.entries.size > 1) {
      let oldestKey = null
      for (const candidate of this.entries.keys()) {
        if (!this.pinned.has(candidate)) {
          oldestKey = candidate
          break
        }
      }
      if (oldestKey == null) break
      const oldest = this.entries.get(oldestKey)
      this.entries.delete(oldestKey)
      this.bytes -= oldest.bytes
    }
  }

  setBudgetMb (value) {
    this.budgetBytes = Math.max(16, Number(value) || 96) * 1024 * 1024
  }
}

export async function readInstrumentStatus (id) {
  const database = await db()
  if (!database || !id || !database.objectStoreNames.contains(STATUS_STORE)) return null
  return new Promise((resolve) => {
    const request = database.transaction(STATUS_STORE, 'readonly').objectStore(STATUS_STORE).get(id)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => resolve(null)
  })
}

export async function writeInstrumentStatus (id, record) {
  const database = await db()
  if (!database || !id || !database.objectStoreNames.contains(STATUS_STORE)) return false
  return new Promise((resolve) => {
    const tx = database.transaction(STATUS_STORE, 'readwrite')
    tx.objectStore(STATUS_STORE).put(record, id)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
    tx.onabort = () => resolve(false)
  })
}

export async function deleteInstrumentStatus (id) {
  const database = await db()
  if (!database || !id || !database.objectStoreNames.contains(STATUS_STORE)) return false
  return new Promise((resolve) => {
    const tx = database.transaction(STATUS_STORE, 'readwrite')
    tx.objectStore(STATUS_STORE).delete(id)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
    tx.onabort = () => resolve(false)
  })
}

export async function listInstrumentStatus () {
  const database = await db()
  if (!database || !database.objectStoreNames.contains(STATUS_STORE)) return []
  return new Promise((resolve) => {
    const request = database.transaction(STATUS_STORE, 'readonly').objectStore(STATUS_STORE).getAll()
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
    request.onerror = () => resolve([])
  })
}
