export const TWIN_PLUGIN_ID = 'twin'
export const WAVES = ['saw', 'square', 'tri', 'sine', 'noise', 'wt0', 'wt1', 'wt2', 'wt3', 'wt4', 'wt5', 'wt6', 'wt7']
export const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass']
export const FILTER_ROUTES = ['serial', 'parallel']
export const MOD_SOURCES = ['env1', 'env2', 'lfo1', 'lfo2', 'vel']
export const MOD_DESTS = ['cutoff', 'res', 'osc1Level', 'osc2Level', 'osc3Level', 'osc1Detune', 'pan', 'amp']

const WT_RECIPES = [
  [[1, 1]],
  Array.from({ length: 16 }, (_, i) => [i + 1, 1 / (i + 1)]),
  Array.from({ length: 8 }, (_, i) => [i * 2 + 1, 1 / (i * 2 + 1)]),
  Array.from({ length: 8 }, (_, i) => [i * 2 + 1, 1 / ((i * 2 + 1) * (i * 2 + 1))]),
  [[1, 1], [2, 0.7], [3, 0.45], [4, 0.25]],
  [[1, 1], [2, 0.55], [3, 0.35], [4, 0.22], [5, 0.14]],
  [[1, 1], [2, 0.4], [3, 0.32], [4, 0.2], [5, 0.14], [6, 0.1]],
  [[1, 1], [3, 0.55], [5, 0.35], [7, 0.18], [9, 0.12]]
]

export function buildWavetable (index, size = 2048) {
  const recipe = WT_RECIPES[Math.max(0, Math.min(WT_RECIPES.length - 1, index | 0))] || WT_RECIPES[0]
  const table = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const ph = i / size
    let s = 0
    recipe.forEach(([n, a]) => { s += a * Math.sin(ph * n * Math.PI * 2) })
    table[i] = s
  }
  let peak = 0.0001
  for (let i = 0; i < size; i++) peak = Math.max(peak, Math.abs(table[i]))
  const g = 0.89 / peak
  for (let i = 0; i < size; i++) table[i] *= g
  return table
}

export const WAVETABLES = WT_RECIPES.map((_, i) => buildWavetable(i))

function osc (wave, extra = {}) {
  return {
    wave,
    unison: extra.unison == null ? 1 : extra.unison,
    detune: extra.detune == null ? 12 : extra.detune,
    phase: extra.phase || 0,
    level: extra.level == null ? 0.7 : extra.level,
    pan: extra.pan || 0,
    wt: extra.wt || 0
  }
}

function env (a, d, s, r) {
  return { attack: a, decay: d, sustain: s, release: r }
}

function lfo (rate, extra = {}) {
  return { rate, amount: extra.amount == null ? 0 : extra.amount, sync: !!extra.sync, shape: extra.shape || 'sine' }
}

export function defaultTwinState () {
  return {
    osc1: osc('saw', { level: 0.72, unison: 2, detune: 8 }),
    osc2: osc('square', { level: 0.35, detune: 4, pan: 0.2 }),
    osc3: osc('sine', { level: 0.12 }),
    filter1: { type: 'lowpass', cutoff: 4200, res: 0.22, drive: 0 },
    filter2: { type: 'lowpass', cutoff: 12000, res: 0.05, drive: 0 },
    filterRoute: 'serial',
    env1: env(0.01, 0.18, 0.7, 0.22),
    env2: env(0.08, 0.3, 0.5, 0.35),
    lfo1: lfo(4.2, { amount: 0.12 }),
    lfo2: lfo(0.35, { amount: 0, sync: true }),
    glide: 0,
    voices: 8,
    gain: 0.7,
    chorus: 0.12,
    delay: 0.08,
    reverb: 0.1,
    mods: []
  }
}

function clamp (n, min, max, fallback) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

function normOsc (src, fallback) {
  const s = src && typeof src === 'object' ? src : {}
  const wave = WAVES.includes(s.wave) ? s.wave : fallback.wave
  return {
    wave,
    unison: clamp(s.unison, 1, 8, fallback.unison),
    detune: clamp(s.detune, 0, 100, fallback.detune),
    phase: clamp(s.phase, 0, 1, fallback.phase),
    level: clamp(s.level, 0, 1, fallback.level),
    pan: clamp(s.pan, -1, 1, fallback.pan),
    wt: clamp(s.wt, 0, 7, fallback.wt) | 0
  }
}

function normFilt (src, fallback) {
  const s = src && typeof src === 'object' ? src : {}
  return {
    type: FILTER_TYPES.includes(s.type) ? s.type : fallback.type,
    cutoff: clamp(s.cutoff, 40, 18000, fallback.cutoff),
    res: clamp(s.res, 0, 0.95, fallback.res),
    drive: clamp(s.drive, 0, 12, fallback.drive)
  }
}

function normEnv (src, fallback) {
  const s = src && typeof src === 'object' ? src : {}
  return {
    attack: clamp(s.attack, 0.001, 4, fallback.attack),
    decay: clamp(s.decay, 0.01, 6, fallback.decay),
    sustain: clamp(s.sustain, 0, 1, fallback.sustain),
    release: clamp(s.release, 0.01, 8, fallback.release)
  }
}

function normLfo (src, fallback) {
  const s = src && typeof src === 'object' ? src : {}
  return {
    rate: clamp(s.rate, 0.02, 32, fallback.rate),
    amount: clamp(s.amount, 0, 1, fallback.amount),
    sync: !!s.sync,
    shape: s.shape === 'square' || s.shape === 'saw' ? s.shape : 'sine'
  }
}

export function normalizeTwinState (state) {
  const d = defaultTwinState()
  const s = state && typeof state === 'object' ? state : {}
  const mods = Array.isArray(s.mods) ? s.mods.map((m) => ({
    src: MOD_SOURCES.includes(m.src) ? m.src : 'lfo1',
    dst: MOD_DESTS.includes(m.dst) ? m.dst : 'cutoff',
    amount: clamp(m.amount, -1, 1, 0.25)
  })).slice(0, 12) : []
  return {
    osc1: normOsc(s.osc1, d.osc1),
    osc2: normOsc(s.osc2, d.osc2),
    osc3: normOsc(s.osc3, d.osc3),
    filter1: normFilt(s.filter1, d.filter1),
    filter2: normFilt(s.filter2, d.filter2),
    filterRoute: FILTER_ROUTES.includes(s.filterRoute) ? s.filterRoute : d.filterRoute,
    env1: normEnv(s.env1, d.env1),
    env2: normEnv(s.env2, d.env2),
    lfo1: normLfo(s.lfo1, d.lfo1),
    lfo2: normLfo(s.lfo2, d.lfo2),
    glide: clamp(s.glide, 0, 0.6, d.glide),
    voices: clamp(s.voices, 1, 16, d.voices) | 0,
    gain: clamp(s.gain, 0, 1.5, d.gain),
    chorus: clamp(s.chorus, 0, 1, d.chorus),
    delay: clamp(s.delay, 0, 1, d.delay),
    reverb: clamp(s.reverb, 0, 1, d.reverb),
    mods
  }
}
