/** Dynamic X compressor math and serialized state. UI never processes samples. */

import { clamp, mergeState } from './plugin.js'

export const DYNAMIC_X_EPS = 1e-12
export const DYNAMIC_X_MIN_DB = -120
export const DYNAMIC_X_GR_MIN_DB = -60
export const DYNAMIC_X_AUTO_GAIN_FACTOR = 0.65
export const DYNAMIC_X_GR_METER_SPAN_DB = 24

export function defaultDynamicState () {
  return {
    threshold: -18,
    ratio: 4,
    attack: 0.012,
    release: 0.12,
    autoRelease: false,
    makeupDb: 0,
    autoGain: false,
    splitBands: false,
    xo1: 180,
    xo2: 3500,
    bands: [
      { enabled: true, solo: false, threshold: -18, ratio: 4 },
      { enabled: true, solo: false, threshold: -18, ratio: 4 },
      { enabled: true, solo: false, threshold: -18, ratio: 4 }
    ]
  }
}

export function compressorGainDb (inputDb, thresholdDb, ratio) {
  if (!(inputDb > thresholdDb)) return 0
  const r = Math.max(1, ratio)
  const outputDb = thresholdDb + (inputDb - thresholdDb) / r
  const grDb = outputDb - inputDb
  if (grDb > 0) return 0
  if (grDb < DYNAMIC_X_GR_MIN_DB) return DYNAMIC_X_GR_MIN_DB
  return grDb
}

export function compressorOutputDb (inputDb, thresholdDb, ratio) {
  return inputDb + compressorGainDb(inputDb, thresholdDb, ratio)
}

export function compressorCurve (thresholdDb, ratio, points = 64) {
  const n = Math.max(2, points | 0)
  const pts = []
  for (let i = 0; i < n; i++) {
    const inDb = -60 + (60 * i) / (n - 1)
    pts.push({ inDb, outDb: compressorOutputDb(inDb, thresholdDb, ratio) })
  }
  return pts
}

export function dbToLin (db) {
  const x = clamp(db, DYNAMIC_X_MIN_DB, 60)
  return Math.pow(10, x / 20)
}

export function linToDb (lin) {
  return 20 * Math.log10(Math.max(DYNAMIC_X_EPS, lin))
}

export function envelopeCoeff (seconds, sampleRate) {
  const t = Math.max(1e-5, seconds) * Math.max(1, sampleRate)
  return Math.exp(-1 / t)
}

export function blockEnvelopeCoeff (seconds, sampleRate, blockSize) {
  const t = Math.max(1e-5, seconds) * Math.max(1, sampleRate)
  return Math.exp(-Math.max(1, blockSize) / t)
}

export function autoMakeupDb (avgGrDb, factor = DYNAMIC_X_AUTO_GAIN_FACTOR) {
  return clamp(-avgGrDb * factor, 0, 12)
}

export function grMeterAmount (gainReductionDb, spanDb = DYNAMIC_X_GR_METER_SPAN_DB) {
  return clamp(-gainReductionDb / Math.max(1, spanDb), 0, 1)
}

export function normalizeDynamicState (state) {
  const src = state && typeof state === 'object' ? state : {}
  const fallback = defaultDynamicState()
  const merged = mergeState(fallback, src)
  const bandsIn = Array.isArray(merged.bands) ? merged.bands : fallback.bands
  const bands = []
  for (let i = 0; i < 3; i++) {
    const band = bandsIn[i] || fallback.bands[i]
    bands.push({
      enabled: band.enabled !== false,
      solo: !!band.solo,
      threshold: clamp(band.threshold == null ? merged.threshold : band.threshold, -48, 0),
      ratio: clamp(band.ratio == null ? merged.ratio : band.ratio, 1, 20)
    })
  }
  let xo1 = clamp(merged.xo1 == null ? 180 : merged.xo1, 40, 800)
  let xo2 = clamp(merged.xo2 == null ? 3500 : merged.xo2, 800, 12000)
  if (xo2 < xo1 + 80) xo2 = Math.min(12000, xo1 + 80)
  return {
    threshold: clamp(merged.threshold, -48, 0),
    ratio: clamp(merged.ratio, 1, 20),
    attack: clamp(merged.attack, 0.001, 0.2),
    release: clamp(merged.release, 0.02, 1.5),
    autoRelease: !!merged.autoRelease,
    makeupDb: clamp(merged.makeupDb, -12, 24),
    autoGain: !!merged.autoGain,
    splitBands: !!merged.splitBands,
    xo1,
    xo2,
    bands
  }
}
