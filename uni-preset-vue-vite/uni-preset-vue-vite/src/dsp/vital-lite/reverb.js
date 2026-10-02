/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Port of vital::Reverb / ReverbModule (16-line FDN + allpass, T60, shelves,
 * chorus drift, pre-delay). Licensed under GNU GPL v3.0 or later.
 * See src/dsp/vital-lite/LICENSE.
 */

import { mergeState, num, exp2, createProcessor } from './params.js'
import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'

export function defaultReverbLiteState () {
  return {
    mix: 0.25,
    decayTime: 1,
    size: 0.5,
    delay: 0,
    preLowMidi: 0,
    preHighMidi: 110,
    lowShelfMidi: 0,
    lowShelfDb: 0,
    highShelfMidi: 90,
    highShelfDb: -1,
    chorusAmount: 0.223607,
    chorusFrequency: 0.25
  }
}

export function normalizeReverbLiteState (state) {
  const s = mergeState(defaultReverbLiteState(), state && typeof state === 'object' ? state : {})
  return {
    mix: num(s.mix, 0.25, 0, 1),
    decayTime: num(s.decayTime, 1, 0.1, 100),
    size: num(s.size, 0.5, 0, 1),
    delay: num(s.delay, 0, 0, 0.3),
    preLowMidi: num(s.preLowMidi, 0, 0, 128),
    preHighMidi: num(s.preHighMidi, 110, 0, 128),
    lowShelfMidi: num(s.lowShelfMidi, 0, 0, 128),
    lowShelfDb: num(s.lowShelfDb, 0, -6, 0),
    highShelfMidi: num(s.highShelfMidi, 90, 0, 128),
    highShelfDb: num(s.highShelfDb, -1, -6, 0),
    chorusAmount: num(s.chorusAmount, 0.223607, 0, 1),
    chorusFrequency: num(s.chorusFrequency, 0.25, exp2(-8), exp2(3))
  }
}

export const REVERB_LITE_FACTORY_PRESETS = [
  { id: 'default', name: 'Default', state: defaultReverbLiteState() },
  { id: 'hall', name: 'Hall', state: { mix: 0.32, decayTime: 3.2, size: 0.72, delay: 0.04, highShelfDb: -2 } },
  { id: 'room', name: 'Room', state: { mix: 0.22, decayTime: 0.7, size: 0.28, delay: 0.008, chorusAmount: 0.08 } },
  { id: 'plate', name: 'Plate', state: { mix: 0.4, decayTime: 1.8, size: 0.45, highShelfMidi: 100, chorusAmount: 0.4 } }
]

export const REVERB_LITE_PARAMETERS = [
  { id: 'reverbLite.mix', name: 'Mix', min: 0, max: 1, default: 0.25, unit: '%', automatable: true },
  { id: 'reverbLite.decayTime', name: 'Decay Time', min: 0.1, max: 64, default: 1, unit: 's', scale: 'log', automatable: true },
  { id: 'reverbLite.size', name: 'Size', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
  { id: 'reverbLite.delay', name: 'Delay', min: 0, max: 0.3, default: 0, unit: 's', automatable: true },
  { id: 'reverbLite.preLowMidi', name: 'Pre Low Cutoff', min: 0, max: 128, default: 0, unit: 'st', automatable: true },
  { id: 'reverbLite.preHighMidi', name: 'Pre High Cutoff', min: 0, max: 128, default: 110, unit: 'st', automatable: true },
  { id: 'reverbLite.lowShelfMidi', name: 'Low Cutoff', min: 0, max: 128, default: 0, unit: 'st', automatable: true },
  { id: 'reverbLite.lowShelfDb', name: 'Low Gain', min: -6, max: 0, default: 0, unit: 'dB', automatable: true },
  { id: 'reverbLite.highShelfMidi', name: 'High Cutoff', min: 0, max: 128, default: 90, unit: 'st', automatable: true },
  { id: 'reverbLite.highShelfDb', name: 'High Gain', min: -6, max: 0, default: -1, unit: 'dB', automatable: true },
  { id: 'reverbLite.chorusAmount', name: 'Chorus Amount', min: 0, max: 1, default: 0.223607, unit: '%', automatable: true },
  { id: 'reverbLite.chorusFrequency', name: 'Chorus Frequency', min: 0.0039, max: 8, default: 0.25, unit: 'Hz', scale: 'log', automatable: true }
]

export const VITAL_LITE_REVERB_PROCESSOR_SOURCE = `
class VitalLiteReverbProcessor {
  constructor (sr) {
    this.sr = sr || 44100
    this.setup()
    this.wetPeak = 0
  }
  setup () {
    var sr = this.sr
    var ratio = sr / 44100
    var scale = 1
    for (; scale < ratio; scale *= 2) {}
    this.scale = scale
    this.ratio = ratio
    var fbSize = scale * (1 << 15)
    var apSize = scale * (1 << 10)
    this.fb = []
    this.ap = []
    this.lowShelf = []
    this.highShelf = []
    this.decay = []
    for (var i = 0; i < 16; i++) {
      this.fb.push(new VlDelay(fbSize + 8))
      this.ap.push(new VlDelay(apSize + 8))
      this.decay.push(0)
    }
    for (var c = 0; c < 4; c++) {
      this.lowShelf.push(new VlOnePole())
      this.highShelf.push(new VlOnePole())
    }
    this.preLow = new VlOnePole()
    this.preHigh = new VlOnePole()
    this.pre = new VlDelay(Math.max(64, Math.ceil(sr * 0.35)))
    this.phase = 0
    this.chorusAmt = 0
    this.sampleDelay = 3
  }
  process (l, r, n, state) {
    var sr = this.sr
    var scale = this.scale
    var ratio = this.ratio
    var size = vlClamp(state.size, 0, 1)
    var sizeMult = Math.pow(2, size * 4 - 3)
    var decaySec = vlClamp(state.decayTime, 0.1, 100)
    var decayPeriod = sizeMult / (decaySec * 44100)
    var kT60 = 0.001
    var FB = [[6753.2,9278.4,7704.5,11328.5],[9701.12,5512.5,8480.45,5638.65],[3120.73,3429.5,3626.37,7713.52],[4521.54,6518.97,5265.56,5630.25]]
    var AP = [[1001,799,933,876],[895,807,907,853],[957,1019,711,567],[833,779,663,997]]
    var delays = []
    var i, c, lane
    for (c = 0; c < 4; c++) {
      delays[c] = []
      for (lane = 0; lane < 4; lane++) {
        var idx = c * 4 + lane
        this.decay[idx] = Math.pow(kT60, FB[c][lane] * decayPeriod)
        delays[c][lane] = sizeMult * FB[c][lane] * ratio
      }
    }
    var mix = vlClamp(state.mix, 0, 1)
    var wetG = vlEqWet(mix)
    var dryG = vlEqDry(mix)
    var preLowC = vlOnePoleCoeff(vlMidiToHz(vlClamp(state.preLowMidi, 0, 130)), sr)
    var preHighC = vlOnePoleCoeff(vlMidiToHz(vlClamp(state.preHighMidi, 0, 130)), sr)
    var lowC = vlOnePoleCoeff(vlMidiToHz(vlClamp(state.lowShelfMidi, 0, 130)), sr)
    var highC = vlOnePoleCoeff(vlMidiToHz(vlClamp(state.highShelfMidi, 0, 130)), sr)
    var lowAmp = 1 - vlDbLin(vlClamp(state.lowShelfDb, -24, 0))
    var highAmp = vlDbLin(vlClamp(state.highShelfDb, -24, 0))
    var chorusHz = vlClamp(state.chorusFrequency, 0, 16)
    var phaseInc = chorusHz / sr
    var chorusAmt = vlClamp(state.chorusAmount, 0, 1) * 2500 * ratio
    for (c = 0; c < 4; c++) {
      for (lane = 0; lane < 4; lane++) {
        if (chorusAmt > delays[c][lane] - 32) chorusAmt = delays[c][lane] - 32
      }
    }
    if (chorusAmt < 0) chorusAmt = 0
    var targetDelay = vlClamp(state.delay, 0, 0.3) * sr
    if (targetDelay < 3) targetDelay = 3
    var kAllpassFb = 0.6
    var wetPeak = 0
    var twoPi = 6.283185307179586
    var netOff = twoPi / 16
    for (i = 0; i < n; i++) {
      this.phase += phaseInc
      if (this.phase >= 1) this.phase -= 1
      var reads = []
      for (c = 0; c < 4; c++) {
        reads[c] = []
        for (lane = 0; lane < 4; lane++) {
          var ph = this.phase * twoPi + (c * 4 + lane) * netOff
          var drift = Math.cos(ph) * chorusAmt
          if (c & 1) drift = -drift
          reads[c][lane] = this.fb[c * 4 + lane].read(delays[c][lane] + drift)
        }
      }
      var inL = l[i]
      var inR = r[i]
      var lanes = [inL, inR, inL, inR]
      var apOut = []
      for (c = 0; c < 4; c++) {
        apOut[c] = []
        for (lane = 0; lane < 4; lane++) {
          var filtered = this.preHigh.tickBasic(lanes[lane], preHighC)
          filtered = this.preLow.tickBasic(lanes[lane], preLowC) - filtered
          var scaled = filtered * 0.25
          var apIdx = c * 4 + lane
          var apRead = this.ap[apIdx].readInt(AP[c][lane] * scale)
          var apIn = reads[c][lane] - apRead * kAllpassFb
          this.ap[apIdx].write(scaled + apIn)
          apOut[c][lane] = apRead + apIn * kAllpassFb
        }
      }
      var row = [0, 0, 0, 0]
      for (lane = 0; lane < 4; lane++) {
        row[lane] = apOut[0][lane] + apOut[1][lane] + apOut[2][lane] + apOut[3][lane]
      }
      var rowSum = (row[0] + row[1] + row[2] + row[3]) * 0.25
      var write = []
      for (c = 0; c < 4; c++) {
        write[c] = []
        for (lane = 0; lane < 4; lane++) write[c][lane] = rowSum + row[lane] * -0.5 + apOut[c][lane]
      }
      var tr = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]
      for (c = 0; c < 4; c++) for (lane = 0; lane < 4; lane++) tr[lane][c] = apOut[c][lane]
      var adj = [0, 0, 0, 0]
      for (lane = 0; lane < 4; lane++) {
        adj[lane] = (tr[0][lane] + tr[1][lane] + tr[2][lane] + tr[3][lane]) * -0.5
      }
      var store = []
      var totalL = 0
      var totalR = 0
      for (c = 0; c < 4; c++) {
        store[c] = []
        for (lane = 0; lane < 4; lane++) {
          var w = write[c][lane] + adj[c]
          var hf = this.highShelf[c].tickBasic(w, highC)
          w = hf + highAmp * (w - hf)
          var lf = this.lowShelf[c].tickBasic(w, lowC)
          w = w - lf * lowAmp
          var st = this.decay[c * 4 + lane] * w
          store[c][lane] = st
          this.fb[c * 4 + lane].write(st)
          if ((lane & 1) === 0) totalL += w
          else totalR += w
        }
      }
      this.sampleDelay += (targetDelay - this.sampleDelay) * 0.05
      var d = this.sampleDelay
      this.pre.write((totalL + totalR) * 0.5)
      var wet = this.pre.read(d)
      var yL = wetG * (wet + (totalL - totalR) * 0.15) + dryG * inL
      var yR = wetG * (wet - (totalL - totalR) * 0.15) + dryG * inR
      l[i] = yL
      r[i] = yR
      var a = Math.abs(wet * wetG)
      if (a > wetPeak) wetPeak = a
    }
    this.wetPeak = wetPeak
  }
}
`

export function createReverbLiteProcessor (sampleRate) {
  return createProcessor(VITAL_LITE_SHIM_SOURCE + VITAL_LITE_REVERB_PROCESSOR_SOURCE, 'VitalLiteReverbProcessor', sampleRate)
}
