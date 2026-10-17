/** Offline / test Twin voice. Same DSP the worklet uses, so bounce and unit tests share it. */

import { WAVETABLES, normalizeTwinState } from './params.js'

function midiHz (pitch) {
  return 440 * Math.pow(2, (pitch - 69) / 12)
}

function oscSample (wave, phase, wtIndex, noise) {
  if (wave === 'sine') return Math.sin(phase * Math.PI * 2)
  if (wave === 'square') return phase < 0.5 ? 1 : -1
  if (wave === 'tri') return 1 - 4 * Math.abs(Math.round(phase) - phase)
  if (wave === 'saw') return phase * 2 - 1
  if (wave === 'noise') return noise()
  const table = WAVETABLES[wtIndex | 0] || WAVETABLES[0]
  const x = phase * table.length
  const i = x | 0
  const f = x - i
  const a = table[i % table.length]
  const b = table[(i + 1) % table.length]
  return a + (b - a) * f
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
  return Math.sin(ph * Math.PI * 2)
}

function biquad (type, cutoff, res, sr) {
  const f = Math.max(20, Math.min(sr * 0.45, cutoff))
  const w = 2 * Math.PI * f / sr
  const q = 0.5 + res * 8
  const a = Math.sin(w) / (2 * q)
  const cos = Math.cos(w)
  let b0, b1, b2, a0, a1, a2
  if (type === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2
  } else if (type === 'bandpass') {
    b0 = a; b1 = 0; b2 = -a
  } else {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2
  }
  a0 = 1 + a
  a1 = -2 * cos
  a2 = 1 - a
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, z1: 0, z2: 0 }
}

function tickBiquad (f, x) {
  const y = f.b0 * x + f.z1
  f.z1 = f.b1 * x - f.a1 * y + f.z2
  f.z2 = f.b2 * x - f.a2 * y
  return y
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
    const wt = osc.wave && osc.wave.startsWith('wt') ? (Number(osc.wave.slice(2)) || osc.wt) : osc.wt
    sum += oscSample(osc.wave, phase, wt, noise)
  }
  return (sum / n) * osc.level
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
  const f1 = biquad(state.filter1.type, state.filter1.cutoff, state.filter1.res, sr)
  const f2 = biquad(state.filter2.type, state.filter2.cutoff, state.filter2.res, sr)
  let peak = 0
  for (let i = 0; i < frames; i++) {
    const t = i / sr
    const e1 = envGain(state.env1, t, gateSec)
    const e2 = envGain(state.env2, t, gateSec)
    const l1 = lfoValue(state.lfo1, t) * state.lfo1.amount
    const l2 = lfoValue(state.lfo2, t) * state.lfo2.amount
    const src = { env1: e1, env2: e2, lfo1: l1, lfo2: l2, vel }
    const cut = mixMod(state, src, 'cutoff', state.filter1.cutoff, 6000)
    const amp = mixMod(state, src, 'amp', 1, 1) * e1 * vel * state.gain
    const o1 = renderOsc(state.osc1, pitch, t, sr, noise) * mixMod(state, src, 'osc1Level', 1, 1)
    const o2 = renderOsc(state.osc2, pitch, t, sr, noise) * mixMod(state, src, 'osc2Level', 1, 1)
    const o3 = renderOsc(state.osc3, pitch, t, sr, noise) * mixMod(state, src, 'osc3Level', 1, 1)
    let x = o1 + o2 + o3
    f1.b0 = biquad(state.filter1.type, cut, mixMod(state, src, 'res', state.filter1.res, 0.5), sr).b0
    Object.assign(f1, biquad(state.filter1.type, cut, state.filter1.res, sr), { z1: f1.z1, z2: f1.z2 })
    const y1 = tickBiquad(f1, x)
    const y2 = tickBiquad(f2, state.filterRoute === 'parallel' ? x : y1)
    const y = state.filterRoute === 'parallel' ? (y1 + y2) * 0.5 : y2
    const sample = y * amp
    const pan = mixMod(state, src, 'pan', (state.osc1.pan + state.osc2.pan) * 0.5, 1)
    const pl = sample * Math.min(1, 1 - pan)
    const pr = sample * Math.min(1, 1 + pan)
    outL[i] += pl
    outR[i] += pr
    peak = Math.max(peak, Math.abs(sample))
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
