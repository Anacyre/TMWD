import { reactive } from 'vue'

const FIRST_PORT = 17890
const LAST_PORT = 17899

export const engineLink = reactive({
  connected: false,
  connecting: false,
  url: '',
  status: 'Offline',
  lastError: ''
})

let socket = null
let nextId = 1
const pending = new Map()
const listeners = new Set()
let reconnectTimer = 0
let stopped = true

function notify (message) {
  listeners.forEach((listener) => {
    try { listener(message) } catch (err) { console.warn(err) }
  })
}

export function onEngineEvent (listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isEngineConnected () {
  return engineLink.connected && socket != null && socket.readyState === 1
}

function settle (id, message, isError) {
  const waiter = pending.get(id)
  if (!waiter) return
  pending.delete(id)
  clearTimeout(waiter.timer)
  if (isError) waiter.reject(new Error(message.error || 'Engine error'))
  else waiter.resolve(message)
}

export function sendCommand (type, payload = {}, timeoutMs = 8000) {
  if (!isEngineConnected()) {
    return Promise.reject(new Error('Engine is offline'))
  }

  const id = nextId++
  const message = { id, type, ...payload }
  socket.send(JSON.stringify(message))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Engine command timed out: ' + type))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
  })
}

function sameOriginEngineUrl () {
  if (typeof location === 'undefined') return ''
  const port = Number(location.port)
  if (port >= FIRST_PORT && port <= LAST_PORT) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.hostname}:${port}`
  }
  return ''
}

async function probeHealth (port) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), 400) : 0
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller ? controller.signal : undefined
    })
    if (!response.ok) return ''
    const data = await response.json()
    return data && data.ws ? String(data.ws) : `ws://127.0.0.1:${port}`
  } catch (err) {
    return ''
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function discoverUrl () {
  const same = sameOriginEngineUrl()
  if (same) return same

  for (let port = FIRST_PORT; port <= LAST_PORT; ++port) {
    const url = await probeHealth(port)
    if (url) return url
  }

  return `ws://127.0.0.1:${FIRST_PORT}`
}

function handleMessage (raw) {
  let message
  try {
    message = JSON.parse(raw)
  } catch (err) {
    return
  }

  if (message && message.id != null) {
    settle(message.id, message, message.ok === false)
  }

  notify(message)
}

function openSocket (url) {
  engineLink.connecting = true
  engineLink.url = url
  engineLink.status = 'Connecting…'
  engineLink.lastError = ''

  const next = new WebSocket(url)
  socket = next

  next.onopen = () => {
    if (socket !== next) return
    engineLink.connected = true
    engineLink.connecting = false
    engineLink.status = 'Connected'
    sendCommand('project.getState').catch(() => {})
    sendCommand('instrument.getCatalogue').catch(() => {})
  }

  next.onmessage = (event) => handleMessage(event.data)

  next.onerror = () => {
    engineLink.lastError = 'WebSocket error'
  }

  next.onclose = () => {
    if (socket !== next) return
    socket = null
    engineLink.connected = false
    engineLink.connecting = false
    engineLink.status = 'Offline'
    pending.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Engine disconnected'))
    })
    pending.clear()
    scheduleReconnect()
  }
}

function scheduleReconnect () {
  if (stopped) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = 0
    if (!stopped && !isEngineConnected()) connectEngine()
  }, 1500)
}

export async function connectEngine () {
  stopped = false
  if (isEngineConnected() || engineLink.connecting) return

  if (typeof WebSocket === 'undefined') {
    engineLink.status = 'WebSocket unavailable'
    return
  }

  const url = await discoverUrl()
  openSocket(url)
}

export function disconnectEngine () {
  stopped = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = 0
  }
  if (socket) {
    socket.close()
    socket = null
  }
  engineLink.connected = false
  engineLink.connecting = false
  engineLink.status = 'Offline'
}
