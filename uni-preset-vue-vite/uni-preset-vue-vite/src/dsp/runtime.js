import { FX_WORKLET_SOURCE } from './fx-worklet.js'
import { serializeInsert } from './plugin.js'

const modules = new WeakMap()

/** WebKit may still fetch the blob on the worklet thread after addModule resolves. */
export const FX_WORKLET_BLOB_KEEP_MS = 60000
export const FX_WORKLET_FILE = 'daw-fx-chain.js'

const CHAIN_NODE_OPTIONS = [
  {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'explicit'
  },
  {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  },
  {
    numberOfInputs: 1,
    numberOfOutputs: 1
  }
]

export const FX_WORKLET_MODE_NATIVE = 'native'
export const FX_WORKLET_MODE_FALLBACK = 'fallback'

export function invalidateFxWorklet (context) {
  if (context) modules.delete(context)
}

export function hasNativeAudioWorklet (context) {
  return !!(
    context &&
    context.audioWorklet &&
    typeof context.audioWorklet.addModule === 'function' &&
    typeof AudioWorkletNode === 'function'
  )
}

function canCreateScriptProcessor (context) {
  return !!(context && (
    typeof context.createScriptProcessor === 'function' ||
    typeof context.createJavaScriptNode === 'function'
  ))
}

export function fxWorkletPublicUrl () {
  try {
    if (typeof document !== 'undefined' && document.baseURI) {
      return new URL(FX_WORKLET_FILE, document.baseURI).href
    }
  } catch (err) { /* ignore */ }
  try {
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'
    if (typeof location !== 'undefined' && location.href) {
      return new URL(String(base).replace(/\/?$/, '/') + FX_WORKLET_FILE, location.href).href
    }
  } catch (err) { /* ignore */ }
  return '/' + FX_WORKLET_FILE
}

function errText (err) {
  return String((err && err.message) || err || '')
}

function alreadyRegistered (err) {
  return /already been registered|already registered|duplicate/i.test(errText(err))
}

function processorAvailable (context) {
  try {
    const node = new AudioWorkletNode(context, 'daw-fx-chain', {
      numberOfInputs: 1,
      numberOfOutputs: 1
    })
    try { if (node && node.disconnect) node.disconnect() } catch (err) { /* unused probe node */ }
    return true
  } catch (err) {
    return false
  }
}

async function addAndVerify (context, url) {
  try {
    await context.audioWorklet.addModule(url)
  } catch (err) {
    if (!alreadyRegistered(err)) throw err
  }
  if (!processorAvailable(context)) {
    throw new Error('AudioWorklet processor daw-fx-chain did not register (' + url + ')')
  }
}

function revokeLater (url) {
  if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  const later = () => {
    try { URL.revokeObjectURL(url) } catch (err) { /* already revoked */ }
  }
  if (typeof setTimeout === 'function') setTimeout(later, FX_WORKLET_BLOB_KEEP_MS)
  else later()
}

function revokeNow (url) {
  if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  try { URL.revokeObjectURL(url) } catch (err) { /* already revoked */ }
}

function makeWorkletBlob (source, mime) {
  try {
    if (typeof File === 'function') return new File([source], 'daw-fx-chain.js', { type: mime })
  } catch (err) { /* File unsupported in this runtime */ }
  return new Blob([source], { type: mime })
}

async function addModuleFromBlob (worklet, source, mime) {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Blob URLs unavailable')
  }
  const url = URL.createObjectURL(makeWorkletBlob(source, mime))
  try {
    await worklet.addModule(url)
    revokeLater(url)
  } catch (err) {
    revokeNow(url)
    throw err
  }
}

async function addModuleFromDataUrl (worklet, source) {
  const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(source)
  await worklet.addModule(url)
}

async function resumeContext (context) {
  if (!context || typeof context.resume !== 'function') return
  if (context.state === 'suspended' || context.state === 'interrupted') {
    try { await context.resume() } catch (err) { /* autoplay policy */ }
  }
}

function createPortPair () {
  const nodePort = {
    onmessage: null,
    postMessage (data) {
      const handler = processorPort.onmessage
      if (typeof handler === 'function') handler({ data })
    }
  }
  const processorPort = {
    onmessage: null,
    postMessage (data) {
      const handler = nodePort.onmessage
      if (typeof handler === 'function') handler({ data })
    }
  }
  return { nodePort, processorPort }
}

function instantiateMainThreadChain (sampleRate, processorPort) {
  class AudioWorkletProcessor {
    constructor () {
      this.port = processorPort
    }
  }
  let Ctor = null
  function registerProcessor (name, ctor) {
    if (name === 'daw-fx-chain') Ctor = ctor
  }
  const run = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', FX_WORKLET_SOURCE)
  run(AudioWorkletProcessor, registerProcessor, sampleRate || 44100)
  if (typeof Ctor !== 'function') throw new Error('FX processor failed to compile')
  return new Ctor()
}

export function createFallbackChainNode (context, onMeters) {
  if (!canCreateScriptProcessor(context)) {
    throw new Error('AudioWorklet unavailable (open this page over HTTPS or localhost)')
  }
  const { nodePort, processorPort } = createPortPair()
  const processor = instantiateMainThreadChain(context.sampleRate, processorPort)
  const size = 256
  const node = typeof context.createScriptProcessor === 'function'
    ? context.createScriptProcessor(size, 2, 2)
    : context.createJavaScriptNode(size, 2, 2)
  node.port = nodePort
  node.onaudioprocess = (event) => {
    const input = event.inputBuffer
    const output = event.outputBuffer
    const inL = input.getChannelData(0)
    const inR = input.numberOfChannels > 1 ? input.getChannelData(1) : inL
    const outL = output.getChannelData(0)
    const outR = output.numberOfChannels > 1 ? output.getChannelData(1) : outL
    processor.process([[inL, inR]], [[outL, outR]])
  }
  return bindChainMeters(node, onMeters)
}

async function loadFxWorkletModule (context) {
  await resumeContext(context)
  if (!hasNativeAudioWorklet(context)) return FX_WORKLET_MODE_FALLBACK
  const worklet = context.audioWorklet

  const errors = []
  const attempts = [
    () => addAndVerify(context, fxWorkletPublicUrl()),
    () => addModuleFromBlob(worklet, FX_WORKLET_SOURCE, 'text/javascript').then(() => {
      if (!processorAvailable(context)) throw new Error('blob worklet did not register')
    }),
    () => addModuleFromBlob(worklet, FX_WORKLET_SOURCE, 'application/javascript').then(() => {
      if (!processorAvailable(context)) throw new Error('blob worklet did not register')
    }),
    () => addModuleFromDataUrl(worklet, FX_WORKLET_SOURCE).then(() => {
      if (!processorAvailable(context)) throw new Error('data-url worklet did not register')
    })
  ]
  for (const attempt of attempts) {
    try {
      await attempt()
      if (processorAvailable(context)) return FX_WORKLET_MODE_NATIVE
    } catch (err) {
      if (alreadyRegistered(err) && processorAvailable(context)) return FX_WORKLET_MODE_NATIVE
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[fx-worklet]', errText(err))
      }
      errors.push(err)
    }
  }
  if (canCreateScriptProcessor(context)) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[fx-worklet] using main-thread FX fallback')
    }
    return FX_WORKLET_MODE_FALLBACK
  }
  const last = errors[errors.length - 1]
  throw last instanceof Error ? last : new Error(String(last || 'AudioWorklet addModule failed'))
}

export async function ensureFxWorklet (context) {
  if (!context) throw new Error('AudioContext unavailable')
  await resumeContext(context)
  let pending = modules.get(context)
  if (!pending) {
    pending = loadFxWorkletModule(context).catch((err) => {
      modules.delete(context)
      throw err
    })
    modules.set(context, pending)
  }
  return pending
}

function bindChainMeters (node, onMeters) {
  if (!node || !node.port) return node
  node.port.onmessage = (event) => {
    if (event.data && event.data.type === 'meters' && onMeters) onMeters(event.data)
  }
  return node
}

export function createChainNode (context, onMeters) {
  if (hasNativeAudioWorklet(context)) {
    let lastErr = null
    for (let i = 0; i < CHAIN_NODE_OPTIONS.length; i++) {
      try {
        return bindChainMeters(new AudioWorkletNode(context, 'daw-fx-chain', CHAIN_NODE_OPTIONS[i]), onMeters)
      } catch (err) {
        lastErr = err
      }
    }
    invalidateFxWorklet(context)
    if (canCreateScriptProcessor(context)) return createFallbackChainNode(context, onMeters)
    throw lastErr || new Error('AudioWorkletNode daw-fx-chain failed')
  }
  return createFallbackChainNode(context, onMeters)
}

export function pushChain (node, inserts) {
  if (!node) return
  const chain = (inserts || [])
    .filter((item) => item && item.pluginId)
    .map((item) => serializeInsert(item))
  node.port.postMessage({ type: 'set', chain })
}

export function createAnalyser (context) {
  const analyser = context.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.5
  analyser.minDecibels = -90
  analyser.maxDecibels = -6
  return analyser
}

export function spectrumMax (spectrum) {
  const spec = spectrum || []
  let max = 0
  for (let i = 0; i < spec.length; i++) {
    const v = Number(spec[i]) || 0
    if (v > max) max = v
  }
  return max
}

export function pickPluginSpectrum (posted, analyser, insert) {
  const meters = posted || {}
  const id = insert && insert.instanceId
  if (insert && insert.pluginId === 'dynamic-x' && id && meters.plugins && meters.plugins[id]) {
    const spec = meters.plugins[id].spectrum
    // Any non-empty frame is preferable to falling through; a quiet band must
    // read as quiet rather than as "no data", which used to blank the graph.
    if (spec && spec.length) return spec
  }
  const eq = insert && insert.pluginId === 'equalizer-x' && meters.eqById
    ? meters.eqById[insert.instanceId]
    : null
  if (eq && eq.spectrum && eq.spectrum.length) return eq.spectrum
  const worklet = meters.spectrum && meters.spectrum.length ? meters.spectrum : []
  if (worklet.length >= 64) return worklet
  const fft = analyser ? readSpectrum(analyser, 96) : []
  if (fft.length) return fft
  return worklet
}

/** Pre-EQ curve, when the worklet is publishing one for this instance. */
export function pickPreSpectrum (posted, insert) {
  const meters = posted || {}
  if (!insert || insert.pluginId !== 'equalizer-x') return []
  const eq = meters.eqById && meters.eqById[insert.instanceId]
  const spec = eq && eq.spectrumPre
  return spec && spec.length ? spec : []
}

export const VIS_UNATTACHED = 'unattached'
export const VIS_BYPASS = 'bypass'
export const VIS_SILENT = 'silent'
export const VIS_LIVE = 'live'

/**
 * Why a visualization looks empty. An empty canvas on its own cannot tell a
 * missing worklet apart from a silent input, which hid real routing faults.
 */
export function visualState (posted, insert, options = {}) {
  if (options.error || !options.attached) return VIS_UNATTACHED
  if (insert && insert.enabled === false) return VIS_BYPASS
  const meters = posted || {}
  const level = Math.max(
    Number(meters.inPeak) || 0,
    Number(meters.outPeak) || 0,
    Number(meters.wetPeak) || 0
  )
  return level > 1e-4 ? VIS_LIVE : VIS_SILENT
}

export function visualStateLabel (state) {
  if (state === VIS_UNATTACHED) return 'FX engine not attached'
  if (state === VIS_BYPASS) return 'Bypassed'
  if (state === VIS_SILENT) return 'No signal'
  return ''
}

export function readSpectrum (analyser, bins = 96) {
  if (!analyser) return []
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(data)
  const out = new Array(bins)
  const nyquist = analyser.context.sampleRate / 2
  for (let i = 0; i < bins; i++) {
    const t = bins <= 1 ? 0 : i / (bins - 1)
    const freq = Math.exp(Math.log(20) + t * (Math.log(20000) - Math.log(20)))
    const index = Math.min(data.length - 1, Math.round(freq / nyquist * data.length))
    const lo = Math.max(0, index - 1)
    const hi = Math.min(data.length - 1, index + 1)
    let peak = 0
    for (let k = lo; k <= hi; k++) peak = Math.max(peak, data[k])
    out[i] = peak / 255
  }
  return out
}

export function metersForInsert (posted, insert) {
  const src = posted || {}
  const id = insert && insert.instanceId
  const own = id && src.plugins && src.plugins[id]
  if (!own) return src
  const next = {}
  for (const key in src) next[key] = src[key]
  for (const key in own) next[key] = own[key]
  return next
}
