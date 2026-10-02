/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Port of vital::ChorusModule (up to 4 delay pairs, LFO, equal-power mix).
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { mergeState, exp2, num, createProcessor } from './params.js'
import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'

export function defaultChorusLiteState () {
  return {
    mix: 0.5,
    feedback: 0.4,
    cutoffMidi: 60,
    spread: 1,
    voices: 4,
    frequency: 0.125,
    sync: 1,
    tempo: 4,
    modDepth: 0.5,
    delay1: exp2(-9),
    delay2: exp2(-7),
    bpm: 120
  }
}

export function normalizeChorusLiteState (state) {
  const s = mergeState(defaultChorusLiteState(), state && typeof state === 'object' ? state : {})
  return {
    mix: num(s.mix, 0.5, 0, 1),
    feedback: num(s.feedback, 0.4, -0.95, 0.95),
    cutoffMidi: num(s.cutoffMidi, 60, 8, 136),
    spread: num(s.spread, 1, 0, 1),
    voices: Math.round(num(s.voices, 4, 1, 4)),
    frequency: num(s.frequency, 0.125, exp2(-6), exp2(3)),
    sync: Math.round(num(s.sync, 1, 0, 3)),
    tempo: Math.round(num(s.tempo, 4, 0, 10)),
    modDepth: num(s.modDepth, 0.5, 0, 1),
    delay1: num(s.delay1, exp2(-9), exp2(-10), exp2(-5.64386)),
    delay2: num(s.delay2, exp2(-7), exp2(-10), exp2(-5.64386)),
    bpm: num(s.bpm, 120, 20, 400)
  }
}

export const CHORUS_LITE_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: defaultChorusLiteState() },
  { id: 'wide', name: 'Wide', state: { mix: 0.55, voices: 4, spread: 1, modDepth: 0.7 } },
  { id: 'subtle', name: 'Subtle', state: { mix: 0.28, voices: 2, modDepth: 0.25, feedback: 0.15 } }
]

export const CHORUS_LITE_PARAMETERS = [
  { id: 'chorusLite.mix', name: 'Mix', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'chorusLite.feedback', name: 'Feedback', min: -0.95, max: 0.95, default: 0.4, unit: '%', automatable: true },
  { id: 'chorusLite.voices', name: 'Voices', min: 1, max: 4, default: 4, unit: '', automatable: false },
  { id: 'chorusLite.frequency', name: 'Frequency', min: 0.0156, max: 8, default: 0.125, unit: 'Hz', scale: 'log', automatable: true },
  { id: 'chorusLite.modDepth', name: 'Mod Depth', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'chorusLite.delay1', name: 'Delay 1', min: 0.00097, max: 0.02, default: 0.00195, unit: 's', scale: 'log', automatable: true },
  { id: 'chorusLite.delay2', name: 'Delay 2', min: 0.00097, max: 0.02, default: 0.0078, unit: 's', scale: 'log', automatable: true },
  { id: 'chorusLite.cutoffMidi', name: 'Cutoff', min: 8, max: 136, default: 60, unit: 'st', automatable: true },
  { id: 'chorusLite.spread', name: 'Spread', min: 0, max: 1, default: 1, unit: '', automatable: true }
]

export const VITAL_LITE_CHORUS_PROCESSOR_SOURCE = `
class VitalLiteChorusProcessor {
  constructor (sr) {
    this.sr = sr || 44100
    this.voices = []
    for (var i = 0; i < 4; i++) {
      this.voices.push({
        dL: new VlDelay(Math.ceil(this.sr * 0.1)),
        dR: new VlDelay(Math.ceil(this.sr * 0.1)),
        lpL: new VlOnePole(),
        lpR: new VlOnePole(),
        hpL: new VlOnePole(),
        hpR: new VlOnePole()
      })
    }
    this.phase = 0
  }
  process (l, r, n, state) {
    var sr = this.sr
    var voices = Math.max(1, Math.min(4, state.voices | 0 || 4))
    var hz = state.sync ? vlSyncHz(state.bpm, state.tempo, state.sync) : Math.max(0.01, state.frequency || 0.125)
    var fb = vlClamp(state.feedback, -0.95, 0.95)
    var wet = vlEqWet(state.mix)
    var dry = vlEqDry(state.mix)
    var cut = vlMidiToHz(vlClamp(state.cutoffMidi, 8, 136))
    var spread = vlClamp(state.spread, 0, 1) * 8 * 12
    var lpC = vlOnePoleCoeff(vlClamp(vlMidiToHz(state.cutoffMidi + spread), 20, sr * 0.45), sr)
    var hpC = vlOnePoleCoeff(vlClamp(vlMidiToHz(state.cutoffMidi - spread), 20, sr * 0.45), sr)
    var d1 = Math.max(0.0005, state.delay1 || 0.002)
    var d2 = Math.max(0.0005, state.delay2 || 0.008)
    var depth = vlClamp(state.modDepth, 0, 1) * 0.03
    var inc = hz / sr
    for (var i = 0; i < n; i++) {
      this.phase += inc
      if (this.phase >= 1) this.phase -= 1
      var inL = l[i]
      var inR = r[i]
      var sumL = 0
      var sumR = 0
      for (var v = 0; v < voices; v++) {
        var pair = this.voices[v]
        var t = voices === 1 ? 0 : v / (voices - 1)
        var base = d1 + (d2 - d1) * t
        var phL = this.phase + v * 0.25 / voices
        var phR = phL + 0.25
        var delL = (Math.sin(phL * 6.283185307179586) * 0.5 + 1) * depth + base
        var delR = (Math.sin(phR * 6.283185307179586) * 0.5 + 1) * depth + base
        var xL = pair.hpL.tickBasic(inL, hpC)
        xL = pair.lpL.tickBasic(xL, lpC)
        var xR = pair.hpR.tickBasic(inR, hpC)
        xR = pair.lpR.tickBasic(xR, lpC)
        var yL = pair.dL.read(delL * sr)
        var yR = pair.dR.read(delR * sr)
        pair.dL.write(xL + yL * fb)
        pair.dR.write(xR + yR * fb)
        sumL += yL
        sumR += yR
      }
      var g = 0.5
      l[i] = dry * inL + wet * sumL * g
      r[i] = dry * inR + wet * sumR * g
    }
  }
}
`

export function createChorusLiteProcessor (sampleRate) {
  return createProcessor(VITAL_LITE_SHIM_SOURCE + VITAL_LITE_CHORUS_PROCESSOR_SOURCE, 'VitalLiteChorusProcessor', sampleRate)
}
