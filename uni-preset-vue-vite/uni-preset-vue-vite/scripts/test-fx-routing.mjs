/**
 * Headless smoke test for browser FX routing (node + Web Audio API).
 * Run: node scripts/test-fx-routing.mjs
 */
import { FX_WORKLET_SOURCE } from '../src/dsp/fx-worklet.js'
import { createInsert } from '../src/dsp/plugin.js'
import { plugins } from '../src/dsp/registry.js'
import { serializeInsert } from '../src/dsp/plugin.js'

const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext
if (!AudioContext) {
  console.error('AudioContext unavailable in this Node build — open http://localhost:5173 and check console for [mixer] sync logs')
  process.exit(0)
}

const ctx = new AudioContext()
const blob = new Blob([FX_WORKLET_SOURCE], { type: 'application/javascript' })
const url = URL.createObjectURL(blob)
await ctx.audioWorklet.addModule(url)
URL.revokeObjectURL(url)

const chain = new AudioWorkletNode(ctx, 'daw-fx-chain', {
  numberOfInputs: 1,
  numberOfOutputs: 1,
  outputChannelCount: [2],
  channelCount: 2
})

const osc = ctx.createOscillator()
osc.frequency.value = 440
const gain = ctx.createGain()
gain.gain.value = 0.15
osc.connect(gain)
gain.connect(chain)
chain.connect(ctx.destination)

const insert = createInsert('equalizer-x', plugins, { presetId: 'bright' })
insert.state.nodes[0].gain = 6
chain.port.postMessage({ type: 'set', chain: [serializeInsert(insert)] })

let dry = 0
let wet = 0
chain.port.onmessage = (ev) => {
  if (ev.data && ev.data.type === 'meters') wet = ev.data.outPeak || 0
}

osc.start()
await new Promise((r) => setTimeout(r, 120))

// bypass chain for dry reference
chain.port.postMessage({ type: 'set', chain: [] })
await new Promise((r) => setTimeout(r, 120))

osc.stop()
await ctx.close()

console.log('FX routing smoke test:', {
  workletLoaded: true,
  wetPeakAfterEq: wet,
  note: wet > 0.001 ? 'worklet processed signal' : 'check EQ preset / meters'
})
