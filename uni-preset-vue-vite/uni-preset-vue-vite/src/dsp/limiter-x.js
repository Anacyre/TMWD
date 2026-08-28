/** Limiter X DSP — stereo-linked peak limiter with a fixed -0.1 dBFS ceiling.
 *  UI never processes samples. Parameter semantics match the native C++ core.
 *
 *  Peak-detect fallback (deterministic, internal — not a user parameter):
 *    2 = 4x cubic interpolation (default)
 *    1 = 2x cubic interpolation
 *    0 = sample-peak only
 *  Reduce peak-detect mode only after cutting visualization rate/resolution.
 */

import { clamp, mergeState } from './plugin.js'

export const LIMITER_X_THRESHOLD_DB = -0.1
export const LIMITER_X_EPS = 1e-12
export const LIMITER_X_GAIN_MIN_DB = -12
export const LIMITER_X_GAIN_MAX_DB = 18
export const LIMITER_X_GAIN_DEFAULT_DB = 0
export const LIMITER_X_RELEASE_MIN_MS = 10
export const LIMITER_X_RELEASE_MAX_MS = 1000
export const LIMITER_X_RELEASE_DEFAULT_MS = 100
export const LIMITER_X_GR_SPAN_DB = 12
export const LIMITER_X_PEAK_HOLD_MS = 400
export const LIMITER_X_GAIN_SMOOTH_SEC = 0.008
export const LIMITER_X_MIN_DB = -120

export const LIMITER_X_PEAK_MODE = {
  SAMPLE: 0,
  X2: 1,
  X4: 2
}

export function defaultLimiterState () {
  return {
    gainDb: LIMITER_X_GAIN_DEFAULT_DB,
    releaseMs: LIMITER_X_RELEASE_DEFAULT_MS
  }
}

export function normalizeLimiterState (state) {
  const src = state && typeof state === 'object' ? state : {}
  const merged = mergeState(defaultLimiterState(), src)
  return {
    gainDb: clamp(Number(merged.gainDb), LIMITER_X_GAIN_MIN_DB, LIMITER_X_GAIN_MAX_DB),
    releaseMs: clamp(Number(merged.releaseMs), LIMITER_X_RELEASE_MIN_MS, LIMITER_X_RELEASE_MAX_MS)
  }
}

export function limiterDbToLin (db) {
  const x = clamp(db, LIMITER_X_MIN_DB, 60)
  return Math.pow(10, x / 20)
}

export function limiterLinToDb (lin) {
  return 20 * Math.log10(Math.max(LIMITER_X_EPS, lin))
}

export function limiterCeilingLin (thresholdDb = LIMITER_X_THRESHOLD_DB) {
  return limiterDbToLin(thresholdDb)
}

export function targetGainReductionDb (peakDb, thresholdDb = LIMITER_X_THRESHOLD_DB) {
  if (!(peakDb > thresholdDb)) return 0
  return thresholdDb - peakDb
}

export function limiterReleaseCoeff (releaseMs, sampleRate) {
  const seconds = Math.max(LIMITER_X_RELEASE_MIN_MS, releaseMs) / 1000
  const sr = Math.max(1, sampleRate)
  return Math.exp(-1 / (seconds * sr))
}

export function limiterGainSmoothCoeff (sampleRate, seconds = LIMITER_X_GAIN_SMOOTH_SEC) {
  const t = Math.max(1e-5, seconds) * Math.max(1, sampleRate)
  return 1 - Math.exp(-1 / t)
}

export function grMeterAmount (gainReductionDb, spanDb = LIMITER_X_GR_SPAN_DB) {
  return clamp(-gainReductionDb / Math.max(1, spanDb), 0, 1)
}

export function hermiteInterp (x0, x1, x2, x3, t) {
  const c1 = 0.5 * (x2 - x0)
  const c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3
  const c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2)
  return ((c3 * t + c2) * t + c1) * t + x1
}

export const LIMITER_X_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: { gainDb: 0, releaseMs: 100 } },
  { id: 'clean', name: 'Clean', state: { gainDb: 0, releaseMs: 150 } },
  { id: 'orchestral', name: 'Orchestral', state: { gainDb: 2, releaseMs: 180 } },
  { id: 'punch', name: 'Punch', state: { gainDb: 4, releaseMs: 60 } },
  { id: 'transparent', name: 'Transparent', state: { gainDb: 1, releaseMs: 250 } }
]

export function createLimiterProcessor (sampleRate) {
  const Ctor = new Function(LIMITER_X_PROCESSOR_SOURCE + '\nreturn LimiterXProcessor;')()
  return new Ctor(sampleRate)
}

/** Worklet-safe kernel. Concatenated into fx-worklet.js. No nested template literals. */
export const LIMITER_X_PROCESSOR_SOURCE = `
function limClamp (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }
function limDb (x) { return 20 * Math.log10(x < 1e-12 ? 1e-12 : x) }
function limLin (db) {
  if (db > 60) db = 60
  if (db < -120) db = -120
  return Math.pow(10, db / 20)
}
function limFinite (x) {
  return x === x && x !== Infinity && x !== -Infinity ? x : 0
}
function limFlush (x) {
  return x > -1e-18 && x < 1e-18 ? 0 : x
}
function limHermite (x0, x1, x2, x3, t) {
  const c1 = 0.5 * (x2 - x0)
  const c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3
  const c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2)
  return ((c3 * t + c2) * t + c1) * t + x1
}

class LimiterXProcessor {
  constructor (sr) {
    this.sr = sr > 0 ? sr : 48000
    this.ceilingDb = -0.1
    this.ceiling = limLin(-0.1)
    this.peakMode = 2
    this.gainDb = 0
    this.gainLin = 1
    this.relMs = 100
    this.alpha = Math.exp(-1 / (0.1 * this.sr))
    this.gainSmooth = 1 - Math.exp(-1 / (0.008 * this.sr))
    this.env = 1
    this.prev2L = 0
    this.prev1L = 0
    this.prev2R = 0
    this.prev1R = 0
    this.peakIn = 0
    this.peakOut = 0
    this.grLin = 1
    this.blockN = 0
    this.meters = {
      inPeak: 0,
      outPeak: 0,
      gr: 0,
      gainReductionDb: 0,
      inputPeakDb: -120,
      outputPeakDb: -120
    }
  }

  reset () {
    this.env = 1
    this.gainLin = limLin(this.gainDb)
    this.prev2L = this.prev1L = 0
    this.prev2R = this.prev1R = 0
    this.peakIn = 0
    this.peakOut = 0
    this.grLin = 1
  }

  setPeakMode (mode) {
    this.peakMode = mode < 0 ? 0 : mode > 2 ? 2 : (mode | 0)
  }

  detectPeak (xL, xR) {
    const aL = xL < 0 ? -xL : xL
    const aR = xR < 0 ? -xR : xR
    let peak = aL > aR ? aL : aR
    const mode = this.peakMode
    if (mode < 1) return peak
    const steps = mode >= 2 ? 3 : 1
    const dt = 1 / (steps + 1)
    for (let k = 1; k <= steps; k++) {
      const t = dt * k
      const iL = limHermite(this.prev2L, this.prev1L, xL, xL, t)
      const iR = limHermite(this.prev2R, this.prev1R, xR, xR, t)
      const pL = iL < 0 ? -iL : iL
      const pR = iR < 0 ? -iR : iR
      const p = pL > pR ? pL : pR
      if (p > peak) peak = p
    }
    return peak
  }

  process (l, r, n, state) {
    if (!l || n < 1) return
    const dual = !!(r && r !== l)
    const st = state || {}
    const gainT = limClamp(st.gainDb == null ? 0 : st.gainDb, -12, 18)
    const relT = limClamp(st.releaseMs == null ? 100 : st.releaseMs, 10, 1000)
    const aBlk = 1 - Math.exp(-n / (0.008 * this.sr))
    this.gainDb += (gainT - this.gainDb) * aBlk
    this.relMs += (relT - this.relMs) * aBlk
    const targetLin = limLin(this.gainDb)
    this.alpha = Math.exp(-1 / ((this.relMs * 0.001) * this.sr))
    const ceil = this.ceiling
    const aG = this.gainSmooth
    const alpha = this.alpha
    const oneMinus = 1 - alpha
    let gIn = this.gainLin
    let env = this.env
    let peakIn = 0
    let peakOut = 0
    let minEnv = 1

    for (let i = 0; i < n; i++) {
      gIn += (targetLin - gIn) * aG
      let xL = limFinite(l[i] * gIn)
      let xR = dual ? limFinite(r[i] * gIn) : xL
      const peak = this.detectPeak(xL, xR)
      if (peak > peakIn) peakIn = peak
      let target = 1
      if (peak > ceil) target = ceil / peak
      if (target < env) env = target
      else env = alpha * env + oneMinus * target
      env = limFlush(env)
      if (env > 1) env = 1
      if (env < 1e-6) env = 1e-6
      if (env < minEnv) minEnv = env
      let yL = xL * env
      let yR = xR * env
      let outP = yL < 0 ? -yL : yL
      const aR = yR < 0 ? -yR : yR
      if (aR > outP) outP = aR
      if (outP > ceil) {
        const s = ceil / outP
        yL *= s
        yR *= s
        env *= s
        outP = ceil
      }
      yL = limFlush(limFinite(yL))
      yR = limFlush(limFinite(yR))
      l[i] = yL
      if (dual) r[i] = yR
      if (outP > peakOut) peakOut = outP
      this.prev2L = this.prev1L
      this.prev1L = xL
      this.prev2R = this.prev1R
      this.prev1R = xR
    }

    this.env = env
    this.gainLin = gIn
    this.grLin = minEnv
    const decay = Math.exp(-n / (0.14 * this.sr))
    this.peakIn = Math.max(this.peakIn * decay, peakIn)
    this.peakOut = Math.max(this.peakOut * decay, peakOut)
    const grDb = minEnv >= 1 ? 0 : limDb(minEnv)
    const m = this.meters
    m.inPeak = this.peakIn
    m.outPeak = this.peakOut
    m.inputPeakDb = limDb(this.peakIn)
    m.outputPeakDb = limDb(this.peakOut)
    m.gainReductionDb = grDb
    m.gr = limClamp(-grDb / 12, 0, 1)
    this.blockN++
  }
}
`
