/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Port of vital::MultibandCompressor (LR4 at 120/2500 Hz, up/downward).
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { mergeState, num, idx, COMPRESSOR_BANDS, createProcessor } from './params.js'
import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'

export function defaultCompressorLiteState () {
  return {
    mix: 1,
    attack: 0.5,
    release: 0.5,
    bands: 'multiband',
    lowUpperDb: -28,
    bandUpperDb: -25,
    highUpperDb: -30,
    lowLowerDb: -35,
    bandLowerDb: -36,
    highLowerDb: -35,
    lowUpperRatio: 0.9,
    bandUpperRatio: 0.857,
    highUpperRatio: 1,
    lowLowerRatio: 0.8,
    bandLowerRatio: 0.8,
    highLowerRatio: 0.8,
    lowGainDb: 16.3,
    bandGainDb: 11.7,
    highGainDb: 16.3
  }
}

export function normalizeCompressorLiteState (state) {
  const s = mergeState(defaultCompressorLiteState(), state && typeof state === 'object' ? state : {})
  const n = (k, d, a, b) => num(s[k], d, a, b)
  return {
    mix: n('mix', 1, 0, 1),
    attack: n('attack', 0.5, 0, 1),
    release: n('release', 0.5, 0, 1),
    bands: idx(s.bands, 0, COMPRESSOR_BANDS),
    lowUpperDb: n('lowUpperDb', -28, -80, 0),
    bandUpperDb: n('bandUpperDb', -25, -80, 0),
    highUpperDb: n('highUpperDb', -30, -80, 0),
    lowLowerDb: n('lowLowerDb', -35, -80, 0),
    bandLowerDb: n('bandLowerDb', -36, -80, 0),
    highLowerDb: n('highLowerDb', -35, -80, 0),
    lowUpperRatio: n('lowUpperRatio', 0.9, 0, 1),
    bandUpperRatio: n('bandUpperRatio', 0.857, 0, 1),
    highUpperRatio: n('highUpperRatio', 1, 0, 1),
    lowLowerRatio: n('lowLowerRatio', 0.8, -1, 1),
    bandLowerRatio: n('bandLowerRatio', 0.8, -1, 1),
    highLowerRatio: n('highLowerRatio', 0.8, -1, 1),
    lowGainDb: n('lowGainDb', 16.3, -30, 30),
    bandGainDb: n('bandGainDb', 11.7, -30, 30),
    highGainDb: n('highGainDb', 16.3, -30, 30)
  }
}

export const COMPRESSOR_LITE_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: defaultCompressorLiteState() },
  { id: 'glue', name: 'Glue', state: { mix: 0.7, attack: 0.65, release: 0.4, lowGainDb: 4, bandGainDb: 2, highGainDb: 3 } },
  { id: 'upward', name: 'Upward', state: { mix: 0.5, lowLowerRatio: -0.4, bandLowerRatio: -0.3, highLowerRatio: -0.2 } }
]

export const COMPRESSOR_LITE_PARAMETERS = [
  { id: 'compressorLite.mix', name: 'Mix', min: 0, max: 1, default: 1, unit: '%', automatable: true },
  { id: 'compressorLite.attack', name: 'Attack', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'compressorLite.release', name: 'Release', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'compressorLite.lowGainDb', name: 'Low Gain', min: -30, max: 30, default: 16.3, unit: 'dB', automatable: true },
  { id: 'compressorLite.bandGainDb', name: 'Band Gain', min: -30, max: 30, default: 11.7, unit: 'dB', automatable: true },
  { id: 'compressorLite.highGainDb', name: 'High Gain', min: -30, max: 30, default: 16.3, unit: 'dB', automatable: true }
]

export const VITAL_LITE_COMPRESSOR_PROCESSOR_SOURCE = `
function VlBandComp (atkMs, relMs) {
  this.atkMs = atkMs
  this.relMs = relMs
  this.hiMs = 0
  this.loMs = 0
}
VlBandComp.prototype.reset = function () { this.hiMs = 0; this.loMs = 0 }
VlBandComp.prototype.tick = function (x, sr, st, upperDb, lowerDb, upperR, lowerR, gainDb, atk, rel) {
  var spms = sr / 1000
  var atkSamp = Math.max(5, Math.exp(vlClamp(atk, 0, 1) * 8 - 4) * this.atkMs * spms)
  var relSamp = Math.max(5, Math.exp(vlClamp(rel, 0, 1) * 8 - 4) * this.relMs * spms)
  var atkS = 1 / (atkSamp + 1)
  var relS = 1 / (relSamp + 1)
  var sq = x * x
  var hiAtk = sq > this.hiMs
  this.hiMs = (sq + this.hiMs * (hiAtk ? atkSamp : relSamp)) * (hiAtk ? atkS : relS)
  var upper = vlDbLin(upperDb)
  upper *= upper
  if (this.hiMs < upper) this.hiMs = upper
  var upperMult = Math.pow(upper / Math.max(this.hiMs, 1e-20), vlClamp(upperR, 0, 1) * 0.5)
  var loAtk = sq > this.loMs
  this.loMs = (sq + this.loMs * (loAtk ? atkSamp : relSamp)) * (loAtk ? atkS : relS)
  var lower = vlDbLin(lowerDb)
  lower *= lower
  if (this.loMs > lower) this.loMs = lower
  var lowerMult = Math.pow(lower / Math.max(this.loMs, 1e-20), vlClamp(lowerR, -1, 1) * 0.5)
  var g = vlClamp(upperMult * lowerMult, 0, 32) * vlDbLin(gainDb)
  return x * g
}
class VitalLiteCompressorProcessor {
  constructor (sr) {
    this.sr = sr || 44100
    this.lowSplitL = new VlLr4(120, this.sr)
    this.lowSplitR = new VlLr4(120, this.sr)
    this.highSplitL = new VlLr4(2500, this.sr)
    this.highSplitR = new VlLr4(2500, this.sr)
    this.lowL = new VlBandComp(2.8, 40)
    this.lowR = new VlBandComp(2.8, 40)
    this.bandL = new VlBandComp(1.4, 28)
    this.bandR = new VlBandComp(1.4, 28)
    this.highL = new VlBandComp(0.7, 15)
    this.highR = new VlBandComp(0.7, 15)
    this.gr = 0
  }
  process (l, r, n, state) {
    var sr = this.sr
    var mix = vlClamp(state.mix, 0, 1)
    var mode = state.bands || 'multiband'
    var useLow = mode === 'multiband' || mode === 'low-band' || mode === 'single'
    var useHigh = mode === 'multiband' || mode === 'high-band'
    var useBand = mode === 'multiband' || mode === 'low-band' || mode === 'high-band'
    if (mode === 'single') { useBand = true; useLow = false; useHigh = false }
    var gr = 0
    for (var i = 0; i < n; i++) {
      var inL = l[i]
      var inR = r[i]
      var a = this.lowSplitL.split(inL)
      var b = this.lowSplitR.split(inR)
      var loL = a.lo
      var restL = a.hi
      var loR = b.lo
      var restR = b.hi
      var c = this.highSplitL.split(restL)
      var d = this.highSplitR.split(restR)
      var midL = c.lo
      var hiL = c.hi
      var midR = d.lo
      var hiR = d.hi
      if (mode === 'single') { midL = inL; midR = inR; loL = 0; loR = 0; hiL = 0; hiR = 0 }
      var yLoL = useLow ? this.lowL.tick(loL, sr, state, state.lowUpperDb, state.lowLowerDb, state.lowUpperRatio, state.lowLowerRatio, state.lowGainDb, state.attack, state.release) : loL
      var yLoR = useLow ? this.lowR.tick(loR, sr, state, state.lowUpperDb, state.lowLowerDb, state.lowUpperRatio, state.lowLowerRatio, state.lowGainDb, state.attack, state.release) : loR
      var yMidL = useBand ? this.bandL.tick(midL, sr, state, state.bandUpperDb, state.bandLowerDb, state.bandUpperRatio, state.bandLowerRatio, state.bandGainDb, state.attack, state.release) : midL
      var yMidR = useBand ? this.bandR.tick(midR, sr, state, state.bandUpperDb, state.bandLowerDb, state.bandUpperRatio, state.bandLowerRatio, state.bandGainDb, state.attack, state.release) : midR
      var yHiL = useHigh ? this.highL.tick(hiL, sr, state, state.highUpperDb, state.highLowerDb, state.highUpperRatio, state.highLowerRatio, state.highGainDb, state.attack, state.release) : hiL
      var yHiR = useHigh ? this.highR.tick(hiR, sr, state, state.highUpperDb, state.highLowerDb, state.highUpperRatio, state.highLowerRatio, state.highGainDb, state.attack, state.release) : hiR
      var yL = yLoL + yMidL + yHiL
      var yR = yLoR + yMidR + yHiR
      l[i] = inL + (yL - inL) * mix
      r[i] = inR + (yR - inR) * mix
      var g = Math.abs(inL) > 1e-6 ? Math.abs(yL) / Math.abs(inL) : 1
      if (g < 1 && 1 - g > gr) gr = 1 - g
    }
    this.gr = gr
  }
}
`

export function createCompressorLiteProcessor (sampleRate) {
  return createProcessor(VITAL_LITE_SHIM_SOURCE + VITAL_LITE_COMPRESSOR_PROCESSOR_SOURCE, 'VitalLiteCompressorProcessor', sampleRate)
}
