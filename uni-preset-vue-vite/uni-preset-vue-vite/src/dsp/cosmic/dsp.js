/** Cosmic 2 voice DSP. No imports: the worklet is this file with exports stripped. */

export const COSMIC_VERSION = 2
export const WAVES = ['sine', 'tri', 'saw', 'square', 'wt']
export const WT_NAMES = ['Saw bank', 'Square bank', 'Vowel', 'Bell', 'Hollow', 'Growl']
export const WARPS = ['off', 'bend', 'sync', 'fm', 'rm', 'pwm']
export const FILTER_TYPES = ['lp', 'hp', 'bp', 'notch', 'ladder']
export const FILTER_ROUTES = ['serial', 'parallel']
export const NOISE_TYPES = ['white', 'pink', 'brown', 'metal']
export const LFO_SHAPES = ['sine', 'tri', 'saw', 'square', 'sah', 'draw']
export const LFO_MODES = ['loop', 'oneshot', 'trigger']
export const PLAY_MODES = ['poly', 'mono', 'legato']
export const FX_IDS = ['distortion', 'eq', 'compressor', 'chorus', 'flanger', 'phaser', 'delay', 'reverb']
export const MOD_SOURCES = ['env1', 'env2', 'env3', 'lfo1', 'lfo2', 'lfo3', 'vel', 'note', 'wheel', 'after', 'macro1', 'macro2', 'macro3', 'macro4', 'macro5', 'macro6', 'macro7', 'macro8']
export const MOD_DESTS = [
  'osc0.level', 'osc0.pan', 'osc0.frame', 'osc0.warp', 'osc0.pitch',
  'osc1.level', 'osc1.pan', 'osc1.frame', 'osc1.warp', 'osc1.pitch',
  'osc2.level', 'osc2.pan', 'osc2.frame', 'osc2.warp', 'osc2.pitch',
  'sub.level', 'noise.level',
  'f0.cutoff', 'f0.res', 'f1.cutoff', 'f1.res',
  'amp',
  'macro1', 'macro2', 'macro3', 'macro4', 'macro5', 'macro6', 'macro7', 'macro8',
  'fx.distortion', 'fx.eq', 'fx.compressor', 'fx.chorus', 'fx.flanger', 'fx.phaser', 'fx.delay', 'fx.reverb'
]
export const SRC_COLORS = {
  env1: '#7ee0c6', env2: '#f0c36a', env3: '#e58cff',
  lfo1: '#6ab0ff', lfo2: '#ff8f6a', lfo3: '#c6e07a',
  vel: '#f2f5f8', note: '#9ad7ff', wheel: '#d7c4ff', after: '#ffb4c8',
  macro1: '#d7c4ff', macro2: '#d7c4ff', macro3: '#d7c4ff', macro4: '#d7c4ff',
  macro5: '#d7c4ff', macro6: '#d7c4ff', macro7: '#d7c4ff', macro8: '#d7c4ff'
}
/** Total unison oscillators shared by every sounding voice. */
export const UNISON_BUDGET = 64
export const MAX_VOICES = 24
const SMOOTH_SEC = 0.005
const CTL_MASK = 15

const DST = {}
MOD_DESTS.forEach((id, i) => { DST[id] = i })

function clamp (n, min, max, fallback) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

function curve (x, c) {
  const u = x < 0 ? 0 : x > 1 ? 1 : x
  const k = Number(c) || 0
  if (Math.abs(k) < 0.001) return u
  const e = k > 0 ? 1 + k * 3 : 1 / (1 + (-k) * 3)
  return Math.pow(u, e)
}

/* Band-limited wavetables: every frame is stored once per octave with the harmonics that fit below Nyquist. */

const TABLE_N = 1024
const MIP_LEVELS = 10

function fft (re, im, inverse) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      const half = len >> 1
      for (let k = 0; k < half; k++) {
        const ar = re[i + k + half] * cr - im[i + k + half] * ci
        const ai = re[i + k + half] * ci + im[i + k + half] * cr
        re[i + k + half] = re[i + k] - ar
        im[i + k + half] = im[i + k] - ai
        re[i + k] += ar
        im[i + k] += ai
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}

function mipFromSpectrum (re, im, gain) {
  const levels = []
  for (let l = 0; l < MIP_LEVELS; l++) {
    const cap = Math.min(TABLE_N / 2 - 1, (TABLE_N / 2) >> l)
    const r = new Float64Array(TABLE_N)
    const q = new Float64Array(TABLE_N)
    for (let h = 1; h <= cap; h++) {
      r[h] = re[h]; q[h] = im[h]
      r[TABLE_N - h] = re[TABLE_N - h]; q[TABLE_N - h] = im[TABLE_N - h]
    }
    fft(r, q, true)
    const out = new Float32Array(TABLE_N + 1)
    for (let k = 0; k < TABLE_N; k++) out[k] = r[k] / TABLE_N * gain
    out[TABLE_N] = out[0]
    levels.push(out)
  }
  return levels
}

function mipFromSamples (buf) {
  const re = Float64Array.from(buf)
  const im = new Float64Array(TABLE_N)
  fft(re, im, false)
  const top = mipFromSpectrum(re, im, 1)[0]
  let peak = 0.0001
  for (let i = 0; i < TABLE_N; i++) peak = Math.max(peak, Math.abs(top[i]))
  return mipFromSpectrum(re, im, 0.9 / peak)
}

/** a[h] multiplies sin(2πhp), b[h] multiplies cos(2πhp). */
function mipFromSeries (fn) {
  const re = new Float64Array(TABLE_N)
  const im = new Float64Array(TABLE_N)
  const half = TABLE_N / 2
  for (let h = 1; h < half; h++) {
    const c = fn(h)
    if (!c) continue
    re[h] = (c[1] || 0) * half
    im[h] = -(c[0] || 0) * half
    re[TABLE_N - h] = re[h]
    im[TABLE_N - h] = -im[h]
  }
  return mipFromSpectrum(re, im, 1)
}

function buildFrame (kind, morph) {
  const t = morph
  const buf = new Float64Array(TABLE_N)
  for (let i = 0; i < TABLE_N; i++) {
    const p = i / TABLE_N
    let s = 0
    if (kind === 'saw') {
      const nh = 2 + Math.round(t * 18)
      for (let h = 1; h <= nh; h++) s += Math.sin(p * h * Math.PI * 2) / h
    } else if (kind === 'square') {
      const nh = 1 + Math.round(t * 8)
      for (let h = 0; h < nh; h++) s += Math.sin(p * (h * 2 + 1) * Math.PI * 2) / (h * 2 + 1)
    } else if (kind === 'vocal') {
      const f1 = 1 + Math.round(t * 3)
      const f2 = 4 + Math.round(t * 6)
      s = Math.sin(p * Math.PI * 2) + 0.7 * Math.sin(p * f1 * Math.PI * 2) + 0.45 * Math.sin(p * f2 * Math.PI * 2)
    } else if (kind === 'bell') {
      const ratios = [1, 2.3 + t, 3.7, 5.1 + t * 2, 7.4]
      for (let h = 0; h < ratios.length; h++) s += Math.sin(p * ratios[h] * Math.PI * 2) / (h + 1)
    } else if (kind === 'hollow') {
      s = Math.sin(p * Math.PI * 2) * (0.4 + 0.6 * Math.sin(p * (2 + t * 6) * Math.PI))
      s += 0.35 * Math.sin(p * (3 + t * 4) * Math.PI * 2)
    } else {
      const nh = 3 + Math.round(t * 10)
      for (let h = 1; h <= nh; h++) s += Math.sin(p * h * Math.PI * 2 + t * h) / Math.sqrt(h)
    }
    buf[i] = s
  }
  return buf
}

const BASIC = {
  sine: mipFromSeries((h) => h === 1 ? [1, 0] : null),
  saw: mipFromSeries((h) => [-2 / (Math.PI * h), 0]),
  square: mipFromSeries((h) => (h & 1) ? [4 / (Math.PI * h), 0] : null),
  tri: mipFromSeries((h) => (h & 1) ? [0, -8 / (Math.PI * Math.PI * h * h)] : null)
}

const WT = ['saw', 'square', 'vocal', 'bell', 'hollow', 'growl'].map((kind) => {
  const frames = []
  for (let f = 0; f < 8; f++) frames.push(mipFromSamples(buildFrame(kind, f / 7)))
  return frames
})

function readTab (tab, phase) {
  const x = (phase - Math.floor(phase)) * TABLE_N
  const i = x | 0
  if (i >= TABLE_N) return tab[0]
  const a = tab[i]
  return a + (tab[i + 1] - a) * (x - i)
}

/** Smallest table whose top harmonic stays under Nyquist for this fundamental. */
export function mipLevel (hz, sr) {
  const x = Math.log2(Math.max(1e-3, hz) * TABLE_N / sr)
  const l = Math.ceil(x - 0.05)
  return l < 0 ? 0 : l >= MIP_LEVELS ? MIP_LEVELS - 1 : l
}

function wtAt (index, framePos, phase, lvl) {
  const table = WT[index < 0 ? 0 : index >= WT.length ? WT.length - 1 : index | 0]
  const x = (framePos < 0 ? 0 : framePos > 1 ? 1 : framePos) * (table.length - 1)
  const i0 = x | 0
  const i1 = i0 + 1 < table.length ? i0 + 1 : i0
  const f = x - i0
  const a = readTab(table[i0][lvl], phase)
  return f < 1e-6 ? a : a + (readTab(table[i1][lvl], phase) - a) * f
}

function basicWave (wave, phase, lvl) {
  return readTab((BASIC[wave] || BASIC.saw)[lvl], phase)
}

function waved (osc, phase, fm, lvl) {
  const w = osc.warpAmt < 0 ? 0 : osc.warpAmt > 1 ? 1 : osc.warpAmt
  let p = phase - Math.floor(phase)
  if (osc.warp === 'bend' && w > 0.001) p = Math.pow(p, Math.pow(4, (w - 0.5) * 2))
  else if (osc.warp === 'sync') p = (p * (1 + w * 6)) % 1
  else if (osc.warp === 'fm') {
    p += (fm || 0) * w
    p -= Math.floor(p)
  }
  let s = osc.wave === 'wt' ? wtAt(osc.wt, osc.frame, p, lvl) : basicWave(osc.wave, p, lvl)
  if (osc.warp === 'pwm') {
    const p2 = (p + 0.08 + (1 - w) * 0.84) % 1
    s -= osc.wave === 'wt' ? wtAt(osc.wt, osc.frame, p2, lvl) : basicWave(osc.wave, p2, lvl)
  } else if (osc.warp === 'rm') {
    const m = fm == null ? Math.sin(p * Math.PI * 2) : fm
    s *= (1 - w) + w * m
  }
  return s
}

/** Warps that compress the phase add harmonics, so they need a darker table. */
function warpStretch (osc) {
  const w = osc.warpAmt
  if (osc.warp === 'sync') return 1 + w * 6
  if (osc.warp === 'bend') return 1 + Math.abs(w - 0.5) * 6
  if (osc.warp === 'fm') return 1 + w * 3
  return 1
}

/* State */

function defaultOsc (wave, level, extra) {
  const e = extra || {}
  return {
    on: e.on == null ? true : !!e.on,
    wave: wave,
    wt: e.wt || 0,
    frame: e.frame || 0,
    level: level,
    pan: e.pan || 0,
    oct: e.oct || 0,
    semi: e.semi || 0,
    fine: e.fine || 0,
    phase: e.phase || 0,
    randomPhase: !!e.randomPhase,
    unison: e.unison == null ? 1 : e.unison,
    detune: e.detune == null ? 12 : e.detune,
    spread: e.spread == null ? 0.45 : e.spread,
    blend: e.blend || 0,
    warp: e.warp || 'off',
    warpAmt: e.warpAmt || 0,
    fmFrom: e.fmFrom == null ? -1 : e.fmFrom,
    dest: e.dest || 'both'
  }
}

function defaultEnv (a, d, s, r) {
  return { attack: a, decay: d, sustain: s, release: r, aCurve: 0, dCurve: 0, rCurve: 0 }
}

function defaultLfo (rate) {
  return {
    shape: 'sine', rate: rate, sync: false, beats: 1, depth: 1, phase: 0,
    fade: 0, delay: 0, smooth: 0, mode: 'loop', retrigger: true,
    points: [{ t: 0, v: -1, c: 0 }, { t: 0.5, v: 1, c: 0 }, { t: 1, v: -1, c: 0 }],
    velMap: [], noteMap: []
  }
}

function defaultFx () {
  return [
    { id: 'distortion', on: false, mix: 0.45, drive: 0.35 },
    { id: 'eq', on: false, mix: 1, low: 0, mid: 0, high: 0 },
    { id: 'compressor', on: false, mix: 1, threshold: 0.35, ratio: 3, attack: 0.012, release: 0.14, low: 1, high: 1 },
    { id: 'chorus', on: true, mix: 0.16, rate: 0.35, depth: 0.45 },
    { id: 'flanger', on: false, mix: 0.3, rate: 0.2, depth: 0.5, feedback: 0.35 },
    { id: 'phaser', on: false, mix: 0.35, rate: 0.15, depth: 0.6, feedback: 0.35 },
    { id: 'delay', on: false, mix: 0.28, sync: true, beats: 0.375, time: 0.32, feedback: 0.38 },
    { id: 'reverb', on: true, mix: 0.18, size: 0.55, damp: 0.45 }
  ]
}

export function defaultCosmicState () {
  return {
    version: COSMIC_VERSION,
    osc: [
      defaultOsc('saw', 0.72, { unison: 2, detune: 8, spread: 0.4 }),
      defaultOsc('square', 0.28, { semi: 0, detune: 6, pan: 0.15 }),
      defaultOsc('sine', 0.12)
    ],
    sub: { on: false, wave: 'sine', oct: -1, level: 0.45, pan: 0, dest: 'f1' },
    noise: { on: false, type: 'white', level: 0.12, pan: 0, dest: 'f1' },
    env: [defaultEnv(0.01, 0.22, 0.72, 0.28), defaultEnv(0.05, 0.35, 0.4, 0.4), defaultEnv(0.2, 0.4, 0.5, 0.5)],
    lfo: [defaultLfo(4), defaultLfo(0.35), defaultLfo(0.12)],
    macros: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ name: 'Macro ' + n, value: 0 })),
    filters: [
      { on: true, type: 'lp', slope: 24, cutoff: 3200, res: 0.22, drive: 0.05, mix: 1, key: 0.15 },
      { on: true, type: 'lp', slope: 12, cutoff: 9000, res: 0.08, drive: 0, mix: 1, key: 0 }
    ],
    filterRoute: 'serial',
    fx: defaultFx(),
    mods: [],
    global: { poly: 8, mode: 'poly', glide: 0, glideMode: 'time', bend: 2, volume: 0.85, tune: 0 },
    meta: { id: 'factory:init', name: 'Init', category: 'Init' }
  }
}

function normOsc (src, fallback) {
  const s = src && typeof src === 'object' ? src : {}
  return {
    on: s.on == null ? fallback.on : !!s.on,
    wave: WAVES.indexOf(s.wave) >= 0 ? s.wave : fallback.wave,
    wt: clamp(s.wt, 0, WT_NAMES.length - 1, fallback.wt) | 0,
    frame: clamp(s.frame, 0, 1, fallback.frame),
    level: clamp(s.level, 0, 1, fallback.level),
    pan: clamp(s.pan, -1, 1, fallback.pan),
    oct: clamp(s.oct, -3, 3, fallback.oct) | 0,
    semi: clamp(s.semi, -24, 24, fallback.semi),
    fine: clamp(s.fine, -100, 100, fallback.fine),
    phase: clamp(s.phase, 0, 1, fallback.phase),
    randomPhase: !!s.randomPhase,
    unison: clamp(s.unison, 1, 8, fallback.unison) | 0,
    detune: clamp(s.detune, 0, 80, fallback.detune),
    spread: clamp(s.spread, 0, 1, fallback.spread),
    blend: clamp(s.blend, 0, 1, fallback.blend),
    warp: WARPS.indexOf(s.warp) >= 0 ? s.warp : 'off',
    warpAmt: clamp(s.warpAmt, 0, 1, fallback.warpAmt),
    fmFrom: clamp(s.fmFrom, -1, 2, -1) | 0,
    dest: s.dest === 'f1' || s.dest === 'f2' || s.dest === 'dry' || s.dest === 'both' ? s.dest : fallback.dest
  }
}

function normEnv (src, fallback) {
  const s = src && typeof src === 'object' ? src : {}
  return {
    attack: clamp(s.attack, 0.001, 8, fallback.attack),
    decay: clamp(s.decay, 0.001, 8, fallback.decay),
    sustain: clamp(s.sustain, 0, 1, fallback.sustain),
    release: clamp(s.release, 0.001, 12, fallback.release),
    aCurve: clamp(s.aCurve, -1, 1, 0),
    dCurve: clamp(s.dCurve, -1, 1, 0),
    rCurve: clamp(s.rCurve, -1, 1, 0)
  }
}

function normPoints (src, min, max, limit) {
  if (!Array.isArray(src)) return []
  return src.map((p) => ({
    t: clamp(p && p.t, 0, 1, 0),
    v: clamp(p && p.v, min, max, 0),
    c: clamp(p && p.c, -1, 1, 0)
  })).slice(0, limit || 16).sort((a, b) => a.t - b.t)
}

function normLfo (src, fallback) {
  const s = src && typeof src === 'object' ? src : {}
  let points = normPoints(s.points, -1, 1, 16)
  const shape = LFO_SHAPES.indexOf(s.shape) >= 0 ? s.shape : fallback.shape
  if (shape === 'draw' && points.length < 2) points = fallback.points.map((p) => ({ t: p.t, v: p.v, c: p.c }))
  return {
    shape: shape,
    rate: clamp(s.rate, 0.02, 40, fallback.rate),
    sync: !!s.sync,
    beats: clamp(s.beats, 0.03125, 16, fallback.beats),
    depth: clamp(s.depth, 0, 1, fallback.depth),
    phase: clamp(s.phase, 0, 1, fallback.phase),
    fade: clamp(s.fade, 0, 8, 0),
    delay: clamp(s.delay, 0, 4, 0),
    smooth: clamp(s.smooth, 0, 1, 0),
    mode: LFO_MODES.indexOf(s.mode) >= 0 ? s.mode : 'loop',
    retrigger: s.retrigger == null ? true : !!s.retrigger,
    points: points,
    velMap: normPoints(s.velMap, 0, 1, 8),
    noteMap: normPoints(s.noteMap, 0, 1, 8)
  }
}

function normFilt (src, fallback) {
  const s = src && typeof src === 'object' ? src : {}
  return {
    on: s.on == null ? true : !!s.on,
    type: FILTER_TYPES.indexOf(s.type) >= 0 ? s.type : fallback.type,
    slope: Number(s.slope) === 12 ? 12 : 24,
    cutoff: clamp(s.cutoff, 30, 18000, fallback.cutoff),
    res: clamp(s.res, 0, 0.97, fallback.res),
    drive: clamp(s.drive, 0, 1, fallback.drive),
    mix: clamp(s.mix, 0, 1, fallback.mix),
    key: clamp(s.key, -1, 1, fallback.key)
  }
}

function normFxItem (id, src, fallback) {
  const s = src && typeof src === 'object' ? src : {}
  const base = {
    id: id,
    on: s.on == null ? !!fallback.on : !!s.on,
    mix: clamp(s.mix, 0, 1, fallback.mix)
  }
  if (id === 'distortion') base.drive = clamp(s.drive, 0, 1, fallback.drive)
  if (id === 'eq') {
    base.low = clamp(s.low, -18, 18, 0)
    base.mid = clamp(s.mid, -18, 18, 0)
    base.high = clamp(s.high, -18, 18, 0)
  }
  if (id === 'compressor') {
    base.threshold = clamp(s.threshold, 0.02, 1, fallback.threshold)
    base.ratio = clamp(s.ratio, 1, 12, fallback.ratio)
    base.attack = clamp(s.attack, 0.001, 0.2, fallback.attack)
    base.release = clamp(s.release, 0.01, 1, fallback.release)
    base.low = clamp(s.low, 0, 2, 1)
    base.high = clamp(s.high, 0, 2, 1)
  }
  if (id === 'chorus' || id === 'flanger' || id === 'phaser') {
    base.rate = clamp(s.rate, 0.02, 8, fallback.rate || 0.3)
    base.depth = clamp(s.depth, 0, 1, fallback.depth || 0.4)
  }
  if (id === 'flanger' || id === 'phaser') base.feedback = clamp(s.feedback, 0, 0.9, fallback.feedback || 0.3)
  if (id === 'delay') {
    base.sync = s.sync == null ? true : !!s.sync
    base.beats = clamp(s.beats, 0.03125, 2, fallback.beats)
    base.time = clamp(s.time, 0.01, 1.5, fallback.time)
    base.feedback = clamp(s.feedback, 0, 0.9, fallback.feedback)
  }
  if (id === 'reverb') {
    base.size = clamp(s.size, 0, 1, fallback.size)
    base.damp = clamp(s.damp, 0, 1, fallback.damp)
  }
  return base
}

/** Accepts Cosmic 1 patches unchanged: the format only gained `version` and the ladder filter type. */
export function normalizeCosmicState (state) {
  const d = defaultCosmicState()
  const s = state && typeof state === 'object' ? state : {}
  const oscSrc = Array.isArray(s.osc) ? s.osc : []
  const envSrc = Array.isArray(s.env) ? s.env : []
  const lfoSrc = Array.isArray(s.lfo) ? s.lfo : []
  const filtSrc = Array.isArray(s.filters) ? s.filters : []
  const macroSrc = Array.isArray(s.macros) ? s.macros : []
  const fxById = {}
  const order = []
  ;(Array.isArray(s.fx) ? s.fx : []).forEach((fx) => {
    if (!fx || FX_IDS.indexOf(fx.id) < 0 || fxById[fx.id]) return
    fxById[fx.id] = fx
    order.push(fx.id)
  })
  FX_IDS.forEach((id) => { if (order.indexOf(id) < 0) order.push(id) })
  const fxFallback = {}
  d.fx.forEach((fx) => { fxFallback[fx.id] = fx })
  const mods = Array.isArray(s.mods) ? s.mods.map((m) => ({
    src: MOD_SOURCES.indexOf(m && m.src) >= 0 ? m.src : 'lfo1',
    dst: MOD_DESTS.indexOf(m && m.dst) >= 0 ? m.dst : 'f0.cutoff',
    amount: clamp(m && m.amount, -1, 1, 0.35),
    bipolar: m && m.bipolar != null ? !!m.bipolar : !(String(m && m.src || '').indexOf('env') === 0),
    curve: clamp(m && m.curve, -1, 1, 0)
  })).slice(0, 32) : []
  const meta = s.meta && typeof s.meta === 'object' ? s.meta : {}
  return {
    version: COSMIC_VERSION,
    osc: [0, 1, 2].map((i) => normOsc(oscSrc[i], d.osc[i])),
    sub: {
      on: s.sub && s.sub.on != null ? !!s.sub.on : d.sub.on,
      wave: s.sub && s.sub.wave === 'square' ? 'square' : 'sine',
      oct: clamp(s.sub && s.sub.oct, -3, -1, -1) | 0,
      level: clamp(s.sub && s.sub.level, 0, 1, d.sub.level),
      pan: clamp(s.sub && s.sub.pan, -1, 1, 0),
      dest: s.sub && (s.sub.dest === 'f1' || s.sub.dest === 'f2' || s.sub.dest === 'both' || s.sub.dest === 'dry') ? s.sub.dest : 'f1'
    },
    noise: {
      on: s.noise && s.noise.on != null ? !!s.noise.on : false,
      type: NOISE_TYPES.indexOf(s.noise && s.noise.type) >= 0 ? s.noise.type : 'white',
      level: clamp(s.noise && s.noise.level, 0, 1, d.noise.level),
      pan: clamp(s.noise && s.noise.pan, -1, 1, 0),
      dest: s.noise && (s.noise.dest === 'f1' || s.noise.dest === 'f2' || s.noise.dest === 'both' || s.noise.dest === 'dry') ? s.noise.dest : 'f1'
    },
    env: [0, 1, 2].map((i) => normEnv(envSrc[i], d.env[i])),
    lfo: [0, 1, 2].map((i) => normLfo(lfoSrc[i], d.lfo[i])),
    macros: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      name: String((macroSrc[i] && macroSrc[i].name) || d.macros[i].name).slice(0, 16),
      value: clamp(macroSrc[i] && macroSrc[i].value, 0, 1, 0)
    })),
    filters: [0, 1].map((i) => normFilt(filtSrc[i], d.filters[i])),
    filterRoute: FILTER_ROUTES.indexOf(s.filterRoute) >= 0 ? s.filterRoute : 'serial',
    fx: order.map((id) => normFxItem(id, fxById[id], fxFallback[id])),
    mods: mods,
    global: {
      poly: clamp(s.global && s.global.poly, 1, 16, d.global.poly) | 0,
      mode: PLAY_MODES.indexOf(s.global && s.global.mode) >= 0 ? s.global.mode : 'poly',
      glide: clamp(s.global && s.global.glide, 0, 2, 0),
      glideMode: s.global && s.global.glideMode === 'rate' ? 'rate' : 'time',
      bend: clamp(s.global && s.global.bend, 1, 24, 2) | 0,
      volume: clamp(s.global && s.global.volume, 0, 1.5, d.global.volume),
      tune: clamp(s.global && s.global.tune, -100, 100, 0)
    },
    meta: {
      id: String(meta.id || 'edited').slice(0, 64),
      name: String(meta.name || 'Edited').slice(0, 32),
      category: String(meta.category || 'User').slice(0, 24)
    }
  }
}

/* Modulation */

function midiHz (pitch) {
  return 440 * Math.pow(2, (pitch - 69) / 12)
}

function lfoHz (lfo, bpm) {
  if (lfo.sync) return (Math.max(20, bpm || 120) / 60) / Math.max(0.03125, lfo.beats)
  return lfo.rate
}

function lfoShape (lfo, phase, hold) {
  const p = phase < 0 ? 0 : phase > 1 ? 1 : phase
  if (lfo.shape === 'tri') return p < 0.5 ? -1 + p * 4 : 3 - p * 4
  if (lfo.shape === 'square') return p < 0.5 ? 1 : -1
  if (lfo.shape === 'saw') return p * 2 - 1
  if (lfo.shape === 'sah') return hold || 0
  if (lfo.shape === 'draw') return drawAt(lfo.points, p)
  return Math.sin(p * Math.PI * 2)
}

function drawAt (points, phase) {
  if (!points || !points.length) return Math.sin(phase * Math.PI * 2)
  if (points.length === 1) return points[0].v
  if (phase <= points[0].t) return points[0].v
  for (let i = 1; i < points.length; i++) {
    if (phase <= points[i].t) {
      const a = points[i - 1]
      const b = points[i]
      const u = (phase - a.t) / Math.max(1e-5, b.t - a.t)
      return a.v + (b.v - a.v) * curve(u, b.c || 0)
    }
  }
  return points[points.length - 1].v
}

function mapAt (points, x) {
  if (!points || points.length < 2) return 1
  return drawAt(points, clamp(x, 0, 1, 0))
}

function bipolarSource (src) {
  return src.indexOf('lfo') === 0 || src === 'note'
}

function modValue (m, sources) {
  let raw = Number(sources[m.src])
  if (!Number.isFinite(raw)) raw = 0
  const wantBi = !!m.bipolar
  const srcBi = bipolarSource(m.src)
  let v = raw
  if (srcBi && !wantBi) v = raw * 0.5 + 0.5
  else if (!srcBi && wantBi) v = raw * 2 - 1
  const uni = wantBi ? (v + 1) * 0.5 : v
  const shaped = curve(uni < 0 ? 0 : uni > 1 ? 1 : uni, m.curve || 0)
  const out = wantBi ? shaped * 2 - 1 : shaped
  return out * m.amount
}

/** Fills `out` (indexed like MOD_DESTS) with summed modulation; macro sources include their own modulation. */
function collectMods (mods, sources, macros, out) {
  out.fill(0)
  for (let m = 0; m < 8; m++) sources['macro' + (m + 1)] = macros[m].value
  if (!mods.length) return
  for (let i = 0; i < mods.length; i++) {
    const m = mods[i]
    if (m.dst.charCodeAt(0) !== 109 || m.src.charCodeAt(0) === 109) continue
    out[DST[m.dst]] += modValue(m, sources)
  }
  for (let m = 0; m < 8; m++) {
    const v = macros[m].value + out[DST['macro' + (m + 1)]]
    sources['macro' + (m + 1)] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  for (let i = 0; i < mods.length; i++) {
    const m = mods[i]
    if (m.dst.charCodeAt(0) === 109) continue
    out[DST[m.dst]] += modValue(m, sources)
  }
}

function envStep (slot, env, sr, held) {
  slot.t += 1 / sr
  if (held && slot.stage !== 'r') {
    if (slot.stage === 'a') {
      const a = Math.max(0.001, env.attack)
      const x = Math.min(1, slot.t / a)
      slot.level = curve(x, env.aCurve)
      if (x >= 1) { slot.stage = 'd'; slot.t = 0 }
    } else if (slot.stage === 'd') {
      const d = Math.max(0.001, env.decay)
      const x = Math.min(1, slot.t / d)
      slot.level = env.sustain + (1 - env.sustain) * (1 - curve(x, env.dCurve))
      if (x >= 1) { slot.stage = 's'; slot.t = 0; slot.level = env.sustain }
    } else slot.level = env.sustain
  } else {
    if (slot.stage !== 'r') { slot.stage = 'r'; slot.t = 0; slot.releaseFrom = slot.level }
    const r = Math.max(0.001, env.release)
    const x = Math.min(1, slot.t / r)
    slot.level = (slot.releaseFrom || 0) * (1 - curve(x, env.rCurve))
    if (x >= 1) slot.level = 0
  }
  return slot.level
}

/* Filters: zero-delay-feedback state-variable (12/24 dB) and a 4-pole ladder. */

const MODE = { lp: 0, hp: 1, bp: 2, notch: 3 }

function svfK (res, slope) {
  const r = Math.pow(res < 0 ? 0 : res, 0.8)
  return slope === 24 ? 0.765 * (1 - 0.94 * r) : 1.4142 * (1 - 0.97 * r)
}

function filtCoef (c, filt, cutoff, res, sr) {
  const fc = cutoff < 20 ? 20 : cutoff > sr * 0.47 ? sr * 0.47 : cutoff
  const g = Math.tan(Math.PI * fc / sr)
  c.g = g
  if (filt.type === 'ladder') {
    c.G = g / (1 + g)
    c.k = res * 3.9
    return
  }
  const kB = svfK(res, filt.slope)
  const kA = filt.slope === 24 ? 1.848 : kB
  c.kA = kA
  c.a1A = 1 / (1 + g * (g + kA)); c.a2A = g * c.a1A; c.a3A = g * c.a2A
  c.kB = kB
  c.a1B = 1 / (1 + g * (g + kB)); c.a2B = g * c.a1B; c.a3B = g * c.a2B
}

function svfStage (st, o, x, k, a1, a2, a3, mode) {
  const ic1 = st[o]
  const ic2 = st[o + 1]
  const v3 = x - ic2
  const v1 = a1 * ic1 + a2 * v3
  const v2 = ic2 + a2 * ic1 + a3 * v3
  st[o] = 2 * v1 - ic1
  st[o + 1] = 2 * v2 - ic2
  if (mode === 0) return v2
  if (mode === 1) return x - k * v1 - v2
  if (mode === 2) return k * v1
  return x - k * v1
}

function ladderRun (st, x, c, twoPole) {
  const G = c.G
  const k = c.k
  const b = 1 - G
  const G2 = G * G
  const G4 = G2 * G2
  const sig = G2 * G * b * st[0] + G2 * b * st[1] + G * b * st[2] + b * st[3]
  const y4 = (G4 * x + sig) / (1 + k * G4)
  const u = 2 * Math.tanh(0.5 * (x - k * y4))
  let v = (u - st[0]) * G
  const y1 = v + st[0]; st[0] = y1 + v
  v = (y1 - st[1]) * G
  const y2 = v + st[1]; st[1] = y2 + v
  v = (y2 - st[2]) * G
  const y3 = v + st[2]; st[2] = y3 + v
  v = (y3 - st[3]) * G
  const y4n = v + st[3]; st[3] = y4n + v
  return (twoPole ? y2 : y4n) * (1 + k * 0.35)
}

function runFilter (st, c, filt, x) {
  if (!filt.on) return x
  let y = x
  if (filt.type === 'ladder') {
    y = ladderRun(st, x * (1 + filt.drive * 8), c, filt.slope === 12)
  } else {
    if (filt.drive > 0.001) y = Math.tanh(y * (1 + filt.drive * 8))
    const mode = MODE[filt.type] || 0
    if (filt.slope === 24) y = svfStage(st, 0, y, c.kA, c.a1A, c.a2A, c.a3A, mode)
    y = svfStage(st, 2, y, c.kB, c.a1B, c.a2B, c.a3B, mode)
  }
  if (y > -1e-15 && y < 1e-15) y = 0
  return x * (1 - filt.mix) + y * filt.mix
}

/* Voices */

function panL (pan) { return Math.cos((pan + 1) * Math.PI / 4) }
function panR (pan) { return Math.sin((pan + 1) * Math.PI / 4) }

function addBus (bus, l, r, dest, route) {
  if (route === 'serial') {
    if (dest === 'dry') { bus.dryL += l; bus.dryR += r }
    else if (dest === 'f2') { bus.f2L += l; bus.f2R += r }
    else { bus.f1L += l; bus.f1R += r }
  } else if (dest === 'dry') { bus.dryL += l; bus.dryR += r }
  else {
    if (dest !== 'f2') { bus.f1L += l; bus.f1R += r }
    if (dest !== 'f1') { bus.f2L += l; bus.f2R += r }
  }
}

function noiseSample (voice, type) {
  const white = Math.random() * 2 - 1
  if (type === 'pink') {
    voice.b0 = 0.99765 * voice.b0 + white * 0.099046
    voice.b1 = 0.963 * voice.b1 + white * 0.296516
    voice.b2 = 0.57 * voice.b2 + white * 1.052691
    return (voice.b0 + voice.b1 + voice.b2 + white * 0.1848) * 0.22
  }
  if (type === 'brown') {
    voice.brown = (voice.brown + white * 0.02) * 0.98
    return voice.brown * 2.5
  }
  if (type === 'metal') {
    voice.metal = (voice.metal * 131 + 17) & 255
    const s = voice.metal / 127.5 - 1
    voice.metalLp += (s - voice.metalLp) * 0.15
    return (s - voice.metalLp) * 0.8
  }
  return white
}

/* Smoothed slots: per osc [frame, warp, pitch], then cutoff (log2) and res per filter, then amp. */
const SM_OSC = 3
const SM_CUT = 9
const SM_AMP = 13
const SM_N = 14

export function createVoice (state, pitch, velocity, sampleRate, extra) {
  const opt = extra || {}
  const sr = sampleRate || 44100
  const phases = [0, 1, 2].map((i) => {
    const osc = state.osc[i]
    const buf = new Float64Array(8)
    for (let u = 0; u < 8; u++) buf[u] = osc.randomPhase ? Math.random() : (osc.phase || 0)
    return buf
  })
  const lfoPhase = [0, 1, 2].map((i) => {
    const lfo = state.lfo[i]
    if (lfo.retrigger || lfo.mode === 'trigger' || !opt.freeLfo) return lfo.phase || 0
    return opt.freeLfo[i] || 0
  })
  return {
    pitch: pitch,
    targetPitch: pitch,
    vel: clamp(velocity, 0, 1, 0.8),
    sr: sr,
    held: true,
    age: 0,
    key: opt.key,
    trackId: opt.trackId,
    uniCap: opt.uniCap || 8,
    env: [0, 1, 2].map(() => ({ stage: 'a', t: 0, level: 0, releaseFrom: 0 })),
    envOut: new Float64Array(3),
    lfoPhase: lfoPhase,
    lfoOut: new Float64Array(3),
    lfoSm: [0, 0, 0],
    lfoHold: [0, 0, 0],
    oscPhase: phases,
    oscTmp: [0, 1, 2].map(() => ({ wave: 'saw', wt: 0, frame: 0, warp: 'off', warpAmt: 0 })),
    lvl: [0, 0, 0],
    uniTg: [0, 1, 2].map(() => new Float64Array(16)),
    uniSm: [0, 1, 2].map(() => new Float64Array(16)),
    uniRatio: [0, 1, 2].map(() => new Float64Array(8).fill(1)),
    xTg: new Float64Array(4),
    xSm: new Float64Array(4),
    tg: new Float64Array(SM_N),
    sm: new Float64Array(SM_N),
    smK: 1 - Math.exp(-1 / (SMOOTH_SEC * sr)),
    smInit: false,
    ctl: 0,
    src: {},
    modOut: new Float64Array(MOD_DESTS.length),
    subPhase: 0,
    b0: 0, b1: 0, b2: 0, brown: 0, metal: 1, metalLp: 0,
    prevOsc: [0, 0, 0],
    oscMono: [0, 0, 0],
    bus: { f1L: 0, f1R: 0, f2L: 0, f2R: 0, dryL: 0, dryR: 0 },
    fc: [{}, {}],
    fs: [0, 1].map(() => [new Float64Array(4), new Float64Array(4)]),
    kill: false,
    killGain: 1,
    dead: false
  }
}

export function releaseVoice (voice) {
  if (voice) voice.held = false
}

/** Steals a voice with a short fade instead of cutting it. */
export function killVoice (voice) {
  if (!voice) return
  voice.held = false
  voice.kill = true
}

export function retargetVoice (voice, pitch, vel, retrigger) {
  if (!voice) return
  voice.targetPitch = pitch
  voice.vel = clamp(vel, 0, 1, voice.vel)
  voice.held = true
  if (retrigger) voice.env.forEach((slot) => { slot.stage = 'a'; slot.t = 0 })
}

export function voiceFinished (voice) {
  if (!voice) return false
  if (voice.dead) return true
  if (voice.held) return false
  if (!voice.env[0] || voice.env[0].stage !== 'r') return false
  return voice.env[0].level < 0.0008 && voice.age > 0.02
}

/** Loudness used to pick which voice to steal. */
export function voiceLevel (voice) {
  return voice ? voice.env[0].level * (voice.kill ? voice.killGain : 1) : 0
}

export function advanceFree (phases, state, frames, sr, bpm) {
  const next = [phases[0] || 0, phases[1] || 0, phases[2] || 0]
  for (let i = 0; i < 3; i++) {
    const hz = lfoHz(state.lfo[i], bpm)
    next[i] = (next[i] + hz * frames / sr) % 1
  }
  return next
}

/** What the editor animates: envelope stages, LFO phases and the summed modulation per destination. */
export function voiceLive (voice) {
  if (!voice) return null
  return {
    held: !!voice.held,
    env: Array.from(voice.envOut),
    stage: voice.env.map((s) => s.stage),
    envT: voice.env.map((s) => s.t),
    lfo: voice.lfoPhase.slice(),
    lfoVal: Array.from(voice.lfoOut),
    mods: Array.from(voice.modOut),
    cutoff: [Math.pow(2, voice.sm[SM_CUT]), Math.pow(2, voice.sm[SM_CUT + 2])]
  }
}

function glide (voice, state) {
  const g = state.global.glide
  if (g <= 0.001) { voice.pitch = voice.targetPitch; return }
  const dt = 1 / voice.sr
  if (state.global.glideMode === 'rate') {
    const max = (12 / Math.max(0.05, g)) * dt
    const d = voice.targetPitch - voice.pitch
    voice.pitch += Math.max(-max, Math.min(max, d))
  } else {
    const k = 1 - Math.exp(-dt / Math.max(0.01, g))
    voice.pitch += (voice.targetPitch - voice.pitch) * k
  }
}

function control (voice, state, pfm, bendSemis) {
  const src = voice.src
  src.env1 = voice.envOut[0]; src.env2 = voice.envOut[1]; src.env3 = voice.envOut[2]
  src.lfo1 = voice.lfoOut[0]; src.lfo2 = voice.lfoOut[1]; src.lfo3 = voice.lfoOut[2]
  src.vel = voice.vel
  src.note = clamp((voice.pitch - 60) / 48, -1, 1, 0)
  src.wheel = clamp(pfm.wheel, 0, 1, 0)
  src.after = clamp(pfm.after, 0, 1, 0)
  const mo = voice.modOut
  collectMods(state.mods, src, state.macros, mo)
  const tg = voice.tg
  for (let o = 0; o < 3; o++) {
    const b = state.osc[o]
    const d = o * 5
    const level = b.on ? clamp(b.level + mo[d], 0, 1, 0) : 0
    const pan = clamp(b.pan + mo[d + 1], -1, 1, 0)
    tg[o * SM_OSC] = clamp(b.frame + mo[d + 2], 0, 1, 0)
    tg[o * SM_OSC + 1] = clamp(b.warpAmt + mo[d + 3], 0, 1, 0)
    tg[o * SM_OSC + 2] = b.oct * 12 + b.semi + b.fine / 100 + mo[d + 4] * 12
    const n = Math.max(1, Math.min(voice.uniCap, b.unison | 0))
    const norm = 1 / Math.sqrt(n)
    const ut = voice.uniTg[o]
    const ratio = voice.uniRatio[o]
    for (let u = 0; u < 8; u++) {
      if (u >= n) { ut[u * 2] = 0; ut[u * 2 + 1] = 0; continue }
      const t = n === 1 ? 0 : (u / (n - 1)) * 2 - 1
      ratio[u] = t === 0 ? 1 : Math.pow(2, t * b.detune / 1200)
      const g = (1 - Math.abs(t) * b.blend) * norm * level
      const p = clamp(pan + t * b.spread, -1, 1, 0)
      ut[u * 2] = g * panL(p)
      ut[u * 2 + 1] = g * panR(p)
    }
    const tmp = voice.oscTmp[o]
    tmp.wave = b.wave; tmp.wt = b.wt; tmp.warp = b.warp; tmp.warpAmt = tg[o * SM_OSC + 1]
    const hz = midiHz(voice.pitch + bendSemis + tg[o * SM_OSC + 2] + b.detune / 100)
    voice.lvl[o] = mipLevel(hz * warpStretch(tmp), voice.sr)
  }
  const sub = state.sub
  const subLevel = sub.on ? clamp(sub.level + mo[DST['sub.level']], 0, 1, 0) * 0.8 : 0
  voice.xTg[0] = subLevel * panL(sub.pan)
  voice.xTg[1] = subLevel * panR(sub.pan)
  const noise = state.noise
  const noiseLevel = noise.on ? clamp(noise.level + mo[DST['noise.level']], 0, 1, 0) : 0
  voice.xTg[2] = noiseLevel * panL(noise.pan)
  voice.xTg[3] = noiseLevel * panR(noise.pan)
  for (let f = 0; f < 2; f++) {
    const filt = state.filters[f]
    const base = Math.log2(filt.cutoff) + mo[DST['f' + f + '.cutoff']] * 2 + ((voice.pitch - 60) / 12) * filt.key
    tg[SM_CUT + f * 2] = base < 4.32 ? 4.32 : base > 14.4 ? 14.4 : base
    tg[SM_CUT + f * 2 + 1] = clamp(filt.res + mo[DST['f' + f + '.res']], 0, 0.97, filt.res)
  }
  tg[SM_AMP] = clamp(1 + mo[DST.amp], 0, 2, 1)
  if (!voice.smInit) {
    voice.sm.set(tg)
    for (let o = 0; o < 3; o++) voice.uniSm[o].set(voice.uniTg[o])
    voice.xSm.set(voice.xTg)
    voice.smInit = true
  }
}

const ZERO_PERF = { bend: 0, wheel: 0, after: 0 }

export function renderVoice (voice, frames, L, R, offset, state, bpm, perf) {
  const sr = voice.sr
  const pfm = perf || ZERO_PERF
  const bend = (pfm.bend || 0) * (state.global.bend || 2) + (state.global.tune || 0) / 100
  const sk = voice.smK
  const tg = voice.tg
  const sm = voice.sm
  const bus = voice.bus
  const route = state.filterRoute
  const filters = state.filters
  const killStep = 1 / (0.006 * sr)
  for (let i = 0; i < frames; i++) {
    voice.age += 1 / sr
    if (state.global.mode !== 'poly') glide(voice, state)
    else voice.pitch = voice.targetPitch
    for (let k = 0; k < 3; k++) voice.envOut[k] = envStep(voice.env[k], state.env[k], sr, voice.held)
    for (let k = 0; k < 3; k++) {
      const lfo = state.lfo[k]
      let ph = voice.lfoPhase[k] + lfoHz(lfo, bpm) / sr
      let wrapped = false
      if (lfo.mode === 'oneshot' || lfo.mode === 'trigger') ph = Math.min(1, ph)
      else if (ph >= 1) { ph = ph % 1; wrapped = true }
      voice.lfoPhase[k] = ph
      if (wrapped || (lfo.shape === 'sah' && voice.age < 2 / sr)) voice.lfoHold[k] = Math.random() * 2 - 1
      let depth = lfo.depth
      if (voice.age < lfo.delay) depth = 0
      else if (lfo.fade > 0.001) depth *= clamp((voice.age - lfo.delay) / lfo.fade, 0, 1, 0)
      if (lfo.velMap.length > 1 || lfo.noteMap.length > 1) depth *= mapAt(lfo.velMap, voice.vel) * mapAt(lfo.noteMap, voice.pitch / 127)
      const raw = lfoShape(lfo, ph, voice.lfoHold[k])
      const c = lfo.smooth <= 0.0005 ? 1 : 1 - Math.exp(-1 / (lfo.smooth * sr))
      voice.lfoSm[k] += (raw - voice.lfoSm[k]) * c
      voice.lfoOut[k] = voice.lfoSm[k] * depth
    }
    if (voice.ctl === 0) control(voice, state, pfm, bend)
    const tick = voice.ctl
    voice.ctl = (voice.ctl + 1) & CTL_MASK
    for (let k = 0; k < SM_N; k++) sm[k] += (tg[k] - sm[k]) * sk
    for (let k = 0; k < 4; k++) voice.xSm[k] += (voice.xTg[k] - voice.xSm[k]) * sk
    bus.f1L = 0; bus.f1R = 0; bus.f2L = 0; bus.f2R = 0; bus.dryL = 0; bus.dryR = 0
    const oscMono = voice.oscMono
    for (let o = 0; o < 3; o++) {
      oscMono[o] = 0
      const base = state.osc[o]
      if (!base.on) continue
      const ut = voice.uniTg[o]
      const us = voice.uniSm[o]
      const n = Math.max(1, Math.min(voice.uniCap, base.unison | 0))
      let live = false
      for (let u = 0; u < 16; u++) {
        us[u] += (ut[u] - us[u]) * sk
        if (us[u] > 1e-5) live = true
      }
      if (!live) continue
      const tmp = voice.oscTmp[o]
      tmp.frame = sm[o * SM_OSC]
      tmp.warpAmt = sm[o * SM_OSC + 1]
      const lvl = voice.lvl[o]
      const hz0 = midiHz(voice.pitch + bend + sm[o * SM_OSC + 2])
      const step0 = hz0 / sr
      const ph = voice.oscPhase[o]
      const fmSrc = base.fmFrom
      const needsFm = base.warp === 'fm' || base.warp === 'rm'
      const ratio = voice.uniRatio[o]
      let mix = 0
      for (let u = 0; u < n; u++) {
        const gl = us[u * 2]
        const gr = us[u * 2 + 1]
        if (gl + gr <= 1e-5) continue
        const fm = !needsFm ? 0 : fmSrc >= 0 ? voice.prevOsc[fmSrc] : Math.sin(ph[u] * Math.PI * 2)
        const s = waved(tmp, ph[u], fm, lvl)
        ph[u] += step0 * ratio[u]
        if (ph[u] >= 1) ph[u] -= Math.floor(ph[u])
        addBus(bus, s * gl, s * gr, base.dest, route)
        mix += s * (gl + gr) * 0.7071
      }
      oscMono[o] = mix
    }
    voice.prevOsc[0] = oscMono[0]; voice.prevOsc[1] = oscMono[1]; voice.prevOsc[2] = oscMono[2]
    const xs = voice.xSm
    if (xs[0] + xs[1] > 1e-5) {
      const hz = midiHz(voice.pitch + bend + state.sub.oct * 12)
      const s = state.sub.wave === 'square' ? basicWave('square', voice.subPhase, mipLevel(hz, sr)) : Math.sin(voice.subPhase * Math.PI * 2)
      voice.subPhase += hz / sr
      if (voice.subPhase >= 1) voice.subPhase -= Math.floor(voice.subPhase)
      addBus(bus, s * xs[0], s * xs[1], state.sub.dest, route)
    }
    if (xs[2] + xs[3] > 1e-5) {
      const s = noiseSample(voice, state.noise.type)
      addBus(bus, s * xs[2], s * xs[3], state.noise.dest, route)
    }
    if ((tick & 3) === 0) {
      filtCoef(voice.fc[0], filters[0], Math.pow(2, sm[SM_CUT]), sm[SM_CUT + 1], sr)
      filtCoef(voice.fc[1], filters[1], Math.pow(2, sm[SM_CUT + 2]), sm[SM_CUT + 3], sr)
    }
    const fs0 = voice.fs[0]
    const fs1 = voice.fs[1]
    let l
    let r
    if (route === 'parallel') {
      l = runFilter(fs0[0], voice.fc[0], filters[0], bus.f1L) + runFilter(fs1[0], voice.fc[1], filters[1], bus.f2L)
      r = runFilter(fs0[1], voice.fc[0], filters[0], bus.f1R) + runFilter(fs1[1], voice.fc[1], filters[1], bus.f2R)
    } else {
      l = runFilter(fs1[0], voice.fc[1], filters[1], runFilter(fs0[0], voice.fc[0], filters[0], bus.f1L) + bus.f2L)
      r = runFilter(fs1[1], voice.fc[1], filters[1], runFilter(fs0[1], voice.fc[0], filters[0], bus.f1R) + bus.f2R)
    }
    l += bus.dryL
    r += bus.dryR
    let amp = voice.envOut[0] * voice.vel * state.global.volume * sm[SM_AMP]
    if (voice.kill) {
      voice.killGain -= killStep
      if (voice.killGain <= 0) { voice.killGain = 0; voice.dead = true }
      amp *= voice.killGain
    }
    const at = offset + i
    L[at] += l * amp * 0.28
    R[at] += r * amp * 0.28
  }
}

/* Effects */

function readDelay (buf, write, delay) {
  let p = write - delay
  const len = buf.length
  while (p < 0) p += len
  const i = p | 0
  const f = p - i
  const a = buf[i % len]
  const b = buf[(i + 1) % len]
  return a + (b - a) * f
}

export function createFx (sr) {
  const rate = sr || 44100
  const combAt = (sec) => ({ L: new Float32Array(Math.max(8, Math.floor(sec * rate))), R: new Float32Array(Math.max(8, Math.floor(sec * rate))), i: 0, fL: 0, fR: 0 })
  return {
    sr: rate,
    dL: new Float32Array(Math.ceil(rate * 2)),
    dR: new Float32Array(Math.ceil(rate * 2)),
    di: 0,
    chL: new Float32Array(Math.ceil(rate * 0.05)),
    chR: new Float32Array(Math.ceil(rate * 0.05)),
    ci: 0,
    flL: new Float32Array(Math.ceil(rate * 0.02)),
    flR: new Float32Array(Math.ceil(rate * 0.02)),
    fi: 0,
    comb: [combAt(0.029), combAt(0.033), combAt(0.037), combAt(0.041)],
    ap: [0, 1].map((i) => ({
      L: new Float32Array(Math.floor((0.005 + i * 0.003) * rate)),
      R: new Float32Array(Math.floor((0.006 + i * 0.0027) * rate)),
      iL: 0,
      iR: 0
    })),
    lpA: 0,
    lpB: 0,
    eqA: 0,
    eqB: 0,
    compA: 0,
    compB: 0,
    env: [0, 0, 0],
    ph: 0,
    chPh: 0,
    flPh: 0,
    mixSm: {},
    smK: 1 - Math.exp(-1 / (SMOOTH_SEC * rate))
  }
}

function soft (x) {
  if (x > 1.4) return 1.4
  if (x < -1.4) return -1.4
  return Math.tanh(x)
}

const WET = [0, 0]

function mixWet (dryL, dryR, wetL, wetR, mix) {
  WET[0] = dryL * (1 - mix) + wetL * mix
  WET[1] = dryR * (1 - mix) + wetR * mix
  return WET
}

function apOnce (buf, idxKey, state, x) {
  const i = state[idxKey]
  const delayed = buf[i]
  const y = delayed - 0.6 * x
  buf[i] = x + delayed * 0.6
  state[idxKey] = (i + 1) % buf.length
  return y
}

function blockFxMod (state, freeLfo, perf) {
  const sources = {
    env1: 0, env2: 0, env3: 0, vel: 0, note: 0,
    wheel: perf && perf.wheel || 0,
    after: perf && perf.after || 0
  }
  for (let i = 0; i < 3; i++) {
    const lfo = state.lfo[i]
    const ph = freeLfo ? (freeLfo[i] || 0) : 0
    sources['lfo' + (i + 1)] = lfoShape(lfo, ph, 0) * lfo.depth
  }
  const out = new Float64Array(MOD_DESTS.length)
  collectMods(state.mods, sources, state.macros, out)
  return out
}

function stepFx (fx, item, l, r, mix, sr, bpm) {
  if (item.id === 'distortion') {
    const g = 1 + (item.drive || 0) * 14
    return mixWet(l, r, Math.tanh(l * g), Math.tanh(r * g), mix)
  }
  if (item.id === 'eq') {
    const a = 1 - Math.exp(-2 * Math.PI * 220 / sr)
    const b = 1 - Math.exp(-2 * Math.PI * 2200 / sr)
    fx.eqA += (l - fx.eqA) * a
    fx.eqB += (l - fx.eqB) * b
    const low = fx.eqA
    const high = l - fx.eqB
    const mid = l - low - high
    const gl = Math.pow(10, (item.low || 0) / 20)
    const gm = Math.pow(10, (item.mid || 0) / 20)
    const gh = Math.pow(10, (item.high || 0) / 20)
    const wetL = low * gl + mid * gm + high * gh
    fx._er = (fx._er || 0) + (r - (fx._er || 0)) * a
    const wetR = wetL + (r - l) * 0.5
    return mixWet(l, r, wetL, wetR + (fx._er - wetR) * 0.15, mix)
  }
  if (item.id === 'compressor') {
    const aa = 1 - Math.exp(-2 * Math.PI * 180 / sr)
    const bb = 1 - Math.exp(-2 * Math.PI * 2400 / sr)
    fx.compA += (l - fx.compA) * aa
    fx.compB += (l - fx.compB) * bb
    const b0 = fx.compA
    const b2 = l - fx.compB
    const b1 = l - b0 - b2
    let wet = 0
    for (let b = 0; b < 3; b++) {
      const band = b === 0 ? b0 : b === 1 ? b1 : b2
      const gain = b === 0 ? (item.low || 1) : b === 2 ? (item.high || 1) : 1
      const ax = Math.abs(band)
      const k = ax > fx.env[b] ? item.attack : item.release
      fx.env[b] += (ax - fx.env[b]) * (1 - Math.exp(-1 / (Math.max(0.001, k) * sr)))
      const e = fx.env[b]
      const over = e > item.threshold ? item.threshold + (e - item.threshold) / item.ratio : e
      const g = e > 0.0001 ? over / e : 1
      wet += band * g * gain
    }
    return mixWet(l, r, wet, wet + (r - l) * 0.85, mix)
  }
  if (item.id === 'chorus') {
    fx.chPh += (item.rate || 0.3) / sr
    if (fx.chPh >= 1) fx.chPh -= 1
    const d1 = (0.008 + 0.004 * item.depth * (0.5 + 0.5 * Math.sin(fx.chPh * Math.PI * 2))) * sr
    const d2 = (0.012 + 0.005 * item.depth * (0.5 + 0.5 * Math.sin(fx.chPh * Math.PI * 2 + 1.7))) * sr
    const wL = readDelay(fx.chL, fx.ci, d1)
    const wR = readDelay(fx.chR, fx.ci, d2)
    fx.chL[fx.ci] = l
    fx.chR[fx.ci] = r
    fx.ci = (fx.ci + 1) % fx.chL.length
    return mixWet(l, r, wL, wR, mix)
  }
  if (item.id === 'flanger') {
    fx.flPh += (item.rate || 0.2) / sr
    if (fx.flPh >= 1) fx.flPh -= 1
    const d = (0.0008 + 0.004 * (item.depth || 0.5) * (0.5 + 0.5 * Math.sin(fx.flPh * Math.PI * 2))) * sr
    const wL = readDelay(fx.flL, fx.fi, d)
    const wR = readDelay(fx.flR, fx.fi, d)
    const fb = item.feedback || 0
    fx.flL[fx.fi] = l + wL * fb
    fx.flR[fx.fi] = r + wR * fb
    fx.fi = (fx.fi + 1) % fx.flL.length
    return mixWet(l, r, l + wL, r + wR, mix)
  }
  if (item.id === 'phaser') {
    fx.ph += (item.rate || 0.15) / sr
    if (fx.ph >= 1) fx.ph -= 1
    const a = 0.15 + 0.75 * (item.depth || 0.5) * (0.5 + 0.5 * Math.sin(fx.ph * Math.PI * 2))
    let yl = l
    let yr = r
    if (!fx.phP) fx.phP = [0, 1, 2, 3].map(() => ({ l: 0, r: 0 }))
    for (let s = 0; s < 4; s++) {
      const st = fx.phP[s]
      const nl = -a * yl + st.l
      st.l = yl + a * nl
      yl = nl
      const nr = -a * yr + st.r
      st.r = yr + a * nr
      yr = nr
    }
    const fb = item.feedback || 0
    return mixWet(l, r, l + yl * (1 + fb), r + yr * (1 + fb), mix)
  }
  if (item.id === 'delay') {
    const time = item.sync ? (Math.max(0.03125, item.beats) * 60 / Math.max(20, bpm || 120)) : item.time
    const delayed = readDelay(fx.dL, fx.di, Math.max(1, time * sr))
    const delayedR = readDelay(fx.dR, fx.di, Math.max(1, time * sr))
    fx.dL[fx.di] = l + delayed * (item.feedback || 0)
    fx.dR[fx.di] = r + delayedR * (item.feedback || 0)
    fx.di = (fx.di + 1) % fx.dL.length
    return mixWet(l, r, delayed, delayedR, mix)
  }
  if (item.id === 'reverb') {
    const fb = 0.42 + (item.size || 0.5) * 0.4
    const damp = 0.25 + (item.damp || 0.4) * 0.65
    let sl = 0
    let sr2 = 0
    for (let c = 0; c < fx.comb.length; c++) {
      const comb = fx.comb[c]
      const il = comb.i
      comb.fL = comb.L[il] * (1 - damp) + comb.fL * damp
      comb.fR = comb.R[il] * (1 - damp) + comb.fR * damp
      comb.L[il] = l * 0.4 + comb.fL * fb
      comb.R[il] = r * 0.4 + comb.fR * fb
      comb.i = (il + 1) % comb.L.length
      sl += comb.fL
      sr2 += comb.fR
    }
    sl *= 0.28
    sr2 *= 0.28
    for (let a = 0; a < fx.ap.length; a++) {
      sl = apOnce(fx.ap[a].L, 'iL', fx.ap[a], sl)
      sr2 = apOnce(fx.ap[a].R, 'iR', fx.ap[a], sr2)
    }
    return mixWet(l, r, sl, sr2, mix)
  }
  WET[0] = l
  WET[1] = r
  return WET
}

export function applyFx (fx, L, R, n, state, sr, bpm, perf, freeLfo) {
  if (!fx || !state || !L) return
  const rate = sr || fx.sr
  const mods = blockFxMod(state, freeLfo, perf)
  const list = state.fx || []
  const sk = fx.smK
  const targets = []
  for (let k = 0; k < list.length; k++) {
    const item = list[k]
    const mix = item.on ? clamp(item.mix + mods[DST['fx.' + item.id]], 0, 1, item.mix) : 0
    targets.push(mix)
    if (fx.mixSm[item.id] == null) fx.mixSm[item.id] = mix
  }
  for (let i = 0; i < n; i++) {
    let l = L[i]
    let r = R ? R[i] : l
    for (let k = 0; k < list.length; k++) {
      const item = list[k]
      let m = fx.mixSm[item.id]
      m += (targets[k] - m) * sk
      fx.mixSm[item.id] = m
      if (m <= 0.0005 && targets[k] <= 0.0005) continue
      const wet = stepFx(fx, item, l, r, m, rate, bpm)
      l = wet[0]
      r = wet[1]
    }
    L[i] = soft(l)
    if (R) R[i] = soft(r)
  }
}

/* Editor graphs */

export function oscCurve (osc, n) {
  const out = new Float32Array(n)
  const tmp = { wave: osc.wave, wt: osc.wt, frame: osc.frame, warp: osc.warp, warpAmt: osc.warpAmt }
  for (let i = 0; i < n; i++) {
    const p = i / n
    out[i] = waved(tmp, p, Math.sin(p * Math.PI * 2), 2)
  }
  return out
}

/** Envelope shape plus the time (seconds) each segment ends at, so the editor can place handles. */
export function envCurve (env, n) {
  const a = Math.max(0.001, env.attack)
  const d = Math.max(0.001, env.decay)
  const r = Math.max(0.001, env.release)
  const hold = envHold(env)
  const total = a + d + hold + r
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = (i / Math.max(1, n - 1)) * total
    let y
    if (t < a) y = curve(t / a, env.aCurve)
    else if (t < a + d) y = env.sustain + (1 - env.sustain) * (1 - curve((t - a) / d, env.dCurve))
    else if (t < a + d + hold) y = env.sustain
    else y = env.sustain * (1 - curve((t - a - d - hold) / r, env.rCurve))
    out[i] = y
  }
  return out
}

export function envHold (env) {
  return Math.max(0.12, Math.min(0.45, Math.max(0.001, env.attack) + Math.max(0.001, env.decay)))
}

export function lfoCurve (lfo, n) {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = lfoShape(lfo, i / n, (i / n) < 0.5 ? -0.6 : 0.8)
  return out
}

function svfMag (mode, w, k) {
  const dr = 1 - w * w
  const di = k * w
  const den = dr * dr + di * di
  let num
  if (mode === 1) num = w * w * w * w
  else if (mode === 2) num = di * di
  else if (mode === 3) num = dr * dr
  else num = 1
  return Math.sqrt(num / Math.max(1e-12, den))
}

/** Magnitude response sampled on a log axis from 20 Hz to 20 kHz; matches the voice filters. */
export function filterCurve (filt, n, sr) {
  const rate = sr || 44100
  const fc = Math.min(rate * 0.47, Math.max(20, filt.cutoff))
  const wc = Math.tan(Math.PI * fc / rate)
  const res = clamp(filt.res, 0, 0.97, 0)
  const out = new Float32Array(n)
  const mode = MODE[filt.type] || 0
  const kB = svfK(res, filt.slope)
  const kl = res * 3.9
  for (let i = 0; i < n; i++) {
    const f = Math.min(rate * 0.4999, 20 * Math.pow(1000, i / Math.max(1, n - 1)))
    const w = Math.tan(Math.PI * f / rate) / wc
    let m
    if (filt.type === 'ladder') {
      const ph = -Math.atan(w)
      const mag1 = 1 / Math.sqrt(1 + w * w)
      const m4 = mag1 * mag1 * mag1 * mag1
      const g4r = m4 * Math.cos(4 * ph)
      const g4i = m4 * Math.sin(4 * ph)
      const dr = 1 + kl * g4r
      const di = kl * g4i
      const num = filt.slope === 12 ? mag1 * mag1 : m4
      m = num / Math.sqrt(dr * dr + di * di) * (1 + kl * 0.35)
    } else {
      m = svfMag(mode, w, kB)
      if (filt.slope === 24) m *= svfMag(mode, w, 1.848)
    }
    out[i] = m
  }
  return out
}
