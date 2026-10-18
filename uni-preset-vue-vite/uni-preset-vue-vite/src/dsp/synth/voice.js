/** Offline / test Twin voice. Same DSP the worklet uses, so bounce and unit tests share it. */

import { WAVETABLES, normalizeTwinState } from './params.js'

function midiHz (pitch) {
  return 440 * Math.pow(2, (pitch - 69) / 12)
}

// Continuous wavetable lookup with crossfade between adjacent tables (Vital-style morph).
function wtSample (pos, phase, noise) {
  const n = WAVETABLES.length
  const x = Math.max(0, Math.min(n - 1, pos))
  const i0 = Math.floor(x)
  const i1 = Math.min(n - 1, i0 + 1)
  const frac = x - i0
  const t0 = WAVETABLES[i0]
  const t1 = WAVETABLES[i1]
  const p = phase * t0.length
  const j = p | 0
  const f = p - j
  const a = t0[j % t0.length] + (t0[(j + 1) % t0.length] - t0[j % t0.length]) * f
  const b = t1[j % t1.length] + (t1[(j + 1) % t1.length] - t1[j % t1.length]) * f
  return a + (b - a) * frac
}

function oscSample (wave, phase, wtPos, noise) {
  if (wave === 'sine') return Math.sin(phase * Math.PI * 2)
  if (wave === 'square') return phase < 0.5 ? 1 : -1
  if (wave === 'tri') return 1 - 4 * Math.abs(Math.round(phase) - phase)
  if (wave === 'saw') return phase * 2 - 1
  if (wave === 'noise') return noise()
  return wtSample(wtPos, phase, noise)
}

function envGain (env, t, gateSec) {
  const a = Math.max(0.001, env.attack)
  const d = Math.max(0.01, env.decay)
  const s = env.sustain
  const r = Math.max(0.01, env.release)
  if (t < a) return t / a
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d)
  if (t < gateSec) return s
  const relT = t - gateSec
  if (relT >= r) return 0
  const level = t < a + d ? (1 - (1 - s) * ((Math.min(t, a + d) - a) / d)) : s
  return Math.max(0, level * (1 - relT / r))
}

function lfoValue (lfo, t) {
  const ph = (t * lfo.rate) % 1
  if (lfo.shape === 'square') return ph < 0.5 ? 1 : -1
  if (lfo.shape === 'saw') return ph * 2 - 1
  if (lfo.shape === 'tri') return 4 * Math.abs(ph - 0.5) - 1
  if (lfo.shape === 'sah') {
    const step = Math.floor(t * lfo.rate)
    const r = Math.sin(step * 12.9898) * 43758.5453
    return (r - Math.floor(r)) * 2 - 1
  }
  return Math.sin(ph * Math.PI * 2)
}

// RBJ-style one-pole biquad coefficients for a 12 dB stage.
function div (b0, b1, b2, a1, a2, a0) {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

function coeffsFor (type, cutoff, res, sr) {
  const f = Math.max(20, Math.min(sr * 0.45, cutoff))
  const w = 2 * Math.PI * f / sr
  const q = Math.max(0.3, 0.5 + res * 8)
  const a = Math.sin(w) / (2 * q)
  const cos = Math.cos(w)
  if (type === 'highpass' || type === 'high12') {
    return div((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, -2 * cos, 1 - a, 1 + a)
  }
  if (type === 'bandpass') {
    return div(a, 0, -a, -2 * cos, 1 - a, 1 + a)
  }
  if (type === 'notch') {
    return div(1, -2 * cos, 1, -2 * cos, 1 - a, 1 + a)
  }
  if (type === 'shelf') {
    const gain = 1 + res * 4
    const A = Math.sqrt(gain)
    const sq = Math.sqrt(A)
    const sw = Math.sin(w)
    const b0 = A * ((A + 1) - (A - 1) * cos + 2 * sq * sw)
    const b1 = 2 * A * ((A - 1) - (A + 1) * cos)
    const b2 = A * ((A + 1) - (A - 1) * cos - 2 * sq * sw)
    const a0 = (A + 1) + (A - 1) * cos + 2 * sq * sw
    const a1 = -2 * ((A - 1) + (A + 1) * cos)
    const a2 = (A + 1) + (A - 1) * cos - 2 * sq * sw
    return div(b0, b1, b2, a1, a2, a0)
  }
  // lowpass / low12 (default)
  return div((1 - cos) / 2, 1 - cos, (1 - cos) / 2, -2 * cos, 1 - a, 1 + a)
}

// 24 dB types cascade two 12 dB stages; 12 dB / notch / shelf use one stage.
function makeFilter (type, cutoff, res, sr) {
  const order = (type === 'lowpass' || type === 'highpass' || type === 'bandpass') ? 2 : 1
  const stages = []
  const z1 = []
  const z2 = []
  for (let i = 0; i < order; i++) {
    stages.push(coeffsFor(type, cutoff, res, sr))
    z1.push(0)
    z2.push(0)
  }
  return { stages, z1, z2 }
}

function tickFilter (flt, x) {
  let y = x
  for (let s = 0; s < flt.stages.length; s++) {
    const c = flt.stages[s]
    const yy = c.b0 * y + flt.z1[s]
    flt.z1[s] = c.b1 * y - c.a1 * yy + flt.z2[s]
    flt.z2[s] = c.b2 * y - c.a2 * yy
    y = yy
  }
  return y
}

// Recompute coefficients but KEEP delay-line state (poles) across samples.
function updateFilter (flt, type, cutoff, res, sr) {
  const nf = makeFilter(type, cutoff, res, sr)
  nf.z1 = flt.z1
  nf.z2 = flt.z2
  return nf
}

function driveShape (x, drive) {
  if (drive < 0.001) return x
  const k = 1 + drive
  return Math.tanh(x * k) / Math.tanh(k)
}

function mixMod (state, srcValues, dst, base, scale) {
  let v = base
  state.mods.forEach((m) => {
    if (m.dst !== dst) return
    v += (srcValues[m.src] || 0) * m.amount * scale
  })
  return v
}

function renderOsc (osc, pitch, t, sr, noise) {
  const n = Math.max(1, Math.round(osc.unison) || 1)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2
    const det = spread * (osc.detune || 0)
    const hz = midiHz(pitch + det / 100)
    const phase = (osc.phase + t * hz / sr * sr) % 1
    const wtBase = (osc.wave && osc.wave.startsWith('wt')) ? (Number(osc.wave.slice(2)) || osc.wt) : osc.wt
    const wtPos = wtBase + (osc.wtPos || 0)
    sum += oscSample(osc.wave, phase, wtPos, noise)
  }
  return (sum / n) * osc.level
}

// Compact FX chain (chorus → delay → reverb) shared by the offline renderer.
function makeFx (state, sr) {
  const chLen = Math.max(1, Math.floor(sr * 0.03))
  const dLen = Math.max(1, Math.floor((0.05 + state.delay * 0.5) * sr))
  const base = [0.0297, 0.0371, 0.0411, 0.0437]
  const revSize = 0.02 + state.reverb * 0.10
  return {
    sr,
    chBuf: new Float32Array(chLen), chI: 0, chLfo: 0, chWet: state.chorus,
    dBuf: new Float32Array(dLen), dI: 0, dLen, dWet: state.delay,
    revLen: base.map((s) => Math.max(1, Math.floor((revSize + s) * sr))),
    revBuf: base.map(() => new Float32Array(Math.max(1, Math.floor((revSize + 0.03) * sr)))),
    revI: 0, rWet: state.reverb
  }
}

function processFx (fx, inL, inR) {
  // Chorus: short modulated delay, stereo decorrelated.
  let l = inL
  let r = inR
  if (fx.chWet > 0.001) {
    fx.chLfo = (fx.chLfo + 5.5 / fx.sr) % 1
    const mod = Math.sin(fx.chLfo * Math.PI * 2) * fx.chBuf.length * 0.4
    const ci = (fx.chI + fx.chBuf.length - (fx.chBuf.length * 0.5 + mod) | 0) % fx.chBuf.length
    const ct = fx.chBuf[(ci + fx.chBuf.length) % fx.chBuf.length]
    fx.chBuf[fx.chI] = (l + r) * 0.5
    fx.chI = (fx.chI + 1) % fx.chBuf.length
    l += ct * fx.chWet * 0.6
    r += ct * fx.chWet * 0.6 * -1
  }
  // Delay: feedback echo.
  if (fx.dWet > 0.001) {
    const dt = fx.dBuf[fx.dI]
    const wet = dt * (0.25 + fx.dWet * 0.6)
    fx.dBuf[fx.dI] = l * 0.7 + dt * 0.45
    fx.dI = (fx.dI + 1) % fx.dLen
    l += wet
    r += wet
  }
  // Reverb: 4-line feedback delay network with light damping.
  if (fx.rWet > 0.001) {
    let acc = 0
    for (let i = 0; i < 4; i++) {
      const li = (fx.revI + fx.revLen[i]) % fx.revBuf[i].length
      const s = fx.revBuf[i][li]
      acc += s
      const fb = s * 0.5 + (l + r) * 0.25 * fx.rWet
      fx.revBuf[i][fx.revI % fx.revBuf[i].length] = fb
    }
    fx.revI++
    const wet = acc * 0.25 * fx.rWet
    l += wet
    r += wet
  }
  return [l, r]
}

/** Render one voice into a stereo Float32 buffer. Returns peak amplitude. */
export function renderTwinVoice (outL, outR, options = {}) {
  const state = normalizeTwinState(options.state)
  const sr = options.sampleRate || 44100
  const pitch = options.pitch == null ? 60 : options.pitch
  const vel = options.velocity == null ? 0.8 : options.velocity
  const gateSec = options.gateSec == null ? 0.4 : options.gateSec
  const frames = outL.length
  let seed = (pitch * 1103515245 + 12345) >>> 0
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 0xffffffff) * 2 - 1 }
  let f1 = makeFilter(state.filter1.type, state.filter1.cutoff, state.filter1.res, sr)
  let f2 = makeFilter(state.filter2.type, state.filter2.cutoff, state.filter2.res, sr)
  const fx = makeFx(state, sr)
  let peak = 0
  for (let i = 0; i < frames; i++) {
    const t = i / sr
    const e1 = envGain(state.env1, t, gateSec)
    const e2 = envGain(state.env2, t, gateSec)
    const l1 = lfoValue(state.lfo1, t) * state.lfo1.amount
    const l2 = lfoValue(state.lfo2, t) * state.lfo2.amount
    const src = { env1: e1, env2: e2, lfo1: l1, lfo2: l2, vel }
    const cut = mixMod(state, src, 'cutoff', state.filter1.cutoff, 6000)
    const drive1 = state.filter1.drive + mixMod(state, src, 'f1Drive', 0, 6)
    const drive2 = state.filter2.drive + mixMod(state, src, 'f2Drive', 0, 6)
    const amp = mixMod(state, src, 'amp', 1, 1) * e1 * vel * state.gain
    const o1 = renderOsc(state.osc1, pitch, t, sr, noise) * mixMod(state, src, 'osc1Level', 1, 1)
    const o2 = renderOsc(state.osc2, pitch, t, sr, noise) * mixMod(state, src, 'osc2Level', 1, 1)
    const o3 = renderOsc(state.osc3, pitch, t, sr, noise) * mixMod(state, src, 'osc3Level', 1, 1)
    let x = o1 + o2 + o3
    f1 = updateFilter(f1, state.filter1.type, cut, mixMod(state, src, 'res', state.filter1.res, 0.5), sr)
    const y1 = driveShape(tickFilter(f1, x), drive1)
    f2 = updateFilter(f2, state.filter2.type, state.filter2.cutoff, state.filter2.res, sr)
    const y2in = state.filterRoute === 'parallel' ? x : y1
    const y2 = driveShape(tickFilter(f2, y2in), drive2)
    const y = state.filterRoute === 'parallel' ? (y1 + y2) * 0.5 : y2
    const sample = y * amp
    const pan = mixMod(state, src, 'pan', (state.osc1.pan + state.osc2.pan) * 0.5, 1)
    let pl = sample * Math.min(1, 1 - pan)
    let pr = sample * Math.min(1, 1 + pan)
    const out = processFx(fx, pl, pr)
    pl = out[0]; pr = out[1]
    outL[i] += pl
    outR[i] += pr
    peak = Math.max(peak, Math.abs(pl), Math.abs(pr))
  }
  return peak
}

export function renderTwinNote (options = {}) {
  const sr = options.sampleRate || 44100
  const gateSec = options.gateSec == null ? 0.4 : options.gateSec
  const rel = (options.state && options.state.env1 && options.state.env1.release) || 0.22
  const duration = gateSec + rel + 0.05
  const frames = Math.ceil(duration * sr)
  const L = new Float32Array(frames)
  const R = new Float32Array(frames)
  const peak = renderTwinVoice(L, R, { ...options, sampleRate: sr, gateSec })
  return { L, R, sampleRate: sr, peak, duration }
}
