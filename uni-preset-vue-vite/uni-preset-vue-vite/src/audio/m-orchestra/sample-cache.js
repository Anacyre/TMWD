const DB_NAME = 'dawweb-m-orchestra-v2'
const STORE_NAME = 'encoded-samples'
const DB_VERSION = 1

function openDb () {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

let dbPromise = null

async function db () {
  if (!dbPromise) dbPromise = openDb()
  return dbPromise
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
    this.waiting = []
  }

  get pending () {
    return this.waiting.length
  }

  run (task, priority = false) {
    return new Promise((resolve, reject) => {
      const job = { task, resolve, reject }
      if (priority) this.waiting.unshift(job)
      else this.waiting.push(job)
      this.drain()
    })
  }

  drain () {
    while (this.active < this.limit && this.waiting.length) {
      const job = this.waiting.shift()
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
