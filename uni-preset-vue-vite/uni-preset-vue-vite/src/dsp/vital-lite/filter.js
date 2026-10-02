/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Port of vital::FilterModule FX path — Analog (Sallen-Key), Ladder, Digital SVF.
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { mergeState, num, idx, FILTER_MODELS, FILTER_STYLES, createProcessor } from './params.js'
import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'

export function defaultFilterLiteState () {
  return {
    mix: 1,
    cutoffMidi: 60,
    resonance: 0.5,
    drive: 0,
    blend: 0,
    model: 'analog',
    style: '12dB'
  }
}

export function normalizeFilterLiteState (state) {
  const s = mergeState(defaultFilterLiteState(), state && typeof state === 'object' ? state : {})
  const model = idx(s.model, 0, FILTER_MODELS)
  return {
    mix: num(s.mix, 1, 0, 1),
    cutoffMidi: num(s.cutoffMidi, 60, 8, 136),
    resonance: num(s.resonance, 0.5, 0, 1),
    drive: num(s.drive, 0, 0, 20),
    blend: num(s.blend, 0, 0, 2),
    model: model === 'dirty' ? 'analog' : model,
    style: idx(s.style, 0, FILTER_STYLES)
  }
}

export const FILTER_LITE_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: defaultFilterLiteState() },
  { id: 'ladder-lp', name: 'Ladder LP', state: { model: 'ladder', style: '24dB', cutoffMidi: 72, resonance: 0.4 } },
  { id: 'digital-hp', name: 'Digital HP', state: { model: 'digital', blend: 2, cutoffMidi: 48, mix: 1 } }
]

export const FILTER_LITE_PARAMETERS = [
  { id: 'filterLite.mix', name: 'Mix', min: 0, max: 1, default: 1, unit: '%', automatable: true },
  { id: 'filterLite.cutoffMidi', name: 'Cutoff', min: 8, max: 136, default: 60, unit: 'st', automatable: true },
  { id: 'filterLite.resonance', name: 'Resonance', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'filterLite.drive', name: 'Drive', min: 0, max: 20, default: 0, unit: 'dB', automatable: true },
  { id: 'filterLite.blend', name: 'Blend', min: 0, max: 2, default: 0, unit: '', automatable: true },
  { id: 'filterLite.model', name: 'Model', min: 0, max: 2, default: 0, unit: '', automatable: false },
  { id: 'filterLite.style', name: 'Style', min: 0, max: 1, default: 0, unit: '', automatable: false }
]

export const VITAL_LITE_FILTER_PROCESSOR_SOURCE = `
function VlLadder () {
  this.s = [new VlOnePole(), new VlOnePole(), new VlOnePole(), new VlOnePole()]
  this.input = 0
}
VlLadder.prototype.reset = function () {
  for (var i = 0; i < 4; i++) this.s[i].reset()
  this.input = 0
}
VlLadder.prototype.tick = function (x, coeff, res, drive) {
  var g1 = coeff * 1.66
  var st = this.s[3].y + g1 * this.s[2].y + g1 * g1 * this.s[1].y + g1 * g1 * g1 * this.s[0].y
  this.input = vlTanh(x * drive - res * st)
  var y = this.input
  for (var i = 0; i < 4; i++) y = this.s[i].tickSat(y, coeff)
  return y
}
function VlAnalog () {
  this.a = new VlOnePole()
  this.b = new VlOnePole()
  this.c = new VlOnePole()
  this.d = new VlOnePole()
}
VlAnalog.prototype.reset = function () {
  this.a.reset(); this.b.reset(); this.c.reset(); this.d.reset()
}
VlAnalog.prototype.tick = function (x, coeff, res, drive, style24) {
  var fb = this.b.y
  if (style24) fb = this.d.y
  var y = vlTanh(x * drive - res * fb)
  y = this.a.tickSat(y, coeff)
  y = this.b.tickSat(y, coeff)
  if (style24) {
    y = this.c.tickSat(y, coeff)
    y = this.d.tickSat(y, coeff)
  }
  return y
}
class VitalLiteFilterProcessor {
  constructor (sr) {
    this.sr = sr || 44100
    this.svfL = new VlSvf(); this.svfR = new VlSvf()
    this.svfL2 = new VlSvf(); this.svfR2 = new VlSvf()
    this.ladL = new VlLadder(); this.ladR = new VlLadder()
    this.anL = new VlAnalog(); this.anR = new VlAnalog()
  }
  mixBlend (t, lp, bp, hp) {
    var b = vlClamp(t, 0, 2)
    if (b <= 1) return lp * (1 - b) + bp * b
    return bp * (2 - b) + hp * (b - 1)
  }
  process (l, r, n, state) {
    var sr = this.sr
    var mix = vlClamp(state.mix, 0, 1)
    var midi = vlClamp(state.cutoffMidi, 8, 136)
    var g = Math.tan(Math.PI * vlClamp(vlMidiToHz(midi), 1, 20000) / sr)
    if (g > 0.35) g = 0.35
    var resPct = vlClamp(state.resonance, 0, 1)
    var drive = vlDbLin(state.drive || 0)
    var model = state.model || 'analog'
    var style24 = state.style === '24dB'
    var k = 2 - resPct * 1.85
    var ladRes = 0.001 + resPct * 4.1 + (drive - 1) * resPct * 0.2
    var anRes = resPct * (style24 ? 3.2 : 2.4)
    for (var i = 0; i < n; i++) {
      var inL = l[i]
      var inR = r[i]
      var yL = inL
      var yR = inR
      if (model === 'ladder') {
        this.ladL.tick(inL, g, ladRes, drive)
        this.ladR.tick(inR, g, ladRes, drive)
        if (style24) { yL = this.ladL.s[3].y; yR = this.ladR.s[3].y }
        else { yL = this.ladL.s[1].y; yR = this.ladR.s[1].y }
        yL = this.mixBlend(state.blend, yL, this.ladL.s[0].y - yL, inL * drive - yL)
        yR = this.mixBlend(state.blend, yR, this.ladR.s[0].y - yR, inR * drive - yR)
      } else if (model === 'analog') {
        yL = this.anL.tick(inL, g, anRes, drive, style24)
        yR = this.anR.tick(inR, g, anRes, drive, style24)
        yL = this.mixBlend(state.blend, yL, this.anL.a.y - yL, inL * drive - yL)
        yR = this.mixBlend(state.blend, yR, this.anR.a.y - yR, inR * drive - yR)
      } else {
        var aL = this.svfL.tick(inL * drive, g, k)
        var aR = this.svfR.tick(inR * drive, g, k)
        if (style24) {
          aL = this.svfL2.tick(aL.lp, g, k)
          aR = this.svfR2.tick(aR.lp, g, k)
        }
        yL = this.mixBlend(state.blend, aL.lp, aL.bp, aL.hp)
        yR = this.mixBlend(state.blend, aR.lp, aR.bp, aR.hp)
      }
      var post = 1 / Math.sqrt((drive - 1) * 0.5 + 1)
      l[i] = inL + (yL * post - inL) * mix
      r[i] = inR + (yR * post - inR) * mix
    }
  }
}
`

export function createFilterLiteProcessor (sampleRate) {
  return createProcessor(VITAL_LITE_SHIM_SOURCE + VITAL_LITE_FILTER_PROCESSOR_SOURCE, 'VitalLiteFilterProcessor', sampleRate)
}
