import { reactive } from 'vue'
import {
  ENGINE_FIRST_PORT,
  ENGINE_LAST_PORT,
  pageIsHttps,
  parseEngineHost,
  engineHealthUrl,
  engineSocketUrls,
  engineHostHintText,
  usesSecureEngineTransport
} from './engine-host.js'

export { parseEngineHost, usesSecureEngineTransport, engineHostHintText }

const FIRST_PORT = ENGINE_FIRST_PORT
const LAST_PORT = ENGINE_LAST_PORT
const ENGINE_HOST_KEY = 'dawweb.engineHost'

export const engineLink = reactive({
  connected: false,
  connecting: false,
  url: '',
  audioUrl: '',
  host: '',
  port: FIRST_PORT,
  sessionId: '',
  schemaVersion: 0,
  status: 'Offline',
  lastError: '',
  reconnectCount: 0,
  controlRttMs: 0
})

let socket = null
let audioSocket = null
let nextId = 1
const pending = new Map()
const listeners = new Set()
const binaryListeners = new Set()
let reconnectTimer = 0
let stopped = true
let pingTimer = 0

function notify (message) {
  listeners.forEach((listener) => {
    try { listener(message) } catch (err) { console.warn(err) }
  })
}

function notifyBinary (buffer) {
  binaryListeners.forEach((listener) => {
    try { listener(buffer) } catch (err) { console.warn(err) }
  })
}

export function onEngineEvent (listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function onEngineAudio (listener) {
  binaryListeners.add(listener)
  return () => binaryListeners.delete(listener)
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

function engineOverride () {
  if (typeof location === 'undefined') return ''
  try {
    return new URLSearchParams(location.search).get('engine') || ''
  } catch (err) {
    return ''
  }
}

export function getStoredEngineHost () {
  if (typeof localStorage === 'undefined') return ''
  try {
    return String(localStorage.getItem(ENGINE_HOST_KEY) || '').trim()
  } catch (err) {
    return ''
  }
}

export function setStoredEngineHost (value) {
  const next = String(value || '').trim()
  if (typeof localStorage === 'undefined') return next
  try {
    if (next) localStorage.setItem(ENGINE_HOST_KEY, next)
    else localStorage.removeItem(ENGINE_HOST_KEY)
  } catch (err) { /* quota */ }
  return next
}

export function mixedContentHint () {
  if (!pageIsHttps()) return ''
  const stored = parseEngineHost(getStoredEngineHost())
  const override = parseEngineHost(engineOverride())
  const target = stored || override
  if (target && target.secure) return ''
  return engineHostHintText({ parsed: target })
}

function candidateHosts () {
  const hosts = []
  const stored = parseEngineHost(getStoredEngineHost())
  if (stored) hosts.push(stored.host)
  const override = engineOverride()
  if (override) {
    const host = override.split(':')[0]
    if (host) hosts.push(host)
  }

  if (typeof location !== 'undefined' && location.hostname) {
    hosts.push(location.hostname)
  }

  hosts.push('127.0.0.1', 'localhost')
  return [...new Set(hosts)]
}

async function probeHealth (host, port, secure) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), secure ? 2500 : 500) : 0
  try {
    const response = await fetch(engineHealthUrl(host, port, secure), {
      signal: controller ? controller.signal : undefined
    })
    if (!response.ok) return null
    const data = await response.json()
    if (!data || data.ok === false) return null
    const listenPort = secure ? port : (Number(data.port) || port)
    const urls = engineSocketUrls({
      host,
      port: listenPort,
      secure,
      ws: data.ws,
      audioWs: data.audioWs
    })
    return {
      host,
      port: listenPort,
      ws: urls.ws,
      audioWs: urls.audioWs,
      sessionId: data.sessionId || '',
      schemaVersion: data.schemaVersion || 0,
      lan: data.lan || []
    }
  } catch (err) {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function fallbackFound (parsed) {
  const host = (parsed && parsed.host) || '127.0.0.1'
  const port = (parsed && parsed.port) || FIRST_PORT
  const secure = !!(parsed && parsed.secure)
  const urls = engineSocketUrls({ host, port, secure })
  return {
    host,
    port,
    ws: urls.ws,
    audioWs: urls.audioWs,
    sessionId: '',
    schemaVersion: 0,
    lan: []
  }
}

async function probeParsed (parsed) {
  if (!parsed) return null
  return probeHealth(parsed.host, parsed.port, parsed.secure)
}

async function discoverUrl () {
  const stored = parseEngineHost(getStoredEngineHost())
  if (stored) {
    const found = await probeParsed(stored)
    if (found) return found
  }

  const override = parseEngineHost(engineOverride())
  if (override) {
    const found = await probeParsed(override)
    if (found) return found
  }

  if (!pageIsHttps()) {
    const hosts = candidateHosts()
    for (const host of hosts) {
      for (let port = FIRST_PORT; port <= LAST_PORT; ++port) {
        const found = await probeHealth(host, port, false)
        if (found) return found
      }
    }
  }

  return fallbackFound(stored || override)
}

function handleMessage (raw) {
  let message
  try {
    message = JSON.parse(raw)
  } catch (err) {
    return
  }

  if (message && message.type === 'diagnostics.pong' && message.tClient) {
    engineLink.controlRttMs = Math.max(0, performance.now() - message.tClient)
  }

  if (message && message.sessionId) engineLink.sessionId = message.sessionId
  if (message && message.schemaVersion) engineLink.schemaVersion = message.schemaVersion

  if (message && message.id != null) {
    settle(message.id, message, message.ok === false)
  }

  notify(message)
}

function startPing () {
  stopPing()
  pingTimer = setInterval(() => {
    if (!isEngineConnected()) return
    sendCommand('diagnostics.ping', { tClient: performance.now() }).catch(() => {})
  }, 2000)
}

function stopPing () {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = 0
  }
}

function openSocket (found) {
  engineLink.connecting = true
  engineLink.url = found.ws
  engineLink.audioUrl = found.audioWs || (found.ws + '/audio')
  engineLink.host = found.host
  engineLink.port = found.port
  engineLink.sessionId = found.sessionId || ''
  engineLink.schemaVersion = found.schemaVersion || 0
  engineLink.status = 'Connecting…'
  engineLink.lastError = ''

  const next = new WebSocket(found.ws)
  next.binaryType = 'arraybuffer'
  socket = next

  next.onopen = () => {
    if (socket !== next) return
    engineLink.connected = true
    engineLink.connecting = false
    engineLink.status = 'Connected'
    startPing()
    sendCommand('session.state', {}, 30000).catch(() => sendCommand('project.getState', {}, 30000).catch(() => {}))
    sendCommand('instrument.getCatalogue', {}, 30000).catch(() => {})
  }

  next.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer || (typeof Blob !== 'undefined' && event.data instanceof Blob)) {
      return
    }
    handleMessage(event.data)
  }

  next.onerror = () => {
    engineLink.lastError = 'WebSocket error'
  }

  next.onclose = () => {
    if (socket !== next) return
    socket = null
    engineLink.connected = false
    engineLink.connecting = false
    engineLink.status = 'Offline'
    stopPing()
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
  engineLink.reconnectCount += 1
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

  const found = await discoverUrl()
  if (pageIsHttps() && found.ws && found.ws.startsWith('ws://')) {
    engineLink.connecting = false
    engineLink.status = 'Offline'
    engineLink.lastError = mixedContentHint() || engineHostHintText({ parsed: null })
    return
  }
  openSocket(found)
}

export function connectEngineAudio () {
  if (audioSocket && audioSocket.readyState === 1) {
    return Promise.resolve()
  }

  const url = engineLink.audioUrl
  if (!url) return Promise.reject(new Error('No audio WebSocket URL'))
  if (pageIsHttps() && String(url).startsWith('ws://')) {
    return Promise.reject(new Error(mixedContentHint() || 'HTTPS pages cannot open ws:// audio. Use the LAN HTTP page or a wss tunnel.'))
  }

  return new Promise((resolve, reject) => {
    const next = new WebSocket(url)
    next.binaryType = 'arraybuffer'
    audioSocket = next
    next.onopen = () => resolve()
    next.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        notifyBinary(event.data)
        return
      }
      if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
        event.data.arrayBuffer().then(notifyBinary).catch(() => {})
      }
    }
    next.onerror = () => reject(new Error('Audio WebSocket error'))
    next.onclose = () => {
      if (audioSocket === next) audioSocket = null
    }
  })
}

export function disconnectEngine () {
  stopped = true
  stopPing()
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = 0
  }
  if (audioSocket) {
    audioSocket.close()
    audioSocket = null
  }
  if (socket) {
    socket.close()
    socket = null
  }
  engineLink.connected = false
  engineLink.connecting = false
  engineLink.status = 'Offline'
}
