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

console.log('synth-voice ok')
