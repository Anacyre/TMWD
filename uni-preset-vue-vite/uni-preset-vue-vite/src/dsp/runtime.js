import { FX_WORKLET_SOURCE } from './fx-worklet.js'
import { serializeInsert } from './plugin.js'

const modules = new WeakMap()

export async function ensureFxWorklet (context) {
  if (!context.audioWorklet) throw new Error('AudioWorklet unavailable')
  let pending = modules.get(context)
  if (!pending) {
    const blob = new Blob([FX_WORKLET_SOURCE], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    pending = context.audioWorklet.addModule(url)
      .catch((err) => {
        modules.delete(context)
        throw err
      })
      .finally(() => URL.revokeObjectURL(url))
    modules.set(context, pending)
  }
  await pending
}

export function createChainNode (context, onMeters) {
  const node = new AudioWorkletNode(context, 'daw-fx-chain', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'explicit'
  })
  node.port.onmessage = (event) => {
    if (event.data && event.data.type === 'meters' && onMeters) onMeters(event.data)
  }
  return node
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
