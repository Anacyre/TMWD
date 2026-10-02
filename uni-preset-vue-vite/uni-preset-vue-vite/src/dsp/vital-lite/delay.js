/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Port of vital::Delay / DelayModule (mono/stereo/ping-pong, filter, tempo).
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { mergeState, exp2, num, idx, DELAY_STYLES, createProcessor } from './params.js'
import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'

export function defaultDelayLiteState () {
  return {
    mix: 0.3334,
    feedback: 0.5,
    frequency: 4,
    auxFrequency: 4,
    style: 'stereo',
    cutoffMidi: 60,
    spread: 1,
    sync: 1,
    tempo: 9,
    auxSync: 1,
    auxTempo: 9,
    bpm: 120
  }
}

export function normalizeDelayLiteState (state) {
  const s = mergeState(defaultDelayLiteState(), state && typeof state === 'object' ? state : {})
  return {
    mix: num(s.mix, 0.3334, 0, 1),
    feedback: num(s.feedback, 0.5, -1, 1),
    frequency: num(s.frequency, 4, exp2(-2), exp2(9)),
    auxFrequency: num(s.auxFrequency, 4, exp2(-2), exp2(9)),
    style: idx(s.style, 1, DELAY_STYLES),
    cutoffMidi: num(s.cutoffMidi, 60, 8, 136),
    spread: num(s.spread, 1, 0, 1),
    sync: Math.round(num(s.sync, 1, 0, 3)),
    tempo: Math.round(num(s.tempo, 9, 4, 12)),
    auxSync: Math.round(num(s.auxSync, 1, 0, 3)),
    auxTempo: Math.round(num(s.auxTempo, 9, 4, 12)),
    bpm: num(s.bpm, 120, 20, 400)
  }
}

export const DELAY_LITE_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: defaultDelayLiteState() },
  { id: 'pingpong', name: 'Ping Pong', state: { style: 'pingpong', mix: 0.4, feedback: 0.55, tempo: 9 } },
  { id: 'slap', name: 'Slap', state: { style: 'mono', sync: 0, frequency: 12, mix: 0.22, feedback: 0.12 } }
]

export const DELAY_LITE_PARAMETERS = [
  { id: 'delayLite.mix', name: 'Mix', min: 0, max: 1, default: 0.3334, unit: '%', automatable: true },
  { id: 'delayLite.feedback', name: 'Feedback', min: -1, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'delayLite.frequency', name: 'Frequency', min: 0.25, max: 512, default: 4, unit: 'Hz', scale: 'log', automatable: true },
  { id: 'delayLite.auxFrequency', name: 'Frequency Aux', min: 0.25, max: 512, default: 4, unit: 'Hz', scale: 'log', automatable: true },
  { id: 'delayLite.style', name: 'Style', min: 0, max: 3, default: 1, unit: '', automatable: false },
  { id: 'delayLite.cutoffMidi', name: 'Filter Cutoff', min: 8, max: 136, default: 60, unit: 'st', automatable: true },
  { id: 'delayLite.spread', name: 'Filter Spread', min: 0, max: 1, default: 1, unit: '', automatable: true }
]

export const VITAL_LITE_DELAY_PROCESSOR_SOURCE = `
class VitalLiteDelayProcessor {
  constructor (sr) {
    this.sr = sr || 44100
    var n = Math.ceil(this.sr * 4 + 8)
    this.dL = new VlDelay(n)
    this.dR = new VlDelay(n)
    this.lpL = new VlOnePole()
    this.lpR = new VlOnePole()
    this.hpL = new VlOnePole()
    this.hpR = new VlOnePole()
  }
  process (l, r, n, state) {
    var sr = this.sr
    var hzL = state.sync ? vlSyncHz(state.bpm, state.tempo, state.sync) : Math.max(0.05, state.frequency || 4)
    var hzR = state.auxSync ? vlSyncHz(state.bpm, state.auxTempo, state.auxSync) : Math.max(0.05, state.auxFrequency || 4)
    var style = state.style || 'stereo'
    if (style === 'mono') hzR = hzL
    var perL = vlClamp(sr / hzL, 3, sr * 3.9)
    var perR = vlClamp(sr / hzR, 3, sr * 3.9)
    var wet = vlEqWet(state.mix)
    var dry = vlEqDry(state.mix)
    var fb = vlClamp(state.feedback, -0.97, 0.97)
    var spread = vlClamp(state.spread, 0, 1) * 96
    var lpC = vlOnePoleCoeff(vlClamp(vlMidiToHz((state.cutoffMidi || 60) + spread), 20, sr * 0.45), sr)
    var hpC = vlOnePoleCoeff(vlClamp(vlMidiToHz((state.cutoffMidi || 60) - spread), 20, sr * 0.45), sr)
    var ping = style === 'pingpong' || style === 'mid-pingpong'
    for (var i = 0; i < n; i++) {
      var yL = this.dL.read(perL)
      var yR = this.dR.read(perR)
      yL = this.lpL.tickBasic(yL, lpC)
      yL = yL - this.hpL.tickBasic(yL, hpC)
      yR = this.lpR.tickBasic(yR, lpC)
      yR = yR - this.hpR.tickBasic(yR, hpC)
      var inL = l[i]
      var inR = r[i]
      if (style === 'mid-pingpong') {
        var mid = (inL + inR) * 0.5
        this.dL.write(vlTanh(mid + yR * fb))
        this.dR.write(vlTanh(yL))
      } else if (ping) {
        this.dL.write(vlTanh(inL + yR * fb))
        this.dR.write(vlTanh(yL))
      } else {
        this.dL.write(vlTanh(inL + yL * fb))
        this.dR.write(vlTanh(inR + yR * fb))
      }
      l[i] = dry * inL + wet * yL
      r[i] = dry * inR + wet * yR
    }
  }
}
`

export function createDelayLiteProcessor (sampleRate) {
  return createProcessor(VITAL_LITE_SHIM_SOURCE + VITAL_LITE_DELAY_PROCESSOR_SOURCE, 'VitalLiteDelayProcessor', sampleRate)
}
