/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Port of vital::Phaser / PhaserFilter (allpass cascade, LFO, blend, mix).
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { mergeState, exp2, num, createProcessor } from './params.js'
import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'

export function defaultPhaserLiteState () {
  return {
    mix: 1,
    feedback: 0.5,
    frequency: 0.125,
    sync: 1,
    tempo: 3,
    centerMidi: 80,
    blend: 1,
    modDepth: 24,
    phaseOffset: 0.33333333,
    bpm: 120
  }
}

export function normalizePhaserLiteState (state) {
  const s = mergeState(defaultPhaserLiteState(), state && typeof state === 'object' ? state : {})
  return {
    mix: num(s.mix, 1, 0, 1),
    feedback: num(s.feedback, 0.5, 0, 1),
    frequency: num(s.frequency, 0.125, exp2(-5), exp2(2)),
    sync: Math.round(num(s.sync, 1, 0, 3)),
    tempo: Math.round(num(s.tempo, 3, 0, 10)),
    centerMidi: num(s.centerMidi, 80, 8, 136),
    blend: num(s.blend, 1, 0, 2),
    modDepth: num(s.modDepth, 24, 0, 48),
    phaseOffset: num(s.phaseOffset, 0.33333333, 0, 1),
    bpm: num(s.bpm, 120, 20, 400)
  }
}

export const PHASER_LITE_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: defaultPhaserLiteState() },
  { id: 'deep', name: 'Deep', state: { mix: 0.85, feedback: 0.7, modDepth: 36, blend: 1.4 } },
  { id: 'slow', name: 'Slow', state: { mix: 0.6, frequency: 0.05, feedback: 0.35 } }
]

export const PHASER_LITE_PARAMETERS = [
  { id: 'phaserLite.mix', name: 'Mix', min: 0, max: 1, default: 1, unit: '%', automatable: true },
  { id: 'phaserLite.feedback', name: 'Feedback', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'phaserLite.frequency', name: 'Frequency', min: 0.03125, max: 4, default: 0.125, unit: 'Hz', scale: 'log', automatable: true },
  { id: 'phaserLite.centerMidi', name: 'Center', min: 8, max: 136, default: 80, unit: 'st', automatable: true },
  { id: 'phaserLite.modDepth', name: 'Mod Depth', min: 0, max: 48, default: 24, unit: 'st', automatable: true },
  { id: 'phaserLite.blend', name: 'Blend', min: 0, max: 2, default: 1, unit: '', automatable: true },
  { id: 'phaserLite.phaseOffset', name: 'Phase Offset', min: 0, max: 1, default: 0.333, unit: '', automatable: true }
]

export const VITAL_LITE_PHASER_PROCESSOR_SOURCE = `
function VlAllpass () { this.z = 0 }
VlAllpass.prototype.reset = function () { this.z = 0 }
VlAllpass.prototype.tick = function (x, a) {
  var y = -x * a + this.z
  this.z = y * a + x
  return y
}
class VitalLitePhaserProcessor {
  constructor (sr) {
    this.sr = sr || 44100
    this.apL = []
    this.apR = []
    for (var i = 0; i < 12; i++) {
      this.apL.push(new VlAllpass())
      this.apR.push(new VlAllpass())
    }
    this.fbL = 0
    this.fbR = 0
    this.phase = 0
  }
  process (l, r, n, state) {
    var sr = this.sr
    var hz = state.sync ? vlSyncHz(state.bpm, state.tempo, state.sync) : Math.max(0.01, state.frequency || 0.125)
    var mix = vlClamp(state.mix, 0, 1)
    var fb = vlClamp(state.feedback, 0, 0.97)
    var center = state.centerMidi || 80
    var depth = state.modDepth || 24
    var blend = vlClamp(state.blend, 0, 2)
    var off = vlClamp(state.phaseOffset, 0, 1)
    var inc = hz / sr
    for (var i = 0; i < n; i++) {
      this.phase += inc
      if (this.phase >= 1) this.phase -= 1
      var fold = function (p) { var x = p - Math.floor(p); return x < 0.5 ? x * 4 - 1 : 3 - x * 4 }
      var midiL = center + fold(this.phase) * depth
      var midiR = center + fold(this.phase + off) * depth
      var gL = vlOnePoleCoeff(vlMidiToHz(vlClamp(midiL, 8, 136)), sr)
      var gR = vlOnePoleCoeff(vlMidiToHz(vlClamp(midiR, 8, 136)), sr)
      var aL = (1 - gL) / (1 + gL)
      var aR = (1 - gR) / (1 + gR)
      var xL = l[i] + this.fbL * fb
      var xR = r[i] + this.fbR * fb
      var stages = 4 + Math.round(blend * 4)
      if (stages > 12) stages = 12
      var yL = xL
      var yR = xR
      for (var s = 0; s < stages; s++) {
        yL = this.apL[s].tick(yL, aL)
        yR = this.apR[s].tick(yR, aR)
      }
      this.fbL = yL
      this.fbR = yR
      var lpAmt = blend < 1 ? 1 - blend : 0
      var hpAmt = blend > 1 ? blend - 1 : 0
      var bpAmt = 1 - Math.abs(blend - 1)
      var outL = yL * bpAmt + xL * lpAmt * 0.3 + (xL - yL) * hpAmt
      var outR = yR * bpAmt + xR * lpAmt * 0.3 + (xR - yR) * hpAmt
      l[i] = l[i] + (outL - l[i]) * mix
      r[i] = r[i] + (outR - r[i]) * mix
    }
  }
}
`

export function createPhaserLiteProcessor (sampleRate) {
  return createProcessor(VITAL_LITE_SHIM_SOURCE + VITAL_LITE_PHASER_PROCESSOR_SOURCE, 'VitalLitePhaserProcessor', sampleRate)
}
