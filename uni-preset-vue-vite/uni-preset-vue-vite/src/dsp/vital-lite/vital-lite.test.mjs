import { plugins } from '../registry.js'
import { FX_WORKLET_SOURCE } from '../fx-worklet.js'
import { VITAL_LITE_IDS, VITAL_LITE_PLUGINS, isVitalLiteId } from './index.js'
import { createReverbLiteProcessor, normalizeReverbLiteState, defaultReverbLiteState } from './reverb.js'
import { createChorusLiteProcessor } from './chorus.js'
import { createFlangerLiteProcessor } from './flanger.js'
import { createPhaserLiteProcessor } from './phaser.js'
import { createDelayLiteProcessor } from './delay.js'
import { createDistortionLiteProcessor } from './distortion.js'
import { createCompressorLiteProcessor } from './compressor.js'
import { createEqualizerLiteProcessor } from './equalizer.js'
import { createFilterLiteProcessor } from './filter.js'
import { midiToHz, exp2 } from './params.js'
import {
  formatVitalValue, eqResponse, distortionShape, distortSample, driveAmount,
  delayBars, filterResponse, compressorCols
} from './face-draw.js'
import { createInsert } from '../plugin.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

function almost (a, b, eps, message) {
  assert(Math.abs(a - b) <= eps, (message || 'almost') + ': ' + a + ' vs ' + b)
}

function peak (l, r) {
  let p = 0
  for (let i = 0; i < l.length; i++) {
    p = Math.max(p, Math.abs(l[i]), r ? Math.abs(r[i]) : 0)
  }
  return p
}

function run (proc, sr, seconds, state, fill) {
  const n = 128
  const blocks = Math.max(1, Math.round(seconds * sr / n))
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  let last = { l, r, peak: 0 }
  for (let k = 0; k < blocks; k++) {
    fill(l, r, k, n)
    proc.process(l, r, n, state)
    last = { l, r, peak: peak(l, r) }
  }
  return last
}

const makers = {
  'reverb-lite': createReverbLiteProcessor,
  'chorus-lite': createChorusLiteProcessor,
  'flanger-lite': createFlangerLiteProcessor,
  'phaser-lite': createPhaserLiteProcessor,
  'delay-lite': createDelayLiteProcessor,
  'distortion-lite': createDistortionLiteProcessor,
  'compressor-lite': createCompressorLiteProcessor,
  'equalizer-lite': createEqualizerLiteProcessor,
  'filter-lite': createFilterLiteProcessor
}

{
  assert(VITAL_LITE_IDS.length === 9, 'nine VitalLite plugins')
  for (const id of VITAL_LITE_IDS) {
    assert(plugins[id], id + ' is registered')
    assert(isVitalLiteId(id), id + ' flagged as VitalLite')
    assert(VITAL_LITE_PLUGINS[id].name.startsWith('VitalLite '), id + ' full name')
    const insert = createInsert(id, plugins)
    assert(insert.pluginId === id, id + ' createInsert')
    assert(insert.state && typeof insert.state.mix === 'number' || insert.state.drive != null || insert.state.lowMidi != null,
      id + ' has state')
  }
}

{
  almost(midiToHz(69), 440, 1e-9, 'A4')
  almost(exp2(0), 1, 1e-12, '2^0')
  almost(exp2(-2), 0.25, 1e-12, 'chorus default Hz mapping')
  const st = normalizeReverbLiteState({ mix: 4, decayTime: 0 })
  almost(st.mix, 1, 1e-9, 'mix clamp')
  almost(st.decayTime, 0.1, 1e-9, 'decay floor matches Vital process clamp')
  const d = defaultReverbLiteState()
  almost(d.mix, 0.25, 1e-12, 'Vital reverb_dry_wet default')
  almost(d.decayTime, 1, 1e-12, '2^0 seconds')
}

{
  const sr = 48000
  const proc = createReverbLiteProcessor(sr)
  const silent = run(proc, sr, 0.05, { ...defaultReverbLiteState(), mix: 1 }, (l, r) => {
    l.fill(0); r.fill(0)
  })
  assert(silent.peak < 1e-6, 'silence stays silence, got ' + silent.peak)

  const dry = run(createReverbLiteProcessor(sr), sr, 0.05, { ...defaultReverbLiteState(), mix: 0 }, (l, r, k, n) => {
    for (let i = 0; i < n; i++) {
      const x = Math.sin(2 * Math.PI * 440 * (k * n + i) / sr)
      l[i] = x; r[i] = x
    }
  })
  almost(dry.peak, 1, 0.05, 'mix 0 is dry')

  const wetProc = createReverbLiteProcessor(sr)
  const impulse = new Float32Array(128)
  const zeros = new Float32Array(128)
  impulse[0] = 1
  wetProc.process(impulse, impulse.slice(), 128, { ...defaultReverbLiteState(), mix: 1, decayTime: 2 })
  let energy = 0
  for (let b = 0; b < 40; b++) {
    zeros.fill(0)
    const r = zeros.slice()
    wetProc.process(zeros, r, 128, { ...defaultReverbLiteState(), mix: 1, decayTime: 2 })
    energy += peak(zeros, r)
  }
  assert(energy > 0.01, 'reverb impulse has a tail, energy=' + energy)
}

{
  const sr = 48000
  for (const id of VITAL_LITE_IDS) {
    const proc = makers[id](sr)
    const state = plugins[id].normalize(plugins[id].createState())
    const out = run(proc, sr, 0.04, state, (l, r, k, n) => {
      for (let i = 0; i < n; i++) {
        l[i] = 0.2 * Math.sin(2 * Math.PI * 330 * (k * n + i) / sr)
        r[i] = 0.2 * Math.sin(2 * Math.PI * 330 * (k * n + i) / sr + 0.3)
      }
    })
    assert(Number.isFinite(out.peak), id + ' produced finite samples')
    assert(out.peak < 20, id + ' did not explode, peak=' + out.peak)
  }
}

{
  const sr = 48000
  const peaks = {}
  for (const model of ['analog', 'ladder', 'digital']) {
    const proc = createFilterLiteProcessor(sr)
    const state = plugins['filter-lite'].normalize({ model, mix: 1, cutoffMidi: 48, resonance: 0.4 })
    peaks[model] = run(proc, sr, 0.05, state, (l, r, k, n) => {
      for (let i = 0; i < n; i++) {
        l[i] = 0.5 * Math.sin(2 * Math.PI * 2000 * (k * n + i) / sr)
        r[i] = l[i]
      }
    }).peak
    assert(Number.isFinite(peaks[model]), model + ' filter finite')
  }
  assert(peaks.analog !== peaks.ladder || peaks.ladder !== peaks.digital, 'Analog/Ladder/Digital are distinct models')
}

{
  assert(/class\s+VitalLiteReverbProcessor/.test(FX_WORKLET_SOURCE), 'worklet keeps VitalLiteReverbProcessor')
  assert(/class\s+VitalLiteFilterProcessor/.test(FX_WORKLET_SOURCE), 'worklet keeps VitalLiteFilterProcessor')
  assert(/VITAL_LITE_CTORS/.test(FX_WORKLET_SOURCE), 'worklet maps plugin ids to constructors')
}

{
  assert(formatVitalValue('midi', 69) === '440 Hz', 'midi format')
  assert(formatVitalValue('pct', 0.5) === '50%', 'pct format')
  const eq = eqResponse({
    lowMode: 'lowshelf', lowMidi: 40, lowGainDb: 6, lowRes: 0.4,
    bandMode: 'bell', bandMidi: 80, bandGainDb: -3, bandRes: 0.5,
    highMode: 'highshelf', highMidi: 100, highGainDb: 2, highRes: 0.3
  })
  assert(eq.line.startsWith('M') && !eq.line.includes('NaN'), 'eq curve')
  const shape = distortionShape({ type: 'soft', drive: 12 })
  assert(shape.line.includes('L') && !shape.line.includes('NaN'), 'distortion curve')
  almost(distortSample('hard', 0.5, driveAmount('hard', 0)), 0.5, 0.02, 'unity hard clip')
  const filt = filterResponse({ cutoffMidi: 80, resonance: 0.5, blend: 0, style: '24dB' })
  assert(!filt.line.includes('NaN'), 'filter curve')
  const taps = delayBars({ style: 'pingpong', frequency: 4, feedback: 0.5, mix: 0.5 })
  assert(taps.length > 1, 'delay taps')
  const cols = compressorCols({ bands: 'low-band', lowGainDb: 6, bandGainDb: 0, highGainDb: 0, lowUpperDb: -20, bandUpperDb: -20, highUpperDb: -20 })
  assert(cols[0].cls === 'b1' && cols[2].cls === 'off', 'compressor band enable')
}

console.log('vital-lite ok')
