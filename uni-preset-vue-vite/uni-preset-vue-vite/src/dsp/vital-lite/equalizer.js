/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Port of vital::EqualizerModule (three DigitalSvf bands).
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { mergeState, num, idx, EQ_LOW_MODES, EQ_BAND_MODES, EQ_HIGH_MODES, createProcessor } from './params.js'
import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'

export function defaultEqualizerLiteState () {
  return {
    lowMode: 'highpass',
    lowMidi: 40,
    lowGainDb: 0,
    lowRes: 0.3163,
    bandMode: 'notch',
    bandMidi: 80,
    bandGainDb: 0,
    bandRes: 0.4473,
    highMode: 'lowpass',
    highMidi: 100,
    highGainDb: 0,
    highRes: 0.3163
  }
}

export function normalizeEqualizerLiteState (state) {
  const s = mergeState(defaultEqualizerLiteState(), state && typeof state === 'object' ? state : {})
  return {
    lowMode: idx(s.lowMode, 0, EQ_LOW_MODES),
    lowMidi: num(s.lowMidi, 40, 8, 136),
    lowGainDb: num(s.lowGainDb, 0, -15, 15),
    lowRes: num(s.lowRes, 0.3163, 0, 1),
    bandMode: idx(s.bandMode, 0, EQ_BAND_MODES),
    bandMidi: num(s.bandMidi, 80, 8, 136),
    bandGainDb: num(s.bandGainDb, 0, -15, 15),
    bandRes: num(s.bandRes, 0.4473, 0, 1),
    highMode: idx(s.highMode, 0, EQ_HIGH_MODES),
    highMidi: num(s.highMidi, 100, 8, 136),
    highGainDb: num(s.highGainDb, 0, -15, 15),
    highRes: num(s.highRes, 0.3163, 0, 1)
  }
}

export const EQUALIZER_LITE_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: defaultEqualizerLiteState() },
  { id: 'air', name: 'Air', state: { highMode: 'highshelf', highMidi: 110, highGainDb: 3, lowMode: 'highpass', lowMidi: 36 } },
  { id: 'warm', name: 'Warm', state: { lowMode: 'lowshelf', lowMidi: 48, lowGainDb: 2.5, highMode: 'highshelf', highGainDb: -1.5 } }
]

export const EQUALIZER_LITE_PARAMETERS = [
  { id: 'equalizerLite.lowMidi', name: 'Low Cutoff', min: 8, max: 136, default: 40, unit: 'st', automatable: true },
  { id: 'equalizerLite.lowGainDb', name: 'Low Gain', min: -15, max: 15, default: 0, unit: 'dB', automatable: true },
  { id: 'equalizerLite.bandMidi', name: 'Band Cutoff', min: 8, max: 136, default: 80, unit: 'st', automatable: true },
  { id: 'equalizerLite.bandGainDb', name: 'Band Gain', min: -15, max: 15, default: 0, unit: 'dB', automatable: true },
  { id: 'equalizerLite.highMidi', name: 'High Cutoff', min: 8, max: 136, default: 100, unit: 'st', automatable: true },
  { id: 'equalizerLite.highGainDb', name: 'High Gain', min: -15, max: 15, default: 0, unit: 'dB', automatable: true }
]

export const VITAL_LITE_EQUALIZER_PROCESSOR_SOURCE = `
class VitalLiteEqualizerProcessor {
  constructor (sr) {
    this.sr = sr || 44100
    this.lowL = new VlSvf(); this.lowR = new VlSvf()
    this.midL = new VlSvf(); this.midR = new VlSvf()
    this.highL = new VlSvf(); this.highR = new VlSvf()
  }
  band (svf, x, midi, res, mode, gainDb) {
    var g = Math.tan(Math.PI * vlClamp(vlMidiToHz(midi), 20, this.sr * 0.45) / this.sr)
    var k = 2 - 1.85 * vlClamp(res, 0, 1)
    var t = svf.tick(x, g, k)
    var amp = vlDbLin(gainDb)
    if (mode === 'highpass') return t.hp
    if (mode === 'lowshelf') return x + t.lp * (amp - 1)
    if (mode === 'highshelf') return x + t.hp * (amp - 1)
    if (mode === 'lowpass') return t.lp
    if (mode === 'notch') return t.notch
    return x + t.bp * (amp - 1)
  }
  process (l, r, n, state) {
    for (var i = 0; i < n; i++) {
      var yL = this.band(this.lowL, l[i], state.lowMidi, state.lowRes, state.lowMode, state.lowGainDb)
      var yR = this.band(this.lowR, r[i], state.lowMidi, state.lowRes, state.lowMode, state.lowGainDb)
      yL = this.band(this.midL, yL, state.bandMidi, state.bandRes, state.bandMode, state.bandGainDb)
      yR = this.band(this.midR, yR, state.bandMidi, state.bandRes, state.bandMode, state.bandGainDb)
      l[i] = this.band(this.highL, yL, state.highMidi, state.highRes, state.highMode, state.highGainDb)
      r[i] = this.band(this.highR, yR, state.highMidi, state.highRes, state.highMode, state.highGainDb)
    }
  }
}
`

export function createEqualizerLiteProcessor (sampleRate) {
  return createProcessor(VITAL_LITE_SHIM_SOURCE + VITAL_LITE_EQUALIZER_PROCESSOR_SOURCE, 'VitalLiteEqualizerProcessor', sampleRate)
}
