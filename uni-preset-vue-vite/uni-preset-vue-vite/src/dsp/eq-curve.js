import { freqToNorm } from './plugin.js'
import { eqResponseDb as eqResponseFromBiquad, eqCurvePoints as eqCurveFromBiquad } from './equalizer-x.js'

export function eqResponseDb (freq, nodes, sr = 48000) {
  return eqResponseFromBiquad(freq, nodes, sr)
}

export function eqCurvePoints (nodes, width, height, minDb = -18, maxDb = 18, sr = 48000) {
  return eqCurveFromBiquad(nodes, width, height, minDb, maxDb, sr)
}

export function nodeToCanvas (node, width, height, minDb = -18, maxDb = 18) {
  const x = freqToNorm(node.freq) * width
  const y = (1 - ((node.gain || 0) - minDb) / (maxDb - minDb)) * height
  return { x, y }
}

export function canvasToNode (x, y, width, height, minDb = -18, maxDb = 18) {
  const t = Math.min(1, Math.max(0, x / Math.max(1, width)))
  const freq = Math.exp(Math.log(20) + t * (Math.log(20000) - Math.log(20)))
  const gain = maxDb - (y / Math.max(1, height)) * (maxDb - minDb)
  return { freq, gain: Math.min(maxDb, Math.max(minDb, gain)) }
}

export { compressorCurve } from './dynamic-x.js'
