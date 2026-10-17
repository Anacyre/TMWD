/** Geometry for the Twin panel. Viewboxes are unitless so pointer math matches the SVG. */

export const FILTER_W = 100
export const FILTER_H = 60
export const ENV_W = 100
export const ENV_H = 40
export const ENV_SPAN = 8

const F_MIN = 40
const F_MAX = 18000
const DB_LO = -36
const DB_HI = 18

function clamp (n, a, b) {
  return Math.min(b, Math.max(a, n))
}

export function freqToX (hz) {
  const t = Math.log(Math.max(F_MIN, hz) / F_MIN) / Math.log(F_MAX / F_MIN)
  return 4 + clamp(t, 0, 1) * 92
}

export function xToFreq (x) {
  const t = clamp((x - 4) / 92, 0, 1)
  return F_MIN * Math.pow(F_MAX / F_MIN, t)
}

export function dbToY (db) {
  const t = clamp((db - DB_LO) / (DB_HI - DB_LO), 0, 1)
  return 56 - t * 52
}

export function yToDb (y) {
  const t = clamp((56 - y) / 52, 0, 1)
  return DB_LO + t * (DB_HI - DB_LO)
}

export function nodeY (res) {
  return dbToY(clamp(res, 0, 0.95) * 16)
}

export function yToRes (y) {
  return clamp(yToDb(y) / 16, 0, 0.95)
}

export function filterDb (hz, filt) {
  const cutoff = Math.max(F_MIN, Number(filt.cutoff) || 1000)
  const res = clamp(Number(filt.res) || 0, 0, 0.95)
  const ratio = Math.max(0.0001, hz / cutoff)
  const peak = res * 16 * Math.exp(-Math.pow(Math.log(ratio), 2) / 0.045)
  let slope = 0
  if (filt.type === 'highpass') slope = ratio >= 1 ? 0 : -18 * Math.log2(1 / ratio)
  else if (filt.type === 'bandpass') slope = -14 * Math.abs(Math.log2(ratio))
  else slope = ratio <= 1 ? 0 : -18 * Math.log2(ratio)
  return Math.max(DB_LO, Math.min(DB_HI, slope + peak))
}

export function filterCurve (filt, n = 72) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const hz = F_MIN * Math.pow(F_MAX / F_MIN, t)
    pts.push({ x: 4 + t * 92, y: dbToY(filterDb(hz, filt)) })
  }
  return pts
}

export function serialCurve (a, b, n = 72) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const hz = F_MIN * Math.pow(F_MAX / F_MIN, t)
    const db = Math.max(DB_LO, Math.min(DB_HI, filterDb(hz, a) + Math.min(0, filterDb(hz, b))))
    pts.push({ x: 4 + t * 92, y: dbToY(db) })
  }
  return pts
}

export function toPath (pts) {
  return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' ')
}

export function xToSec (x) {
  return clamp(((x - 6) / 88) * ENV_SPAN, 0, ENV_SPAN)
}

export function envPoints (env) {
  const a = clamp(Number(env.attack) || 0.01, 0.001, 4)
  const d = clamp(Number(env.decay) || 0.2, 0.01, 6)
  const r = clamp(Number(env.release) || 0.2, 0.01, 8)
  const s = clamp(Number(env.sustain) || 0, 0, 1)
  const hold = 0.55
  const x = (sec) => 6 + clamp(sec / ENV_SPAN, 0, 1) * 88
  const y = 4 + (1 - s) * 30
  return {
    s0: { x: 6, y: 34, id: 's0' },
    a: { x: x(a), y: 4, id: 'a' },
    d: { x: x(a + d), y, id: 'd' },
    h: { x: x(a + d + hold), y, id: 'h' },
    r: { x: x(Math.min(ENV_SPAN, a + d + hold + r)), y: 34, id: 'r' }
  }
}

export function envPath (env) {
  const p = envPoints(env)
  return toPath([p.s0, p.a, p.d, p.h, p.r])
}

export function lfoPath (shape) {
  const pts = []
  for (let i = 0; i <= 32; i++) {
    const t = i / 32
    let y = 0.5
    if (shape === 'square') y = t < 0.5 ? 0.22 : 0.78
    else if (shape === 'saw') y = 0.22 + t * 0.56
    else y = 0.5 - Math.sin(t * Math.PI * 2) * 0.28
    pts.push({ x: 4 + t * 92, y: y * 36 })
  }
  return toPath(pts)
}

export function wavePath (wave) {
  const pts = []
  for (let i = 0; i <= 28; i++) {
    const t = i / 28
    let y = 8
    if (wave === 'square') y = (t % 0.5) < 0.25 ? 3 : 13
    else if (wave === 'tri') y = 8 - (1 - 4 * Math.abs(Math.round(t) - t)) * 5
    else if (wave === 'sine' || (typeof wave === 'string' && wave.indexOf('wt') === 0)) y = 8 - Math.sin(t * Math.PI * 2) * 5
    else if (wave === 'noise') y = 8 + (((i * 13) % 9) - 4) * 1.1
    else y = 3 + t * 10
    pts.push({ x: t * 36, y })
  }
  return toPath(pts)
}

export const WAVE_CHOICES = [
  { id: 'saw', label: 'Saw' },
  { id: 'square', label: 'Square' },
  { id: 'tri', label: 'Triangle' },
  { id: 'sine', label: 'Sine' },
  { id: 'noise', label: 'Noise' },
  { id: 'wt0', label: 'Soft' },
  { id: 'wt1', label: 'Bright' },
  { id: 'wt2', label: 'Odd' },
  { id: 'wt3', label: 'Hollow' },
  { id: 'wt4', label: 'Organ' },
  { id: 'wt5', label: 'Stack' },
  { id: 'wt6', label: 'Air' },
  { id: 'wt7', label: 'Glass' }
]
