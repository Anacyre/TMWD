/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors
 *
 * Visual helpers for the VitalLite effect faces. Waveshaper math follows
 * the VitalLite distortion port (itself a derivative of Vital).
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { midiToHz } from './params.js'

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

function freqX (f) {
  const t = Math.log(Math.max(20, f) / 20) / Math.log(1000)
  return 6 + clamp(t, 0, 1) * 188
}

function dbY (db, lo, hi) {
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

function biquadDb (f, fc, q, type, gainDb) {
  const A = Math.pow(10, (Number(gainDb) || 0) / 40)
  const w = 2 * Math.PI * clamp(f, 1, SR * 0.49) / SR
  const cw = Math.cos(w)
  const alpha = Math.sin(w) / (2 * Math.max(0.15, q))
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
  const lowType = state.lowMode === 'highpass' ? 'hp' : 'lowshelf'
  const bandType = state.bandMode === 'notch' ? 'notch' : 'bell'
  const highType = state.highMode === 'lowpass' ? 'lp' : 'highshelf'
  const pts = sweep((f) => {
    return biquadDb(f, midiToHz(state.lowMidi), qOf(state.lowRes), lowType, state.lowGainDb)
      + biquadDb(f, midiToHz(state.bandMidi), qOf(state.bandRes), bandType, state.bandGainDb)
      + biquadDb(f, midiToHz(state.highMidi), qOf(state.highRes), highType, state.highGainDb)
  })
  return { line: pathOf(pts), fill: closeFill(pts, 96) }
}

export function shelfResponse (state) {
  const pts = sweep((f) => {
    const low = biquadDb(f, midiToHz(state.lowShelfMidi), 0.7, 'lowshelf', state.lowShelfDb)
    const high = biquadDb(f, midiToHz(state.highShelfMidi), 0.7, 'highshelf', state.highShelfDb)
    return low + high
  })
  return { line: pathOf(pts), fill: closeFill(pts, dbY(0, -24, 18)) }
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
  const pts = sweep((f) => filterDb(f, state))
  return { line: pathOf(pts), fill: closeFill(pts, 96) }
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
  return { line: pathOf(pts), fill: closeFill(pts, 50) }
}

export function delayBars (state) {
  const style = state.style || 'stereo'
  const hzL = Math.max(0.05, Number(state.frequency) || 4)
  const hzR = style === 'mono' ? hzL : Math.max(0.05, Number(state.auxFrequency) || 4)
  const fb = Math.min(0.92, Math.abs(Number(state.feedback) || 0))
  const wet = Math.sin(clamp(Number(state.mix) || 0, 0, 1) * Math.PI * 0.5)
  const span = 2
  const bars = []
  function push (ch, t, amp) {
    const top = ch ? 54 : 8
    const h = Math.max(1.5, amp * 34)
    bars.push({
      x: 8 + (t / span) * 184,
      y: top + (36 - h),
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

export function chorusBars (state) {
  const voices = clamp(Math.round(Number(state.voices) || 1), 1, 4)
  const d1 = Number(state.delay1) || 0.002
  const d2 = Number(state.delay2) || 0.008
  const depth = clamp(Number(state.modDepth) || 0, 0, 1)
  const bars = []
  for (let i = 0; i < voices; i++) {
    const u = voices === 1 ? 0.5 : i / (voices - 1)
    const base = d1 + (d2 - d1) * u
    const spread = (0.0004 + base * 0.35) * depth
    ;[base - spread, base + spread].forEach((delay, k) => {
      if (k === 1 && depth < 0.04) return
      const x = 8 + clamp(delay / 0.02, 0, 1) * 184
      bars.push({ x, y: 18, w: 4, h: k ? 28 : 46, cls: k ? 'b2' : 'b1' })
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

export function phaserNotches (state) {
  const center = midiToHz(state.centerMidi || 80)
  const depth = clamp(Number(state.modDepth) || 0, 0, 48)
  const pts = sweep((f) => {
    let db = 0
    const notches = 5
    for (let i = 0; i < notches; i++) {
      const semi = (i - (notches - 1) / 2) * (depth / Math.max(1, notches - 1))
      const nf = center * Math.pow(2, semi / 12)
      const ratio = Math.log(Math.max(1e-6, f / nf))
      db += -18 * Math.exp(-Math.pow(ratio / 0.08, 2))
    }
    return db * (0.35 + clamp(Number(state.feedback) || 0, 0, 1) * 0.65)
  })
  return { line: pathOf(pts), fill: closeFill(pts, 96) }
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
    return {
      x: 28 + i * 56,
      y: up ? 50 - h : 50,
      w: 28,
      h: Math.max(1.5, h),
      cls: col.on ? 'b1' : 'off',
      thresh: clamp((0 - Number(col.id === 'low' ? state.lowUpperDb : col.id === 'band' ? state.bandUpperDb : state.highUpperDb)) / 80, 0, 1)
    }
  })
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
