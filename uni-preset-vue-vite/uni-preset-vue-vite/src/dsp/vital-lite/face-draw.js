/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors
 *
 * Visual helpers for the VitalLite effect faces. Waveshaper math follows
 * the VitalLite distortion port (itself a derivative of Vital).
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { midiToHz } from './params.js'
import { normalizeEqualizerLiteState } from './equalizer.js'
import { normalizeFilterLiteState } from './filter.js'

const SR = 48000

export function formatVitalValue (kind, value, fallback = 0) {
  const n = Number(value)
  const v = Number.isFinite(n) ? n : fallback
  if (kind === 'pct') return Math.round(v * 100) + '%'
  if (kind === 'db') return (v >= 0 ? '+' : '') + v.toFixed(1) + ' dB'
  if (kind === 'sec') return v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s'
  if (kind === 'ms') return (v * 1000).toFixed(1) + ' ms'
  if (kind === 'hz') return v < 10 ? v.toFixed(2) + ' Hz' : Math.round(v) + ' Hz'
  if (kind === 'midi') return Math.round(midiToHz(v)) + ' Hz'
  if (kind === 'int') return String(Math.round(v))
  if (kind === 'st') return v.toFixed(1) + ' st'
  return v.toFixed(2)
}

function clamp (n, a, b) {
  return Math.min(b, Math.max(a, n))
}

export function freqX (f) {
  const t = Math.log(Math.max(20, f) / 20) / Math.log(1000)
  return 6 + clamp(t, 0, 1) * 188
}

export function dbY (db, lo, hi) {
  const t = (db - lo) / (hi - lo)
  return 94 - clamp(t, 0, 1) * 84
}

function pathOf (pts) {
  return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ')
}

function closeFill (line, bottom) {
  if (!line.length) return ''
  const a = line[0]
  const b = line[line.length - 1]
  return pathOf(line) + ` L${b.x.toFixed(1)} ${bottom} L${a.x.toFixed(1)} ${bottom} Z`
}

function curve (pts, bottom) {
  return { line: pathOf(pts), fill: closeFill(pts, bottom), points: pts }
}

function triFold (p) {
  const x = p - Math.floor(p)
  return x < 0.5 ? x * 4 - 1 : 3 - x * 4
}

const SYNC_RATIOS = [0, 0.0078125, 0.015625, 0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16]

export function rateHz (state, aux) {
  const sync = Number(aux ? state && state.auxSync : state && state.sync) || 0
  const tempo = aux ? state && state.auxTempo : state && state.tempo
  const frequency = aux ? state && state.auxFrequency : state && state.frequency
  if (sync) {
    let i = tempo | 0
    if (i < 0) i = 0
    if (i > 12) i = 12
    let hz = (SYNC_RATIOS[i] || 1) * (Math.max(20, Number(state && state.bpm) || 120) / 60)
    if (sync === 2) hz *= 2 / 3
    if (sync === 3) hz *= 1.5
    return Math.max(0.05, hz)
  }
  return Math.max(0.05, Number(frequency) || (aux ? 4 : 0.25))
}

/** Magnitude in dB of an RBJ biquad with corner `fc`, evaluated at `f`. The coefficients
 * come from the corner frequency; the response is then read at the probe frequency. */
function biquadDb (f, fc, q, type, gainDb) {
  const A = Math.pow(10, (Number(gainDb) || 0) / 40)
  const fcSafe = Number.isFinite(Number(fc)) ? Number(fc) : 1000
  const w0 = 2 * Math.PI * clamp(fcSafe, 1, SR * 0.49) / SR
  const w = 2 * Math.PI * clamp(f, 1, SR * 0.49) / SR
  const cw = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * Math.max(0.15, Number.isFinite(q) ? q : 0.7))
  let b0, b1, b2, a0, a1, a2
  if (type === 'hp') {
    b0 = (1 + cw) / 2
    b1 = -(1 + cw)
    b2 = (1 + cw) / 2
    a0 = 1 + alpha
    a1 = -2 * cw
    a2 = 1 - alpha
  } else if (type === 'lp') {
    b0 = (1 - cw) / 2
    b1 = 1 - cw
    b2 = (1 - cw) / 2
    a0 = 1 + alpha
    a1 = -2 * cw
    a2 = 1 - alpha
  } else if (type === 'notch') {
    b0 = 1
    b1 = -2 * cw
    b2 = 1
    a0 = 1 + alpha
    a1 = -2 * cw
    a2 = 1 - alpha
  } else if (type === 'bp') {
    b0 = alpha
    b1 = 0
    b2 = -alpha
    a0 = 1 + alpha
    a1 = -2 * cw
    a2 = 1 - alpha
  } else if (type === 'lowshelf') {
    const sq = 2 * Math.sqrt(A) * alpha
    b0 = A * ((A + 1) - (A - 1) * cw + sq)
    b1 = 2 * A * ((A - 1) - (A + 1) * cw)
    b2 = A * ((A + 1) - (A - 1) * cw - sq)
    a0 = (A + 1) + (A - 1) * cw + sq
    a1 = -2 * ((A - 1) + (A + 1) * cw)
    a2 = (A + 1) + (A - 1) * cw - sq
  } else if (type === 'highshelf') {
    const sq = 2 * Math.sqrt(A) * alpha
    b0 = A * ((A + 1) + (A - 1) * cw + sq)
    b1 = -2 * A * ((A - 1) + (A + 1) * cw)
    b2 = A * ((A + 1) + (A - 1) * cw - sq)
    a0 = (A + 1) - (A - 1) * cw + sq
    a1 = 2 * ((A - 1) - (A + 1) * cw)
    a2 = (A + 1) - (A - 1) * cw - sq
  } else {
    b0 = 1 + alpha * A
    b1 = -2 * cw
    b2 = 1 - alpha * A
    a0 = 1 + alpha / Math.max(1e-4, A)
    a1 = -2 * cw
    a2 = 1 - alpha / Math.max(1e-4, A)
  }
  const c1 = Math.cos(w)
  const s1 = Math.sin(w)
  const c2 = Math.cos(2 * w)
  const s2 = Math.sin(2 * w)
  const nr = b0 + b1 * c1 + b2 * c2
  const ni = -(b1 * s1 + b2 * s2)
  const dr = a0 + a1 * c1 + a2 * c2
  const di = -(a1 * s1 + a2 * s2)
  const mag = Math.sqrt(nr * nr + ni * ni) / Math.max(1e-9, Math.sqrt(dr * dr + di * di))
  return 20 * Math.log10(Math.max(1e-8, mag))
}

function sweep (fn) {
  const pts = []
  for (let i = 0; i < 80; i++) {
    const f = 20 * Math.pow(1000, i / 79)
    pts.push({ x: freqX(f), y: dbY(fn(f), -24, 18), f })
  }
  return pts
}

function qOf (res) {
  return 0.5 + clamp(Number(res) || 0, 0, 1) * 8
}

export function eqResponse (state) {
  const s = normalizeEqualizerLiteState(state)
  const lowType = s.lowMode === 'highpass' ? 'hp' : 'lowshelf'
  const bandType = s.bandMode === 'notch' ? 'notch' : 'bell'
  const highType = s.highMode === 'lowpass' ? 'lp' : 'highshelf'
  const pts = sweep((f) => {
    return biquadDb(f, midiToHz(s.lowMidi), qOf(s.lowRes), lowType, s.lowGainDb)
      + biquadDb(f, midiToHz(s.bandMidi), qOf(s.bandRes), bandType, s.bandGainDb)
      + biquadDb(f, midiToHz(s.highMidi), qOf(s.highRes), highType, s.highGainDb)
  })
  return curve(pts, 96)
}

export function eqHandles (state) {
  const s = normalizeEqualizerLiteState(state)
  const bands = [
    { id: 'low', type: s.lowMode, midi: s.lowMidi, gain: s.lowGainDb },
    { id: 'band', type: s.bandMode, midi: s.bandMidi, gain: s.bandGainDb },
    { id: 'high', type: s.highMode, midi: s.highMidi, gain: s.highGainDb }
  ]
  return bands.map((b) => {
    const gainless = b.type === 'highpass' || b.type === 'notch' || b.type === 'lowpass'
    const db = gainless ? 0 : Number(b.gain) || 0
    return { id: b.id, x: freqX(midiToHz(b.midi)), y: dbY(db, -24, 18) }
  })
}

export function shelfResponse (state) {
  const preLow = Number(state.preLowMidi) || 0
  const preHigh = Number(state.preHighMidi)
  const highCut = Number.isFinite(preHigh) ? preHigh : 128
  const pts = sweep((f) => {
    let db = biquadDb(f, midiToHz(state.lowShelfMidi), 0.7, 'lowshelf', state.lowShelfDb)
      + biquadDb(f, midiToHz(state.highShelfMidi), 0.7, 'highshelf', state.highShelfDb)
    if (preLow > 8) db += biquadDb(f, midiToHz(preLow), 0.707, 'hp', 0)
    if (highCut < 120) db += biquadDb(f, midiToHz(highCut), 0.707, 'lp', 0)
    return db
  })
  return curve(pts, dbY(0, -24, 18))
}

function filterDb (f, state) {
  const fc = midiToHz(state.cutoffMidi)
  const q = qOf(state.resonance)
  const slope = state.style === '24dB' ? 2 : 1
  const lp = biquadDb(f, fc, q, 'lp', 0) * slope
  const bp = biquadDb(f, fc, q, 'bp', 0)
  const hp = biquadDb(f, fc, q, 'hp', 0) * slope
  const blend = clamp(Number(state.blend) || 0, 0, 2)
  if (blend <= 1) return lp * (1 - blend) + bp * blend
  return bp * (2 - blend) + hp * (blend - 1)
}

export function filterResponse (state) {
  const s = normalizeFilterLiteState(state)
  const pts = sweep((f) => filterDb(f, s))
  const fc = midiToHz(s.cutoffMidi)
  return {
    ...curve(pts, 96),
    handle: { x: freqX(fc), y: dbY(filterDb(fc, s), -24, 18) }
  }
}

/** Delay / chorus feedback filter: lowpass above the cutoff, highpass below, split by spread. */
export function splitFilterResponse (state) {
  const spread = clamp(Number(state.spread) || 0, 0, 1) * 96
  const mid = Number(state.cutoffMidi) || 60
  const lp = clamp(mid + spread, 8, 136)
  const hp = clamp(mid - spread, 8, 136)
  const pts = sweep((f) => {
    return biquadDb(f, midiToHz(lp), 0.707, 'lp', 0) + biquadDb(f, midiToHz(hp), 0.707, 'hp', 0)
  })
  return {
    ...curve(pts, 96),
    handle: { x: freqX(midiToHz(clamp(mid, 8, 136))), y: dbY(0, -24, 18) }
  }
}

export function driveAmount (type, db) {
  const v = clamp(Number(db) || 0, -30, 30)
  if (type === 'bitcrush') {
    const d = Math.max(v + 30, 0) / 60
    return clamp(d * d, 32 / 2147483647, 1)
  }
  if (type === 'downsample') {
    const t = 1 - Math.max(v + 30, 0) / 60
    return 1 / clamp(t * t, 32 / 2147483647, 1)
  }
  return Math.pow(10, v / 20)
}

function tanh (x) {
  const e = Math.exp(clamp(2 * x, -40, 40))
  return (e - 1) / (e + 1)
}

export function distortSample (type, x, drive) {
  if (type === 'hard') return clamp(x * drive, -1, 1)
  if (type === 'fold') {
    const adj = x * drive * 0.25 + 0.75
    const range = adj - Math.floor(adj)
    return Math.abs(range * -4 + 2) - 1
  }
  if (type === 'sinfold') {
    let a = x * drive * -0.25 + 0.5
    a = a - Math.floor(a)
    return Math.sin(a * Math.PI * 2)
  }
  if (type === 'bitcrush') return Math.round(x / drive) * drive
  if (type === 'downsample') return x
  return tanh(x * drive)
}

export function distortionShape (state) {
  const type = state.type || 'soft'
  const drive = driveAmount(type, state.drive)
  const pts = []
  const hold = type === 'downsample' ? clamp(8 / Math.max(1, drive), 0.04, 0.45) : 0
  let last = 0
  for (let i = 0; i < 96; i++) {
    const x = -1 + (2 * i) / 95
    let y = distortSample(type, x, drive)
    if (type === 'downsample') {
      if (i === 0 || x - last >= hold) last = x
      y = last
    }
    y = clamp(y, -1.2, 1.2) * 0.9
    pts.push({ x: 100 + x * 86, y: 50 - y * 40 })
  }
  return curve(pts, 50)
}

export function delayBars (state) {
  const style = state.style || 'stereo'
  const hzL = rateHz(state)
  const hzR = style === 'mono' ? hzL : rateHz(state, true)
  const fb = Math.min(0.92, Math.abs(Number(state.feedback) || 0))
  const wet = Math.sin(clamp(Number(state.mix) || 0, 0, 1) * Math.PI * 0.5)
  const span = 2
  const bars = []
  // Echoes mirror around the centre line: left channel rises from it, right channel
  // hangs below it, and both decay left to right like a tape echo.
  function push (ch, t, amp) {
    const h = Math.max(1.5, amp * 40)
    bars.push({
      x: 8 + (t / span) * 184,
      y: ch ? 50 : 50 - h,
      w: 3.2,
      h,
      cls: ch ? 'b2' : 'b1'
    })
  }
  if (style === 'pingpong' || style === 'mid-pingpong') {
    const period = 1 / hzL
    let amp = wet
    let ch = 0
    for (let t = period; t < span && bars.length < 28; t += period) {
      push(ch, t, amp)
      ch = 1 - ch
      amp *= fb
      if (amp < 0.03) break
    }
  } else {
    ;[[0, hzL], [1, hzR]].forEach(([ch, hz]) => {
      if (style === 'mono' && ch === 1) return
      let amp = wet
      const period = 1 / hz
      for (let t = period; t < span && bars.length < 28; t += period) {
        push(ch, t, amp)
        amp *= fb
        if (amp < 0.03) break
      }
    })
  }
  return bars
}

export function chorusBars (state, phase) {
  const voices = clamp(Math.round(Number(state.voices) || 1), 1, 4)
  const d1 = Math.max(0.0005, Number(state.delay1) || 0.002)
  const d2 = Math.max(0.0005, Number(state.delay2) || 0.008)
  const depth = clamp(Number(state.modDepth) || 0, 0, 1) * 0.03
  const ph = phase == null ? 0 : phase
  const bars = []
  for (let i = 0; i < voices; i++) {
    const t = voices === 1 ? 0 : i / (voices - 1)
    const base = d1 + (d2 - d1) * t
    const phL = ph + i * 0.25 / voices
    const phR = phL + 0.25
    const delL = (Math.sin(phL * Math.PI * 2) * 0.5 + 1) * depth + base
    const delR = (Math.sin(phR * Math.PI * 2) * 0.5 + 1) * depth + base
    ;[[delL, 'b1', 52], [delR, 'b2', 34]].forEach(([delay, cls, h]) => {
      const x = 8 + clamp(delay / 0.05, 0, 1) * 180
      bars.push({ x, y: 78 - h, w: 3.4, h, cls })
    })
  }
  return bars
}

export function lfoPath (depth, phase) {
  const amp = 8 + clamp(Number(depth) || 0, 0, 1) * 28
  const pts = []
  for (let i = 0; i < 64; i++) {
    const t = i / 63
    const y = 50 - Math.sin((t * Math.PI * 2) + (phase || 0)) * amp
    pts.push({ x: 8 + t * 184, y })
  }
  return pathOf(pts)
}

function onePoleG (hz) {
  const dp = Math.max(0, hz) * Math.PI / SR
  return Math.tan(dp / (dp + 1))
}

function allpassAt (w, a) {
  const c = Math.cos(w)
  const s = Math.sin(w)
  const nr = c - a
  const ni = -s
  const dr = 1 - a * c
  const di = a * s
  const den = Math.max(1e-12, dr * dr + di * di)
  return { re: (nr * dr + ni * di) / den, im: (ni * dr - nr * di) / den }
}

function cmul (a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function phaserCurve (state, phase, channelOffset) {
  const depth = clamp(Number(state.modDepth) || 0, 0, 48)
  const wobble = phase == null ? 0 : triFold(phase + channelOffset) * depth
  const midi = clamp((Number(state.centerMidi) || 80) + wobble, 8, 136)
  const g = onePoleG(midiToHz(midi))
  const a = (1 - g) / (1 + g)
  const blend = clamp(Number(state.blend) || 0, 0, 2)
  const stages = Math.min(12, 4 + Math.round(blend * 4))
  const fb = clamp(Number(state.feedback) || 0, 0, 0.97)
  const mix = clamp(state.mix == null ? 1 : Number(state.mix), 0, 1)
  const bp = 1 - Math.abs(blend - 1)
  const lpAmt = blend < 1 ? 1 - blend : 0
  const hpAmt = blend > 1 ? blend - 1 : 0
  return sweep((f) => {
    const w = 2 * Math.PI * clamp(f, 1, SR * 0.49) / SR
    let h = { re: 1, im: 0 }
    const ap = allpassAt(w, a)
    for (let i = 0; i < stages; i++) h = cmul(h, ap)
    const denRe = 1 - fb * h.re
    const denIm = -fb * h.im
    const den = Math.max(1e-8, denRe * denRe + denIm * denIm)
    const yRe = (h.re * denRe + h.im * denIm) / den
    const yIm = (h.im * denRe - h.re * denIm) / den
    const xRe = denRe / den
    const xIm = -denIm / den
    const oRe = yRe * bp + xRe * lpAmt * 0.3 + (xRe - yRe) * hpAmt
    const oIm = yIm * bp + xIm * lpAmt * 0.3 + (xIm - yIm) * hpAmt
    const tRe = (1 - mix) + mix * oRe
    const tIm = mix * oIm
    return 20 * Math.log10(Math.max(1e-6, Math.sqrt(tRe * tRe + tIm * tIm)))
  })
}

export function phaserNotches (state, phase) {
  const off = clamp(Number(state.phaseOffset) || 0, 0, 1)
  const pts = phaserCurve(state, phase, 0)
  const pts2 = phase == null ? null : phaserCurve(state, phase, off)
  return {
    line: pathOf(pts),
    line2: pts2 ? pathOf(pts2) : '',
    fill: closeFill(pts, 96),
    points: pts,
    points2: pts2 || []
  }
}

export function flangerResponse (state, phase) {
  const center = 1 / Math.max(20, midiToHz(state.centerMidi || 64))
  const buf = 0.0005
  const depth = clamp(Number(state.modDepth) || 0, 0, 1)
  const off = clamp(Number(state.phaseOffset) || 0, 0, 1)
  const fb = clamp(Number(state.feedback) || 0, -0.97, 0.97)
  const ph = Number(phase) || 0
  function delayOf (modPhase) {
    const mod = depth * triFold(modPhase) + 1
    return Math.max(buf, (center - buf) * mod + buf)
  }
  function comb (delay) {
    return sweep((f) => {
      const w = 2 * Math.PI * f * delay
      const re = 1 - fb * Math.cos(w)
      const im = fb * Math.sin(w)
      const mag = 1 / Math.max(1e-4, Math.sqrt(re * re + im * im))
      return 20 * Math.log10(Math.max(1e-6, mag))
    })
  }
  const left = comb(delayOf(ph - off / 2))
  const right = comb(delayOf(ph - off / 2 + off))
  return { line: pathOf(left), line2: pathOf(right), points: left, points2: right }
}

export function compressorCols (state) {
  const mode = state.bands || 'multiband'
  const specs = [
    { id: 'low', gain: state.lowGainDb, on: mode === 'multiband' || mode === 'low-band' },
    { id: 'band', gain: state.bandGainDb, on: mode === 'multiband' || mode === 'single' },
    { id: 'high', gain: state.highGainDb, on: mode === 'multiband' || mode === 'high-band' }
  ]
  return specs.map((col, i) => {
    const g = clamp(Number(col.gain) || 0, -30, 30)
    const h = Math.abs(g) / 30 * 36
    const up = g >= 0
    const upper = Number(col.id === 'low' ? state.lowUpperDb : col.id === 'band' ? state.bandUpperDb : state.highUpperDb)
    const thresh = clamp((0 - (Number.isFinite(upper) ? upper : -24)) / 80, 0, 1)
    return {
      x: 14 + i * 62,
      y: up ? 50 - h : 50,
      w: 46,
      h: Math.max(1.5, h),
      cls: col.on ? 'b1' : 'off',
      thresh,
      ty: 8 + thresh * 84
    }
  })
}

export function guideSegments () {
  const segs = []
  ;[-12, 0, 12].forEach((db) => {
    const y = dbY(db, -24, 18)
    segs.push({ x1: 6, y1: y, x2: 194, y2: y })
  })
  ;[100, 1000, 10000].forEach((f) => {
    const x = freqX(f)
    segs.push({ x1: x, y1: 6, x2: x, y2: 94 })
  })
  return segs
}

export function guides () {
  const lines = []
  ;[-12, 0, 12].forEach((db) => {
    const y = dbY(db, -24, 18)
    lines.push(`M6 ${y.toFixed(1)} L194 ${y.toFixed(1)}`)
  })
  ;[100, 1000, 10000].forEach((f) => {
    const x = freqX(f).toFixed(1)
    lines.push(`M${x} 6 L${x} 94`)
  })
  return lines
}
