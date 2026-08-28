import { EQUALIZER_X_PROCESSOR_SOURCE } from './equalizer-x-processor.js'
import { clone, clamp } from './plugin.js'

let api = null

export function loadEqualizerXApi () {
  if (!api) api = new Function(EQUALIZER_X_PROCESSOR_SOURCE + '\nreturn EQX_API;')()
  return api
}

export function getEqxConst () {
  return loadEqualizerXApi().EQX
}

export const EQ_FREQ_MIN = 20
export const EQ_FREQ_MAX = 20000
export const EQ_NODE_GAIN_MIN = -18
export const EQ_NODE_GAIN_MAX = 18
export const EQ_OUTPUT_GAIN_MIN = -24
export const EQ_OUTPUT_GAIN_MAX = 24
export const EQ_Q_MIN = 0.2
export const EQ_Q_MAX = 12
export const EQ_MAX_NODES = 7
export const EQ_FFT_SIZE = 1024
export const EQ_VIZ_BINS = 192
export const EQ_VIZ_FPS = 24
export const EQ_SLOPES = [6, 12, 18, 24, 30, 36, 48]

export function freqFromNorm (x, min = EQ_FREQ_MIN, max = EQ_FREQ_MAX) {
  return min * Math.pow(max / min, clamp(x, 0, 1))
}

export function freqToNormEq (hz, min = EQ_FREQ_MIN, max = EQ_FREQ_MAX) {
  return clamp(Math.log(Math.max(min, hz) / min) / Math.log(max / min), 0, 1)
}

export function nodeGainFromNorm (x) {
  return EQ_NODE_GAIN_MIN + clamp(x, 0, 1) * (EQ_NODE_GAIN_MAX - EQ_NODE_GAIN_MIN)
}

export function qFromNorm (x, min = EQ_Q_MIN, max = EQ_Q_MAX) {
  return min * Math.pow(max / min, clamp(x, 0, 1))
}

export function nearestSlope (value) {
  const v = Number(value)
  if (!Number.isFinite(v)) return 12
  let best = EQ_SLOPES[0]
  let err = Math.abs(v - best)
  for (let i = 1; i < EQ_SLOPES.length; i++) {
    const d = Math.abs(v - EQ_SLOPES[i])
    if (d < err) {
      best = EQ_SLOPES[i]
      err = d
    }
  }
  return best
}

export function meaningfulEqParams (shape) {
  const type = shape || 'bell'
  return {
    frequency: true,
    gain: type === 'bell' || type === 'lowshelf' || type === 'highshelf',
    q: type === 'bell' || type === 'notch' || type === 'bandpass',
    slope: type === 'lowcut' || type === 'highcut' || type === 'lowshelf' || type === 'highshelf'
  }
}

export function eqResponseDb (freq, nodes, sr = 48000) {
  return loadEqualizerXApi().eqResponseDb(freq, nodes, sr)
}

export function eqCurvePoints (nodes, width, height, minDb = EQ_NODE_GAIN_MIN, maxDb = EQ_NODE_GAIN_MAX, sr = 48000) {
  const { designNode, createRecipe, recipeMag2, EQX } = loadEqualizerXApi()
  const list = nodes || []
  const recipes = []
  for (let i = 0; i < list.length && i < EQX.MAX_NODES; i++) {
    const node = list[i]
    if (!node || node.enabled === false) continue
    recipes.push(designNode(node, sr, createRecipe()))
  }
  const pts = []
  const logMin = Math.log(EQX.FREQ_MIN)
  const logSpan = Math.log(EQX.FREQ_MAX) - logMin
  for (let x = 0; x < width; x += 2) {
    const freq = Math.exp(logMin + (x / Math.max(1, width)) * logSpan)
    const w = 2 * Math.PI * freq / sr
    let mag2 = 1
    for (let i = 0; i < recipes.length; i++) mag2 *= recipeMag2(recipes[i], w)
    const db = 10 * Math.log10(Math.max(1e-12, mag2))
    const t = 1 - (db - minDb) / (maxDb - minDb)
    pts.push([x, t * height])
  }
  return pts
}

export function serializeEqState (state) {
  return clone(normalizeEqState(state))
}

export function normalizeEqState (state) {
  const src = state && typeof state === 'object' ? state : {}
  const nodes = Array.isArray(src.nodes) ? src.nodes.slice(0, EQ_MAX_NODES) : []
  let soloIndex = -1
  const nextNodes = nodes.map((node, index) => {
    const shape = ['lowcut', 'lowshelf', 'bell', 'notch', 'highshelf', 'highcut', 'bandpass']
      .includes(node && (node.shape || node.type))
      ? (node.shape || node.type)
      : 'bell'
    const solo = !!node.solo
    if (solo) soloIndex = index
    return {
      id: node.id || index + 1,
      enabled: node.enabled !== false,
      solo: false,
      shape,
      freq: clamp(node.freq ?? node.frequency ?? 1000, EQ_FREQ_MIN, EQ_FREQ_MAX),
      gain: clamp(node.gain ?? 0, EQ_NODE_GAIN_MIN, EQ_NODE_GAIN_MAX),
      q: clamp(node.q ?? 0.9, EQ_Q_MIN, EQ_Q_MAX),
      slope: nearestSlope(node.slope ?? 12)
    }
  })
  if (soloIndex >= 0 && nextNodes[soloIndex]) nextNodes[soloIndex].solo = true
  return {
    outputGainDb: clamp(src.outputGainDb ?? 0, EQ_OUTPUT_GAIN_MIN, EQ_OUTPUT_GAIN_MAX),
    autoGain: !!src.autoGain,
    nodes: nextNodes
  }
}

export function createEqualizerXProcessor (sr = 48000) {
  return new (loadEqualizerXApi().EqualizerXProcessor)(sr)
}
