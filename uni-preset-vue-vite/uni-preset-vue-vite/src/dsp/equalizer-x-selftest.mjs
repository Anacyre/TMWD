import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const dir = dirname(fileURLToPath(import.meta.url))
const file = readFileSync(join(dir, 'equalizer-x-processor.js'), 'utf8')
const start = file.indexOf('`')
const end = file.lastIndexOf('`')
if (start < 0 || end <= start) {
  console.error('Could not extract EQUALIZER_X_PROCESSOR_SOURCE')
  process.exit(1)
}
const source = file.slice(start + 1, end)
const EQX_API = new Function(source + '\nreturn EQX_API;')()

const SR = 48000
const N = 128
const fails = []

function assert (name, cond, detail) {
  if (cond) console.log('  ok  ' + name)
  else {
    fails.push(name + (detail ? ' — ' + detail : ''))
    console.log('  FAIL  ' + name + (detail ? ' — ' + detail : ''))
  }
}

function warmup (proc, state, blocks = 48) {
  proc.setState(state)
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  for (let i = 0; i < blocks; i++) proc.process(l, r, N)
}

function processSine (proc, freq, blocks, amp = 0.25) {
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  let accL = 0
  let accR = 0
  let peak = 0
  let nan = false
  let phase = 0
  const w = 2 * Math.PI * freq / SR
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < N; i++) {
      const x = Math.sin(phase) * amp
      l[i] = x
      r[i] = x
      phase += w
    }
    proc.process(l, r, N)
    for (let i = 0; i < N; i++) {
      if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) nan = true
      accL += l[i] * l[i]
      accR += r[i] * r[i]
      const p = Math.max(Math.abs(l[i]), Math.abs(r[i]))
      if (p > peak) peak = p
    }
  }
  return {
    rms: Math.sqrt((accL + accR) / (blocks * N * 2)),
    peak,
    nan
  }
}

function rmsDb (rms) {
  return 20 * Math.log10(Math.max(1e-12, rms))
}

console.log('Equalizer X DSP self-test')

const api = EQX_API
assert('kernel loads', !!(api && api.EqualizerXProcessor && api.eqResponseDb))
assert('FFT size 1024', api.EQX.FFT_SIZE === 1024)
assert('viz bins 192', api.EQX.VIZ_BINS === 192)
assert('max 7 nodes', api.EQX.MAX_NODES === 7)
assert('topology DF2T', api.EQX.topology === 'DF2T')

const bell6 = [{ shape: 'bell', freq: 1000, gain: 6, q: 0.9, enabled: true }]
const bellM6 = [{ shape: 'bell', freq: 1000, gain: -6, q: 0.9, enabled: true }]
const db6 = api.eqResponseDb(1000, bell6, SR)
const dbM6 = api.eqResponseDb(1000, bellM6, SR)
assert('2. Bell +6 dB at fc', Math.abs(db6 - 6) < 0.15, 'got ' + db6.toFixed(3))
assert('3. Bell -6 dB at fc', Math.abs(dbM6 + 6) < 0.15, 'got ' + dbM6.toFixed(3))

const lc = [{ shape: 'lowcut', freq: 200, slope: 12, enabled: true }]
assert('4. Low Cut removes lows', api.eqResponseDb(40, lc, SR) < -12 && api.eqResponseDb(2000, lc, SR) > -1)

const hc = [{ shape: 'highcut', freq: 2000, slope: 12, enabled: true }]
assert('5. High Cut removes highs', api.eqResponseDb(12000, hc, SR) < -12 && api.eqResponseDb(200, hc, SR) > -1)

const ls = [{ shape: 'lowshelf', freq: 200, gain: 6, slope: 12, enabled: true }]
assert('6. Low Shelf boosts lows', api.eqResponseDb(40, ls, SR) > 4 && Math.abs(api.eqResponseDb(8000, ls, SR)) < 1)

const hs = [{ shape: 'highshelf', freq: 4000, gain: 6, slope: 12, enabled: true }]
assert('6b. High Shelf boosts highs', api.eqResponseDb(12000, hs, SR) > 4 && Math.abs(api.eqResponseDb(80, hs, SR)) < 1)

const notch = [{ shape: 'notch', freq: 1000, q: 4, enabled: true }]
assert('7. Notch cuts fc', api.eqResponseDb(1000, notch, SR) < -20)

const wide = api.eqResponseDb(2000, [{ shape: 'bell', freq: 1000, gain: 6, q: 0.4, enabled: true }], SR)
const narrow = api.eqResponseDb(2000, [{ shape: 'bell', freq: 1000, gain: 6, q: 8, enabled: true }], SR)
assert('8. Q affects width', wide > narrow + 2, 'wide=' + wide.toFixed(2) + ' narrow=' + narrow.toFixed(2))

const s12 = api.eqResponseDb(50, [{ shape: 'lowcut', freq: 200, slope: 12, enabled: true }], SR)
const s24 = api.eqResponseDb(50, [{ shape: 'lowcut', freq: 200, slope: 24, enabled: true }], SR)
assert('9. Slope 24 steeper than 12', s24 < s12 - 6, '12=' + s12.toFixed(2) + ' 24=' + s24.toFixed(2))

const s6 = api.eqResponseDb(50, [{ shape: 'lowcut', freq: 200, slope: 6, enabled: true }], SR)
assert('9b. Slope 6 gentler than 12', s6 > s12 + 3, '6=' + s6.toFixed(2))

assert('10. Max 7 constant', api.EQX.MAX_NODES === 7)

const off = [{ shape: 'bell', freq: 1000, gain: 12, q: 0.9, enabled: false }]
assert('11. Disabled node is unity', Math.abs(api.eqResponseDb(1000, off, SR)) < 0.05)

const proc = new api.EqualizerXProcessor(SR)
const silence = { outputGainDb: 0, autoGain: false, nodes: [] }
warmup(proc, silence, 8)
{
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    l[i] = (i % 7) * 0.01 - 0.03
    r[i] = (i % 5) * 0.012 - 0.02
  }
  const l0 = Float32Array.from(l)
  const r0 = Float32Array.from(r)
  proc.setState(silence)
  proc.process(l, r, N)
  let maxd = 0
  let nan = false
  for (let i = 0; i < N; i++) {
    maxd = Math.max(maxd, Math.abs(l[i] - l0[i]), Math.abs(r[i] - r0[i]))
    if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) nan = true
  }
  assert('1. Unity / empty nodes passthrough', maxd < 1e-6 && !nan, 'maxd=' + maxd)
}

{
  const boost = { outputGainDb: 0, autoGain: false, nodes: [{ shape: 'bell', freq: 1000, gain: 6, q: 0.9, enabled: true }] }
  warmup(proc, boost, 64)
  const a = processSine(proc, 1000, 32, 0.2)
  const flat = { outputGainDb: 0, autoGain: false, nodes: [{ shape: 'bell', freq: 1000, gain: 0, q: 0.9, enabled: true }] }
  warmup(proc, flat, 64)
  const b = processSine(proc, 1000, 32, 0.2)
  const delta = rmsDb(a.rms) - rmsDb(b.rms)
  assert('2b. Bell +6 audible in process()', delta > 4 && delta < 8 && !a.nan, 'deltaDb=' + delta.toFixed(2))
}

{
  const cut = { outputGainDb: 0, autoGain: false, nodes: [{ shape: 'bell', freq: 1000, gain: -6, q: 0.9, enabled: true }] }
  warmup(proc, cut, 64)
  const a = processSine(proc, 1000, 32, 0.2)
  const flat = { outputGainDb: 0, autoGain: false, nodes: [{ shape: 'bell', freq: 1000, gain: 0, q: 0.9, enabled: true }] }
  warmup(proc, flat, 64)
  const b = processSine(proc, 1000, 32, 0.2)
  const delta = rmsDb(a.rms) - rmsDb(b.rms)
  assert('3b. Bell -6 audible in process()', delta < -4 && delta > -8 && !a.nan, 'deltaDb=' + delta.toFixed(2))
}

{
  const hp = { outputGainDb: 0, autoGain: false, nodes: [{ shape: 'lowcut', freq: 800, slope: 24, enabled: true }] }
  warmup(proc, hp, 64)
  const low = processSine(proc, 80, 24, 0.3)
  const high = processSine(proc, 3000, 24, 0.3)
  assert('4b. Low Cut process', rmsDb(low.rms) < rmsDb(high.rms) - 12, 'low=' + rmsDb(low.rms).toFixed(1) + ' high=' + rmsDb(high.rms).toFixed(1))
}

{
  const lp = { outputGainDb: 0, autoGain: false, nodes: [{ shape: 'highcut', freq: 600, slope: 24, enabled: true }] }
  warmup(proc, lp, 64)
  const low = processSine(proc, 80, 24, 0.3)
  const high = processSine(proc, 6000, 24, 0.3)
  assert('5b. High Cut process', rmsDb(high.rms) < rmsDb(low.rms) - 12, 'low=' + rmsDb(low.rms).toFixed(1) + ' high=' + rmsDb(high.rms).toFixed(1))
}

{
  const nch = { outputGainDb: 0, autoGain: false, nodes: [{ shape: 'notch', freq: 1000, q: 8, enabled: true }] }
  warmup(proc, nch, 64)
  const at = processSine(proc, 1000, 32, 0.25)
  const side = processSine(proc, 250, 32, 0.25)
  assert('7b. Notch process', rmsDb(at.rms) < rmsDb(side.rms) - 8, 'at=' + rmsDb(at.rms).toFixed(1) + ' side=' + rmsDb(side.rms).toFixed(1))
}

{
  const bypassed = {
    outputGainDb: 0,
    autoGain: false,
    nodes: [
      { shape: 'bell', freq: 1000, gain: 12, q: 0.8, enabled: false, solo: false },
      { shape: 'lowcut', freq: 80, slope: 12, enabled: true, solo: false }
    ]
  }
  assert('11b. Disabled ignored in curve', Math.abs(api.eqResponseDb(1000, bypassed.nodes, SR) - api.eqResponseDb(1000, [bypassed.nodes[1]], SR)) < 0.05)
}

{
  const solo = {
    outputGainDb: 0,
    autoGain: false,
    nodes: [
      { shape: 'bell', freq: 200, gain: 6, q: 0.9, enabled: true, solo: false },
      { shape: 'bell', freq: 4000, gain: 6, q: 0.9, enabled: true, solo: true }
    ]
  }
  warmup(proc, solo, 64)
  const low = processSine(proc, 200, 24, 0.2)
  const high = processSine(proc, 4000, 24, 0.2)
  assert('12. Solo uses selected band', rmsDb(high.rms) > rmsDb(low.rms) + 2, 'low=' + rmsDb(low.rms).toFixed(1) + ' high=' + rmsDb(high.rms).toFixed(1))
}

{
  const specProc = new api.EqualizerXProcessor(SR)
  specProc.setState({ outputGainDb: 0, autoGain: false, nodes: [] })
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  let phase = 0
  const w = 2 * Math.PI * 1000 / SR
  for (let b = 0; b < 220; b++) {
    for (let i = 0; i < N; i++) {
      const x = Math.sin(phase) * 0.4
      l[i] = x
      r[i] = x
      phase += w
    }
    specProc.process(l, r, N)
  }
  const spec = specProc.getSpectrumArray()
  let peakI = 0
  let peakV = -1
  for (let i = 0; i < spec.length; i++) {
    if (spec[i] > peakV) {
      peakV = spec[i]
      peakI = i
    }
  }
  const t = (peakI + 0.5) / spec.length
  const peakHz = 20 * Math.pow(1000, t)
  assert('13. Spectrum peaks near 1 kHz', specProc.analyzer.ready && peakHz > 500 && peakHz < 2000 && peakV > 0.05, 'peakHz=' + peakHz.toFixed(0) + ' val=' + peakV.toFixed(3))
}

{
  const recipe = api.createRecipe()
  api.designNode({ shape: 'bell', freq: 1000, gain: 6, q: 0.9, enabled: true }, SR, recipe)
  const w = 2 * Math.PI * 1000 / SR
  const mag2 = api.recipeMag2(recipe, w)
  const fromH = 10 * Math.log10(mag2)
  const fromEq = api.eqResponseDb(1000, [{ shape: 'bell', freq: 1000, gain: 6, q: 0.9, enabled: true }], SR)
  assert('14. Curve matches biquad H(e^jw)', Math.abs(fromH - fromEq) < 1e-9 && Math.abs(fromH - 6) < 0.15, 'H=' + fromH.toFixed(4) + ' eq=' + fromEq.toFixed(4))
}

{
  const ag = new api.EqualizerXProcessor(SR)
  const boost = { outputGainDb: 0, autoGain: true, nodes: [{ shape: 'bell', freq: 1000, gain: 12, q: 0.7, enabled: true }] }
  ag.setState(boost)
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  let phase = 0
  const w = 2 * Math.PI * 1000 / SR
  for (let b = 0; b < 400; b++) {
    for (let i = 0; i < N; i++) {
      const x = Math.sin(phase) * 0.2
      l[i] = x
      r[i] = x
      phase += w
    }
    ag.process(l, r, N)
  }
  assert('15. Auto Gain compensates boost', ag.autoGainDb < -4 && ag.autoGainDb > -12.1, 'compDb=' + ag.autoGainDb.toFixed(2))
}

{
  const sweep = new api.EqualizerXProcessor(SR)
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  let nan = false
  let click = 0
  let prev = 0
  for (let b = 0; b < 80; b++) {
    const t = b / 79
    sweep.setState({
      outputGainDb: (t - 0.5) * 12,
      autoGain: false,
      nodes: [{ shape: 'bell', freq: 80 + t * 8000, gain: (t - 0.5) * 16, q: 0.3 + t * 6, enabled: true }]
    })
    for (let i = 0; i < N; i++) {
      l[i] = 0.15
      r[i] = 0.15
    }
    sweep.process(l, r, N)
    for (let i = 0; i < N; i++) {
      if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) nan = true
      const d = Math.abs(l[i] - prev)
      if (d > 0.35) click++
      prev = l[i]
    }
  }
  assert('16. Parameter moves stay finite / no zipper spikes', !nan && click < 8, 'nan=' + nan + ' spikes=' + click)
}

{
  const nasty = new api.EqualizerXProcessor(SR)
  nasty.setState({
    outputGainDb: 24,
    autoGain: true,
    nodes: [
      { shape: 'lowcut', freq: 20, slope: 48, enabled: true },
      { shape: 'highcut', freq: 20000, slope: 48, enabled: true },
      { shape: 'notch', freq: 40, q: 12, enabled: true },
      { shape: 'bell', freq: 19990, gain: 18, q: 12, enabled: true },
      { shape: 'bandpass', freq: 1000, q: 0.2, enabled: true },
      { shape: 'lowshelf', freq: 80, gain: -18, slope: 6, enabled: true },
      { shape: 'highshelf', freq: 12000, gain: 18, slope: 24, enabled: true }
    ]
  })
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  let nan = false
  for (let b = 0; b < 32; b++) {
    for (let i = 0; i < N; i++) {
      l[i] = Math.sin(i) * 0.9
      r[i] = Math.cos(i * 1.7) * 0.9
    }
    nasty.process(l, r, N)
    for (let i = 0; i < N; i++) {
      if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) nan = true
    }
  }
  assert('17. No NaN/Infinity on extreme settings', !nan)
}

{
  const cpu = new api.EqualizerXProcessor(SR)
  cpu.setState({
    outputGainDb: 0,
    autoGain: true,
    nodes: [
      { shape: 'lowcut', freq: 80, slope: 24, enabled: true },
      { shape: 'bell', freq: 250, gain: -2, q: 0.9, enabled: true },
      { shape: 'bell', freq: 1000, gain: 3, q: 1.1, enabled: true },
      { shape: 'bell', freq: 3500, gain: 1.5, q: 0.8, enabled: true },
      { shape: 'highshelf', freq: 8000, gain: 2, slope: 12, enabled: true }
    ]
  })
  const l = new Float32Array(N)
  const r = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    l[i] = 0.1
    r[i] = 0.1
  }
  const blocks = 4000
  const t0 = performance.now()
  for (let b = 0; b < blocks; b++) cpu.process(l, r, N)
  const ms = performance.now() - t0
  const audioMs = blocks * N / SR * 1000
  const ratio = ms / audioMs
  assert('18. CPU well under realtime', ratio < 0.25, (ms).toFixed(1) + 'ms for ' + audioMs.toFixed(0) + 'ms audio (' + (ratio * 100).toFixed(2) + '%)')
  console.log('     CPU: ' + (ratio * 100).toFixed(3) + '% of realtime @ 48 kHz / 128 (node, not worklet)')
}

if (fails.length) {
  console.log('\n' + fails.length + ' failed:')
  fails.forEach((f) => console.log(' - ' + f))
  process.exit(1)
}
console.log('\nAll Equalizer X DSP checks passed.')
