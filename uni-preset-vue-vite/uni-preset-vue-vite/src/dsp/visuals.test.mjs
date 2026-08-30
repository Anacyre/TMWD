/* Visualization data chain: spectrum selection, pre-curve routing and the
   reason codes that replace a silently blank graph. */

import {
  pickPluginSpectrum, pickPreSpectrum, metersForInsert, spectrumMax,
  visualState, visualStateLabel, VIS_UNATTACHED, VIS_BYPASS, VIS_SILENT, VIS_LIVE
} from './runtime.js'
import { drawSpectrum, SPEC_DRAW_FLOOR } from '../components/dsp/dsp-theme.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

const flat = (value, n = 96) => new Array(n).fill(value)

// Per-instance Dynamic spectrum wins over the chain tap, even when quiet.
{
  const posted = { spectrum: flat(0.5), plugins: { d1: { spectrum: flat(0.001) } } }
  const insert = { pluginId: 'dynamic-x', instanceId: 'd1' }
  const picked = pickPluginSpectrum(posted, null, insert)
  assert(spectrumMax(picked) === 0.001, 'a quiet per-instance band still wins over the summed tap')
}

// EQ reads its own post curve, and the pre curve comes through separately.
{
  const posted = {
    spectrum: flat(0.9),
    eqById: { e1: { spectrum: flat(0.4), spectrumPre: flat(0.7) } }
  }
  const insert = { pluginId: 'equalizer-x', instanceId: 'e1' }
  assert(spectrumMax(pickPluginSpectrum(posted, null, insert)) === 0.4, 'EQ uses its own post spectrum')
  assert(spectrumMax(pickPreSpectrum(posted, insert)) === 0.7, 'EQ pre spectrum is exposed')
  assert(pickPreSpectrum(posted, { pluginId: 'boost-x' }).length === 0, 'only EQ reports a pre curve')
  assert(pickPreSpectrum({ eqById: { e1: {} } }, insert).length === 0, 'a missing pre curve reports empty')
}

// Chain tap is the fallback, and an analyser only fills in when nothing else does.
{
  const analyser = {
    frequencyBinCount: 8,
    context: { sampleRate: 48000 },
    getByteFrequencyData (data) { data.fill(128) }
  }
  assert(spectrumMax(pickPluginSpectrum({ spectrum: flat(0.3) }, analyser, null)) === 0.3,
    'the worklet tap is preferred over the analyser')
  assert(pickPluginSpectrum({}, analyser, null).length === 96, 'the analyser fills in when the worklet is silent')
  assert(pickPluginSpectrum({}, null, null).length === 0, 'no source yields an empty array')
}

// Per-instance meters shadow the lane meters they overlap.
{
  const merged = metersForInsert(
    { inPeak: 0.5, outPeak: 0.5, gr: 0 },
    { instanceId: 'x' }
  )
  assert(merged.inPeak === 0.5, 'lane meters pass through when the plugin posts none')
  const own = metersForInsert(
    { inPeak: 0.5, plugins: { x: { gr: 0.4 } } },
    { instanceId: 'x' }
  )
  assert(own.inPeak === 0.5 && own.gr === 0.4, 'plugin meters are merged over the lane meters')
}

// The four reasons a graph can be empty must be distinguishable.
{
  assert(visualState({ inPeak: 1 }, null, { attached: true, error: 'worklet blocked' }) === VIS_UNATTACHED,
    'a worklet error is reported as unattached')
  assert(visualState({ inPeak: 1 }, null, { attached: false }) === VIS_UNATTACHED,
    'a detached FX engine is reported even with signal present')
  assert(visualState({ inPeak: 1 }, { enabled: false }, { attached: true }) === VIS_BYPASS,
    'a disabled insert reports bypass')
  assert(visualState({ inPeak: 0 }, { enabled: true }, { attached: true }) === VIS_SILENT,
    'silence is reported as no signal')
  assert(visualState({ outPeak: 0.2 }, { enabled: true }, { attached: true }) === VIS_LIVE,
    'signal on the output counts as live')
  assert(visualState({ wetPeak: 0.2 }, { enabled: true }, { attached: true }) === VIS_LIVE,
    'a reverb tail alone counts as live')
  assert(visualStateLabel(VIS_LIVE) === '', 'a live graph shows no notice')
  assert(visualStateLabel(VIS_SILENT).length > 0, 'every fault state has a label')
  assert(visualStateLabel(VIS_UNATTACHED).length > 0, 'the detached state has a label')
  assert(visualStateLabel(VIS_BYPASS).length > 0, 'the bypass state has a label')
}

// drawSpectrum must not amplify dither into a full-scale block, and must report
// whether it actually drew a curve.
{
  const calls = []
  const ctx = {
    save () {}, restore () {}, beginPath () {}, closePath () {}, fill () {}, stroke () {},
    moveTo () {}, lineTo (x, y) { calls.push(y) }
  }
  const h = 100
  assert(drawSpectrum(ctx, flat(0.5), 200, h) === true, 'a real spectrum reports drawn')

  calls.length = 0
  const dither = 1e-4
  drawSpectrum(ctx, flat(dither), 200, h)
  const tallest = Math.min.apply(null, calls.filter((y) => Number.isFinite(y)))
  assert(tallest > h * 0.3, 'near-silence stays near the floor instead of being boosted to full scale')

  assert(drawSpectrum(ctx, flat(SPEC_DRAW_FLOOR / 10), 200, h) === false,
    'below the draw floor reports not drawn')
  assert(drawSpectrum(ctx, [], 200, h) === false, 'an empty spectrum reports not drawn')
  assert(drawSpectrum(ctx, [0.5], 200, h) === false, 'a single bin cannot form a curve')
}

console.log('dsp visuals ok')
