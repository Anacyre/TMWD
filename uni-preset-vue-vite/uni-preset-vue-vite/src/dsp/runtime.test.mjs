import {
  ensureFxWorklet,
  createChainNode,
  invalidateFxWorklet,
  FX_WORKLET_BLOB_KEEP_MS,
  FX_WORKLET_FILE
} from './runtime.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

const orig = {
  Blob: globalThis.Blob,
  File: globalThis.File,
  URL: globalThis.URL,
  AudioWorkletNode: globalThis.AudioWorkletNode,
  setTimeout: globalThis.setTimeout
}

const added = []
const revoked = []
const timers = []
const ready = new WeakSet()

globalThis.File = undefined
globalThis.Blob = class {
  constructor (parts, opts) {
    this.parts = parts
    this.type = opts && opts.type
  }
}
globalThis.URL = {
  createObjectURL (blob) { return 'blob:' + (blob && blob.type ? blob.type : 'x') },
  revokeObjectURL (url) { revoked.push(url) }
}
globalThis.setTimeout = (fn, ms) => {
  timers.push({ fn, ms })
  return timers.length
}

function installProcessorNode (onConstruct) {
  globalThis.AudioWorkletNode = class {
    constructor (context, name, opts) {
      if (onConstruct) onConstruct(opts)
      if (name === 'daw-fx-chain' && !ready.has(context)) throw new Error('not registered')
      this.port = { onmessage: null, postMessage () {} }
      this.opts = opts
    }
  }
}

function makeContext (addModule) {
  const ctx = {
    state: 'running',
    audioWorklet: {
      addModule: async (url) => {
        await addModule(url)
        ready.add(ctx)
      }
    }
  }
  return ctx
}

try {
  installProcessorNode()
  const ctx = makeContext(async (url) => { added.push(url) })
  await ensureFxWorklet(ctx)
  assert(added.length >= 1 && String(added[0]).includes(FX_WORKLET_FILE),
    'same-origin worklet file is tried first (Safari cannot use blob: modules)')
  assert(revoked.length === 0, 'file load does not revoke a blob URL')

  added.length = 0
  await ensureFxWorklet(ctx)
  assert(added.length === 0, 'a successful load is cached on the AudioContext')

  const blobCtx = makeContext(async (url) => {
    added.push(url)
    if (String(url).includes(FX_WORKLET_FILE)) throw new Error('missing file')
  })
  added.length = 0
  revoked.length = 0
  await ensureFxWorklet(blobCtx)
  assert(added.some((url) => String(url).startsWith('blob:')), 'falls back to a blob URL when the file is missing')
  assert(revoked.length === 0, 'blob URL is not revoked as soon as addModule resolves')
  assert(timers.some((item) => item.ms === FX_WORKLET_BLOB_KEEP_MS), 'WebKit is given time to fetch the blob')

  const blocked = makeContext(async (url) => {
    added.push(url)
    if (String(url).includes(FX_WORKLET_FILE) || String(url).startsWith('blob:')) {
      throw new Error('blob blocked')
    }
  })
  added.length = 0
  await ensureFxWorklet(blocked)
  assert(added.some((url) => String(url).startsWith('data:')), 'Safari blob failure falls back to a data URL')

  let attempts = 0
  installProcessorNode((opts) => {
    attempts++
    if (opts && opts.channelCountMode === 'explicit') throw new Error('explicit unsupported')
  })
  ready.add(ctx)
  const node = createChainNode(ctx, () => {})
  assert(attempts >= 2, 'Safari channelCountMode failure retries a simpler node')
  assert(!!node.port, 'fallback node is usable')

  globalThis.AudioWorkletNode = class {
    constructor () { throw new Error('no processor') }
  }
  let threw = false
  try {
    createChainNode(ctx, () => {})
  } catch (err) {
    threw = /no processor/.test(err.message)
  }
  assert(threw, 'a missing processor still throws')
  installProcessorNode()
  added.length = 0
  ready.delete(ctx)
  await ensureFxWorklet(ctx)
  assert(added.length >= 1, 'a failed node construct reloads the worklet on the next ensure')

  invalidateFxWorklet(ctx)

  const fallbackCtx = {
    sampleRate: 44100,
    state: 'running',
    createScriptProcessor () {
      return { port: null, onaudioprocess: null, connect () {}, disconnect () {} }
    }
  }
  const mode = await ensureFxWorklet(fallbackCtx)
  assert(mode === 'fallback', 'HTTP / iPad AudioWorklet gap uses the main-thread fallback')
  const fallbackNode = createChainNode(fallbackCtx, () => {})
  assert(!!fallbackNode.port && typeof fallbackNode.port.postMessage === 'function',
    'fallback chain node exposes the same port API')
  fallbackNode.port.postMessage({ type: 'set', chain: [] })
  const block = 8
  const inL = new Float32Array(block)
  const inR = new Float32Array(block)
  const outL = new Float32Array(block)
  const outR = new Float32Array(block)
  inL[0] = 0.5
  inR[0] = -0.25
  fallbackNode.onaudioprocess({
    inputBuffer: {
      numberOfChannels: 2,
      getChannelData (ch) { return ch ? inR : inL }
    },
    outputBuffer: {
      numberOfChannels: 2,
      getChannelData (ch) { return ch ? outR : outL }
    }
  })
  assert(outL[0] === 0.5 && outR[0] === -0.25, 'fallback copies audio when the chain is empty')
} finally {
  globalThis.Blob = orig.Blob
  globalThis.File = orig.File
  globalThis.URL = orig.URL
  globalThis.AudioWorkletNode = orig.AudioWorkletNode
  globalThis.setTimeout = orig.setTimeout
}

console.log('fx runtime worklet load ok')
