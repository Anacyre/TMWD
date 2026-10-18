import { renderTwinNote } from './voice.js'
import { normalizeTwinState, defaultTwinState } from './params.js'
import { TWIN_PRESETS } from './presets.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

{
  const out = renderTwinNote({ pitch: 60, velocity: 0.9, gateSec: 0.2, sampleRate: 22050 })
  let peak = 0
  for (let i = 0; i < out.L.length; i++) peak = Math.max(peak, Math.abs(out.L[i]), Math.abs(out.R[i]))
  assert(peak > 0.02, 'a Twin note produces audible samples')
  assert(out.duration > 0.2, 'render includes the release tail')
}

{
  const silent = { ...defaultTwinState(), osc1: { ...defaultTwinState().osc1, level: 0 }, osc2: { ...defaultTwinState().osc2, level: 0 }, osc3: { ...defaultTwinState().osc3, level: 0 } }
  const out = renderTwinNote({ pitch: 64, velocity: 1, state: silent, gateSec: 0.1, sampleRate: 8000 })
  let peak = 0
  for (let i = 0; i < out.L.length; i++) peak = Math.max(peak, Math.abs(out.L[i]))
  assert(peak < 0.0001, 'zeroed oscillators stay silent')
}

{
  assert(TWIN_PRESETS.length >= 24, 'factory bank has at least 24 presets')
  const first = normalizeTwinState(TWIN_PRESETS[0].state)
  assert(first.osc1.wave && first.filter1.cutoff > 0, 'presets normalize into a playable patch')
}

{
  // FX chain must actually affect the rendered signal.
  const base = defaultTwinState()
  const dry = renderTwinNote({ pitch: 60, velocity: 0.9, state: { ...base, reverb: 0, delay: 0, chorus: 0 }, gateSec: 0.2, sampleRate: 22050 })
  const wet = renderTwinNote({ pitch: 60, velocity: 0.9, state: { ...base, reverb: 0.9, delay: 0.8, chorus: 0.6 }, gateSec: 0.2, sampleRate: 22050 })
  let diff = 0
  const n = Math.min(dry.L.length, wet.L.length)
  for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(dry.L[i] - wet.L[i]))
  assert(diff > 0.005, 'FX chain (reverb/delay/chorus) audibly changes output')
}

{
  // Continuous wavetable morph must change timbre.
  const base = defaultTwinState()
  const a = renderTwinNote({ pitch: 60, velocity: 0.9, state: { ...base, osc1: { ...base.osc1, wave: 'wt3', wt: 3, wtPos: 0 } }, gateSec: 0.2, sampleRate: 22050 })
  const b = renderTwinNote({ pitch: 60, velocity: 0.9, state: { ...base, osc1: { ...base.osc1, wave: 'wt3', wt: 3, wtPos: 1 } }, gateSec: 0.2, sampleRate: 22050 })
  let diff = 0
  const n = Math.min(a.L.length, b.L.length)
  for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(a.L[i] - b.L[i]))
  assert(diff > 0.001, 'wavetable morph (wtPos) changes timbre')
}

{
  // New filter types must be accepted and behave differently from lowpass.
  const base = defaultTwinState()
  const lp = renderTwinNote({ pitch: 60, velocity: 0.9, state: { ...base, filter1: { ...base.filter1, type: 'lowpass' } }, gateSec: 0.2, sampleRate: 22050 })
  const nt = renderTwinNote({ pitch: 60, velocity: 0.9, state: { ...base, filter1: { ...base.filter1, type: 'notch' } }, gateSec: 0.2, sampleRate: 22050 })
  let diff = 0
  const n = Math.min(lp.L.length, nt.L.length)
  for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(lp.L[i] - nt.L[i]))
  assert(diff > 0.01, 'notch filter differs from lowpass')
}

console.log('synth-voice ok')
