/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Port of vital::FlangerModule (triangle-modulated clamped delay).
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { mergeState, exp2, num, createProcessor } from './params.js'
import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'

export function defaultFlangerLiteState () {
  return {
    mix: 0.5,
    feedback: 0.5,
    frequency: 4,
    sync: 1,
    tempo: 4,
    centerMidi: 64,
    modDepth: 0.5,
    phaseOffset: 0.33333333,
    bpm: 120
  }
}

export function normalizeFlangerLiteState (state) {
  const s = mergeState(defaultFlangerLiteState(), state && typeof state === 'object' ? state : {})
  return {
    mix: num(s.mix, 0.5, 0, 0.5),
    feedback: num(s.feedback, 0.5, -1, 1),
    frequency: num(s.frequency, 4, exp2(-5), exp2(2)),
    sync: Math.round(num(s.sync, 1, 0, 3)),
    tempo: Math.round(num(s.tempo, 4, 0, 10)),
    centerMidi: num(s.centerMidi, 64, 8, 136),
    modDepth: num(s.modDepth, 0.5, 0, 1),
    phaseOffset: num(s.phaseOffset, 0.33333333, 0, 1),
    bpm: num(s.bpm, 120, 20, 400)
  }
}

export const FLANGER_LITE_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: defaultFlangerLiteState() },
  { id: 'jet', name: 'Jet', state: { mix: 0.5, feedback: 0.72, modDepth: 0.8, frequency: 0.4 } },
  { id: 'slow', name: 'Slow', state: { mix: 0.35, feedback: 0.35, frequency: 0.08, modDepth: 0.4 } }
]

export const FLANGER_LITE_PARAMETERS = [
  { id: 'flangerLite.mix', name: 'Mix', min: 0, max: 0.5, default: 0.5, unit: '%', automatable: true },
  { id: 'flangerLite.feedback', name: 'Feedback', min: -1, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'flangerLite.frequency', name: 'Frequency', min: 0.03125, max: 4, default: 4, unit: 'Hz', scale: 'log', automatable: true },
  { id: 'flangerLite.centerMidi', name: 'Center', min: 8, max: 136, default: 64, unit: 'st', automatable: true },
  { id: 'flangerLite.modDepth', name: 'Mod Depth', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'flangerLite.phaseOffset', name: 'Phase Offset', min: 0, max: 1, default: 0.333, unit: '', automatable: true }
]

export const VITAL_LITE_FLANGER_PROCESSOR_SOURCE = `
class VitalLiteFlangerProcessor {
  constructor (sr) {
    this.sr = sr || 44100
    this.dL = new VlDelay(Math.ceil(this.sr * 0.05))
    this.dR = new VlDelay(Math.ceil(this.sr * 0.05))
    this.phase = 0
  }
  process (l, r, n, state) {
    var sr = this.sr
    var hz = state.sync ? vlSyncHz(state.bpm, state.tempo, state.sync) : Math.max(0.01, state.frequency || 0.25)
    var wet = vlEqWet(vlClamp(state.mix, 0, 0.5) * 2)
    var dry = vlEqDry(vlClamp(state.mix, 0, 0.5) * 2)
    var fb = vlClamp(state.feedback, -0.97, 0.97)
    var center = 1 / Math.max(20, vlMidiToHz(state.centerMidi || 64))
    var buf = 0.0005
    var depth = vlClamp(state.modDepth, 0, 1)
    var off = vlClamp(state.phaseOffset, 0, 1)
    var inc = hz / sr
    function tri (p) {
      var x = p - Math.floor(p)
      return x < 0.5 ? x * 4 - 1 : 3 - x * 4
    }
    for (var i = 0; i < n; i++) {
      this.phase += inc
      if (this.phase >= 1) this.phase -= 1
      var modL = depth * tri(this.phase - off / 2) + 1
      var modR = depth * tri(this.phase - off / 2 + off) + 1
      var delL = Math.max(buf, (center - buf) * modL + buf)
      var delR = Math.max(buf, (center - buf) * modR + buf)
      var yL = this.dL.read(delL * sr)
      var yR = this.dR.read(delR * sr)
      this.dL.write(vlTanh(l[i] + yL * fb))
      this.dR.write(vlTanh(r[i] + yR * fb))
      l[i] = dry * l[i] + wet * yL
      r[i] = dry * r[i] + wet * yR
    }
  }
}
`

export function createFlangerLiteProcessor (sampleRate) {
  return createProcessor(VITAL_LITE_SHIM_SOURCE + VITAL_LITE_FLANGER_PROCESSOR_SOURCE, 'VitalLiteFlangerProcessor', sampleRate)
}
