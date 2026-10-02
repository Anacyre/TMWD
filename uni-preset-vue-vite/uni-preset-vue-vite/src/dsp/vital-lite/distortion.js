/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Port of vital::Distortion / DistortionModule (6 types + optional SVF).
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { mergeState, num, idx, DISTORTION_TYPES, FILTER_ORDERS, createProcessor } from './params.js'
import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'

export function defaultDistortionLiteState () {
  return {
    type: 'soft',
    drive: 0,
    mix: 1,
    filterOrder: 'off',
    cutoffMidi: 80,
    resonance: 0.5,
    blend: 0
  }
}

export function normalizeDistortionLiteState (state) {
  const s = mergeState(defaultDistortionLiteState(), state && typeof state === 'object' ? state : {})
  return {
    type: idx(s.type, 0, DISTORTION_TYPES),
    drive: num(s.drive, 0, -30, 30),
    mix: num(s.mix, 1, 0, 1),
    filterOrder: idx(s.filterOrder, 0, FILTER_ORDERS),
    cutoffMidi: num(s.cutoffMidi, 80, 8, 136),
    resonance: num(s.resonance, 0.5, 0, 1),
    blend: num(s.blend, 0, 0, 2)
  }
}

export const DISTORTION_LITE_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: defaultDistortionLiteState() },
  { id: 'warm', name: 'Warm', state: { type: 'soft', drive: 8, mix: 0.6 } },
  { id: 'crush', name: 'Crush', state: { type: 'bitcrush', drive: 12, mix: 0.7 } }
]

export const DISTORTION_LITE_PARAMETERS = [
  { id: 'distortionLite.type', name: 'Type', min: 0, max: 5, default: 0, unit: '', automatable: false },
  { id: 'distortionLite.drive', name: 'Drive', min: -30, max: 30, default: 0, unit: 'dB', automatable: true },
  { id: 'distortionLite.mix', name: 'Mix', min: 0, max: 1, default: 1, unit: '%', automatable: true },
  { id: 'distortionLite.filterOrder', name: 'Filter Order', min: 0, max: 2, default: 0, unit: '', automatable: false },
  { id: 'distortionLite.cutoffMidi', name: 'Filter Cutoff', min: 8, max: 136, default: 80, unit: 'st', automatable: true },
  { id: 'distortionLite.resonance', name: 'Filter Resonance', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'distortionLite.blend', name: 'Filter Blend', min: 0, max: 2, default: 0, unit: '', automatable: true }
]

export const VITAL_LITE_DISTORTION_PROCESSOR_SOURCE = `
class VitalLiteDistortionProcessor {
  constructor (sr) {
    this.sr = sr || 44100
    this.svfL = new VlSvf()
    this.svfR = new VlSvf()
    this.holdL = 0
    this.holdR = 0
    this.phaseL = 0
    this.phaseR = 0
  }
  driveValue (type, db) {
    db = vlClamp(db, -30, 30)
    if (type === 'bitcrush') {
      var d = Math.max(db + 30, 0) / 60
      return vlClamp(d * d, 32 / 2147483647, 1)
    }
    if (type === 'downsample') {
      var t = Math.max(db + 30, 0) / 60
      t = 1 - t
      t = 1 / vlClamp(t * t, 32 / 2147483647, 1)
      return Math.max(t * 0.99, 1) / 88200
    }
    return vlDbLin(db)
  }
  distort (type, x, drive) {
    if (type === 'hard') return vlClamp(x * drive, -1, 1)
    if (type === 'fold') {
      var adj = x * drive * 0.25 + 0.75
      var range = adj - Math.floor(adj)
      return Math.abs(range * -4 + 2) - 1
    }
    if (type === 'sinfold') {
      var a = x * drive * -0.25 + 0.5
      a = a - Math.floor(a)
      return Math.sin(a * 6.283185307179586)
    }
    if (type === 'bitcrush') return Math.round(x / drive) * drive
    return vlTanh(x * drive)
  }
  filterTick (svf, x, state) {
    var g = Math.tan(Math.PI * vlClamp(vlMidiToHz(state.cutoffMidi || 80), 20, this.sr * 0.45) / this.sr)
    var k = 2 - 1.8 * vlClamp(state.resonance, 0, 1)
    var b = svf.tick(x, g, k)
    var blend = vlClamp(state.blend, 0, 2)
    if (blend <= 1) return b.lp * (1 - blend) + b.bp * blend
    return b.bp * (2 - blend) + b.hp * (blend - 1)
  }
  process (l, r, n, state) {
    var type = state.type || 'soft'
    var order = state.filterOrder || 'off'
    var drive = this.driveValue(type, state.drive)
    var mix = vlClamp(state.mix, 0, 1)
    var sr = this.sr
    for (var i = 0; i < n; i++) {
      var inL = l[i]
      var inR = r[i]
      var xL = inL
      var xR = inR
      if (order === 'pre') {
        xL = this.filterTick(this.svfL, xL, state)
        xR = this.filterTick(this.svfR, xR, state)
      }
      if (type === 'downsample') {
        this.phaseL += drive * sr
        this.phaseR += drive * sr
        if (this.phaseL >= 1) { this.phaseL -= Math.floor(this.phaseL); this.holdL = xL }
        if (this.phaseR >= 1) { this.phaseR -= Math.floor(this.phaseR); this.holdR = xR }
        xL = this.holdL
        xR = this.holdR
      } else {
        xL = this.distort(type, xL, drive)
        xR = this.distort(type, xR, drive)
      }
      if (order === 'post') {
        xL = this.filterTick(this.svfL, xL, state)
        xR = this.filterTick(this.svfR, xR, state)
      }
      l[i] = inL + (xL - inL) * mix
      r[i] = inR + (xR - inR) * mix
    }
  }
}
`

export function createDistortionLiteProcessor (sampleRate) {
  return createProcessor(VITAL_LITE_SHIM_SOURCE + VITAL_LITE_DISTORTION_PROCESSOR_SOURCE, 'VitalLiteDistortionProcessor', sampleRate)
}
