import { renderCosmicNote } from './voice.js'
import {
  createVoice,
  defaultCosmicState,
  FILTER_TYPES,
  mipLevel,
  normalizeCosmicState,
  renderVoice
} from './dsp.js'
import { COSMIC_PRESETS } from './presets.js'
import { COSMIC_PLUGIN_ID, upgradeCosmicTrack } from '../../model/m-orchestra-ui.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

function peakOf (out) {
  let peak = 0
  for (let i = 0; i < out.L.length; i++) peak = Math.max(peak, Math.abs(out.L[i]), Math.abs(out.R[i]))
  return peak
}

{
  const out = renderCosmicNote({ pitch: 60, velocity: 0.9, gateSec: 0.2, sampleRate: 22050 })
  assert(peakOf(out) > 0.02, 'a Cosmic note produces audible samples')
  assert(out.duration > 0.2, 'render includes the release tail')
}

{
  const base = defaultCosmicState()
  const silent = normalizeCosmicState({
    ...base,
    osc: base.osc.map((osc) => ({ ...osc, level: 0, on: false })),
    sub: { ...base.sub, on: false },
    noise: { ...base.noise, on: false },
    fx: base.fx.map((fx) => ({ ...fx, on: false, mix: 0 }))
  })
  const out = renderCosmicNote({ pitch: 64, velocity: 1, state: silent, gateSec: 0.1, sampleRate: 8000 })
  assert(peakOf(out) < 0.0001, 'zeroed oscillators stay silent')
}

{
  assert(COSMIC_PRESETS.length >= 16, 'factory bank has at least 16 presets')
  const categories = new Set(COSMIC_PRESETS.map((preset) => preset.category))
  assert(categories.has('Pad') && categories.has('Bass') && categories.has('Lead'), 'presets are categorised')
  const first = normalizeCosmicState(COSMIC_PRESETS[0].state)
  assert(first.osc.length === 3 && first.env.length === 3 && first.lfo.length === 3, 'a preset keeps three oscs, envs and lfos')
  assert(first.macros.length === 8, 'eight macros survive normalize')
  assert(first.version === 2, 'normalize stamps Cosmic 2 version')
  assert(FILTER_TYPES.includes('ladder'), 'ladder filter is available')
}

{
  const base = defaultCosmicState()
  const a = renderCosmicNote({
    pitch: 60, velocity: 0.9, gateSec: 0.15, sampleRate: 16000,
    state: { ...base, osc: [{ ...base.osc[0], wave: 'wt', wt: 0, frame: 0, level: 1 }, { ...base.osc[1], level: 0 }, { ...base.osc[2], level: 0 }] }
  })
  const b = renderCosmicNote({
    pitch: 60, velocity: 0.9, gateSec: 0.15, sampleRate: 16000,
    state: { ...base, osc: [{ ...base.osc[0], wave: 'wt', wt: 0, frame: 1, level: 1 }, { ...base.osc[1], level: 0 }, { ...base.osc[2], level: 0 }] }
  })
  let diff = 0
  const n = Math.min(a.L.length, b.L.length)
  for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(a.L[i] - b.L[i]))
  assert(diff > 0.001, 'wavetable frame position changes timbre')
}

{
  const base = defaultCosmicState()
  const plain = renderCosmicNote({
    pitch: 60, velocity: 0.9, gateSec: 0.12, sampleRate: 16000,
    state: { ...base, osc: [{ ...base.osc[0], warp: 'bend', warpAmt: 0, level: 1 }, { ...base.osc[1], level: 0 }, { ...base.osc[2], level: 0 }] }
  })
  const bent = renderCosmicNote({
    pitch: 60, velocity: 0.9, gateSec: 0.12, sampleRate: 16000,
    state: { ...base, osc: [{ ...base.osc[0], warp: 'bend', warpAmt: 1, level: 1 }, { ...base.osc[1], level: 0 }, { ...base.osc[2], level: 0 }] }
  })
  let diff = 0
  const n = Math.min(plain.L.length, bent.L.length)
  for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(plain.L[i] - bent.L[i]))
  assert(diff > 0.01, 'warp bend changes the oscillator')
}

{
  const base = defaultCosmicState()
  const lp = renderCosmicNote({
    pitch: 72, velocity: 0.9, gateSec: 0.12, sampleRate: 16000,
    state: { ...base, filters: [{ ...base.filters[0], type: 'lp', cutoff: 400, mix: 1 }, { ...base.filters[1], on: false, mix: 0 }] }
  })
  const hp = renderCosmicNote({
    pitch: 72, velocity: 0.9, gateSec: 0.12, sampleRate: 16000,
    state: { ...base, filters: [{ ...base.filters[0], type: 'hp', cutoff: 4000, mix: 1 }, { ...base.filters[1], on: false, mix: 0 }] }
  })
  let diff = 0
  const n = Math.min(lp.L.length, hp.L.length)
  for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(lp.L[i] - hp.L[i]))
  assert(diff > 0.01, 'highpass differs from lowpass')
}

{
  const base = defaultCosmicState()
  const dry = normalizeCosmicState({ ...base, fx: base.fx.map((fx) => ({ ...fx, on: false, mix: 0 })) })
  const wet = normalizeCosmicState({
    ...base,
    fx: base.fx.map((fx) => fx.id === 'reverb' ? { ...fx, on: true, mix: 0.9, size: 0.85 } : { ...fx, on: false, mix: 0 })
  })
  const a = renderCosmicNote({ pitch: 60, velocity: 0.9, state: dry, gateSec: 0.08, sampleRate: 16000 })
  const b = renderCosmicNote({ pitch: 60, velocity: 0.9, state: wet, gateSec: 0.08, sampleRate: 16000 })
  let late = 0
  const start = Math.floor(Math.min(a.L.length, b.L.length) * 0.72)
  for (let i = start; i < Math.min(a.L.length, b.L.length); i++) late = Math.max(late, Math.abs(b.L[i] - a.L[i]))
  assert(late > 0.0005, 'reverb changes the tail')
}

{
  const base = defaultCosmicState()
  const wide = renderCosmicNote({
    pitch: 60, velocity: 0.9, gateSec: 0.1, sampleRate: 16000,
    state: {
      ...base,
      osc: [{ ...base.osc[0], unison: 4, detune: 30, spread: 1, blend: 0, level: 1 }, { ...base.osc[1], level: 0 }, { ...base.osc[2], level: 0 }],
      fx: base.fx.map((fx) => ({ ...fx, on: false }))
    }
  })
  let side = 0
  for (let i = 0; i < wide.L.length; i++) side = Math.max(side, Math.abs(wide.L[i] - wide.R[i]))
  assert(side > 0.005, 'unison spread makes a stereo image')
}

{
  const messy = normalizeCosmicState({ global: { poly: 99, mode: 'nope', bend: 0 }, mods: [{ src: 'nope', dst: 'nope', amount: 8 }] })
  assert(messy.global.poly === 16, 'polyphony clamps to 16')
  assert(messy.global.mode === 'poly', 'unknown play mode falls back to poly')
  assert(Math.abs(messy.mods[0].amount) <= 1, 'mod amount clamps')
}

{
  const v1 = defaultCosmicState()
  delete v1.version
  v1.filters[0].type = 'lp'
  const migrated = normalizeCosmicState(v1)
  assert(migrated.version === 2, 'Cosmic 1 state migrates to version 2')
  assert(migrated.osc[0].wave === v1.osc[0].wave, 'migration keeps oscillator wave')
  const track = upgradeCosmicTrack({ definitionId: 'cosmic-1', instrument: 'Cosmic 1', source: 'cosmic' })
  assert(track.definitionId === COSMIC_PLUGIN_ID && track.instrument === 'Cosmic 2', 'cosmic-1 tracks upgrade to cosmic-2')
}

{
  assert(mipLevel(80, 44100) < mipLevel(4000, 44100), 'higher fundamentals pick darker mip levels')
  const base = defaultCosmicState()
  const bright = normalizeCosmicState({
    ...base,
    osc: [{ ...base.osc[0], wave: 'saw', level: 1, unison: 1, warp: 'off', warpAmt: 0 }, { ...base.osc[1], on: false, level: 0 }, { ...base.osc[2], on: false, level: 0 }],
    filters: [{ ...base.filters[0], on: false, mix: 0 }, { ...base.filters[1], on: false, mix: 0 }],
    fx: base.fx.map((fx) => ({ ...fx, on: false, mix: 0 })),
    env: [{ ...base.env[0], attack: 0.001, decay: 0.001, sustain: 1, release: 0.08 }, base.env[1], base.env[2]],
    global: { ...base.global, volume: 1 }
  })
  const sr = 22050
  const out = renderCosmicNote({ pitch: 96, velocity: 1, state: bright, gateSec: 0.08, sampleRate: sr })
  let blJump = 0
  const start = Math.floor(sr * 0.01)
  const end = Math.min(out.L.length - 1, Math.floor(sr * 0.05))
  for (let i = start; i < end; i++) blJump = Math.max(blJump, Math.abs(out.L[i] - out.L[i - 1]))
  const hz = 440 * Math.pow(2, (96 - 69) / 12)
  let naiveJump = 0
  let phase = 0
  for (let i = 0; i < end - start; i++) {
    const a = phase * 2 - 1
    phase += hz / sr
    if (phase >= 1) phase -= 1
    const b = phase * 2 - 1
    naiveJump = Math.max(naiveJump, Math.abs(b - a))
  }
  assert(blJump < naiveJump * 0.7, 'band-limited saw jumps less than a naive algebraic saw')
}

{
  const base = defaultCosmicState()
  const state = normalizeCosmicState({
    ...base,
    osc: [{ ...base.osc[0], wave: 'sine', level: 1, unison: 1 }, { ...base.osc[1], on: false, level: 0 }, { ...base.osc[2], on: false, level: 0 }],
    filters: [{ ...base.filters[0], on: true, type: 'lp', cutoff: 800, mix: 1 }, { ...base.filters[1], on: false, mix: 0 }],
    fx: base.fx.map((fx) => ({ ...fx, on: false, mix: 0 })),
    env: [{ ...base.env[0], attack: 0.001, decay: 0.001, sustain: 1, release: 0.05 }, base.env[1], base.env[2]]
  })
  const sr = 22050
  const voice = createVoice(state, 60, 1, sr, { uniCap: 1 })
  const L = new Float32Array(sr)
  const R = new Float32Array(sr)
  renderVoice(voice, 2048, L, R, 0, state, 120, { bend: 0, wheel: 0, after: 0 })
  state.filters[0].cutoff = 6000
  renderVoice(voice, 2048, L, R, 2048, state, 120, { bend: 0, wheel: 0, after: 0 })
  let peakStep = 0
  for (let i = 2040; i < 2200; i++) peakStep = Math.max(peakStep, Math.abs(L[i] - L[i - 1]))
  assert(peakStep < 0.35, 'a large cutoff step does not click')
}

{
  const base = defaultCosmicState()
  const ladder = renderCosmicNote({
    pitch: 48, velocity: 0.9, gateSec: 0.12, sampleRate: 16000,
    state: {
      ...base,
      filters: [{ ...base.filters[0], type: 'ladder', cutoff: 600, res: 0.55, drive: 0.3, mix: 1 }, { ...base.filters[1], on: false, mix: 0 }]
    }
  })
  assert(peakOf(ladder) > 0.01, 'ladder filter still produces audio')
}

console.log('cosmic ok')
