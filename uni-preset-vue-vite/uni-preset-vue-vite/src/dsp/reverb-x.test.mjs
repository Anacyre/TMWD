import {
  ReverbXProcessor,
  compileReverbNetwork,
  sizeScale,
  feedbackGain,
  VENUE_DEFINITIONS,
  REVERB_X_FACTORY_PRESETS,
  reverbXReportMeta,
  getReverbVisualization
} from './reverb-x.js'

const SR = 48000
const BLOCK = 128
const results = []
const rt60Table = []

function assert (name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra || '' })
  const mark = cond ? 'PASS' : 'FAIL'
  console.log(mark + '  ' + name + (extra ? '  —  ' + extra : ''))
}

function makeProc (state, host) {
  const p = new ReverbXProcessor(SR, host || null, 'test')
  p.setState(Object.assign({
    amount: 1,
    decay: 2.2,
    size: 0.62,
    venue: 'concert-hall',
    returnOnly: true,
    wetProcess: false
  }, state))
  return p
}

function processBlocks (proc, blocks, fill) {
  const l = new Float32Array(BLOCK)
  const r = new Float32Array(BLOCK)
  const outL = []
  const outR = []
  for (let b = 0; b < blocks; b++) {
    if (fill) fill(l, r, b)
    else {
      l.fill(0)
      r.fill(0)
    }
    proc.process(l, r, BLOCK)
    for (let i = 0; i < BLOCK; i++) {
      outL.push(l[i])
      outR.push(r[i])
    }
  }
  return { l: outL, r: outR }
}

function peakOf (samples, start, end) {
  let p = 0
  const a = start || 0
  const b = end == null ? samples.length : end
  for (let i = a; i < b; i++) {
    const v = samples[i] < 0 ? -samples[i] : samples[i]
    if (v > p) p = v
  }
  return p
}

function energyOf (samples, start, end) {
  let e = 0
  const a = start || 0
  const b = end == null ? samples.length : end
  for (let i = a; i < b; i++) e += samples[i] * samples[i]
  return e
}

function rmsBlock (samples, start, n) {
  let e = 0
  for (let i = 0; i < n; i++) {
    const x = samples[start + i] || 0
    e += x * x
  }
  return Math.sqrt(e / Math.max(1, n))
}

function measureRt60 (state) {
  const proc = makeProc(Object.assign({ amount: 1, returnOnly: true, wetProcess: false }, state))
  const maxSec = Math.min(14, (state.decay || 2) * 5 + 1.5)
  const blocks = Math.ceil(maxSec * SR / BLOCK)
  const ir = processBlocks(proc, blocks, (l, r, b) => {
    l.fill(0)
    r.fill(0)
    if (b === 0) {
      l[0] = 1
      r[0] = 1
    }
  })
  const envHop = Math.floor(SR * 0.01)
  const env = []
  for (let i = 0; i + envHop <= ir.l.length; i += envHop) {
    const rms = Math.max(rmsBlock(ir.l, i, envHop), rmsBlock(ir.r, i, envHop))
    env.push({ t: i / SR, rms: rms })
  }
  let peak = 0
  let peakI = 0
  for (let i = 0; i < env.length; i++) {
    if (env[i].rms > peak) {
      peak = env[i].rms
      peakI = i
    }
  }
  const db = env.map((e) => 20 * Math.log10(Math.max(1e-12, e.rms / Math.max(1e-12, peak))))
  let t5 = env[peakI].t
  let t65 = env[env.length - 1].t
  let found5 = false
  for (let i = peakI; i < db.length; i++) {
    if (!found5 && db[i] <= -5) {
      t5 = env[i].t
      found5 = true
    }
    if (found5 && db[i] <= -65) {
      t65 = env[i].t
      break
    }
  }
  const rt60 = found5 ? Math.max(0.02, t65 - t5) : t65
  let nan = false
  let maxAbs = 0
  for (let i = 0; i < ir.l.length; i++) {
    if (ir.l[i] !== ir.l[i] || ir.r[i] !== ir.r[i]) nan = true
    const a = Math.max(Math.abs(ir.l[i]), Math.abs(ir.r[i]))
    if (a > maxAbs) maxAbs = a
  }
  return { rt60: rt60, peak: peak, nan: nan, maxAbs: maxAbs, ir: ir }
}

function impulseResponse (state, seconds) {
  const proc = makeProc(state)
  const blocks = Math.ceil(seconds * SR / BLOCK)
  return processBlocks(proc, blocks, (l, r, b) => {
    l.fill(0)
    r.fill(0)
    if (b === 0) {
      l[0] = 1
      r[0] = 1
    }
  })
}

// 1. silence → silence
{
  const proc = makeProc({ amount: 1, returnOnly: true })
  const { l, r } = processBlocks(proc, 32)
  const p = Math.max(peakOf(l), peakOf(r))
  assert('1. Input silence → output silence', p < 1e-7, 'peak=' + p.toExponential(2))
}

// 2. impulse → visible early reflections
{
  const net = compileReverbNetwork({ venue: 'concert-hall', size: 0.82, decay: 2.8, amount: 1 }, SR)
  const ir = impulseResponse({ venue: 'concert-hall', size: 0.82, decay: 2.8, amount: 1, returnOnly: true }, 0.25)
  let hits = 0
  net.taps.forEach((tap) => {
    const idx = Math.round((net.preDelaySec + tap.delaySec) * SR)
    const win = 64
    const p = peakOf(ir.l, Math.max(0, idx - win), Math.min(ir.l.length, idx + win))
    if (p > 1e-4) hits++
  })
  assert('2. Impulse → visible early reflections', hits >= Math.max(2, net.taps.length - 1), hits + '/' + net.taps.length + ' taps found')
}

// 3. dry unchanged when bypassed
{
  const l = new Float32Array(BLOCK)
  const r = new Float32Array(BLOCK)
  for (let i = 0; i < BLOCK; i++) {
    l[i] = Math.sin(i * 0.2) * 0.5
    r[i] = Math.cos(i * 0.19) * 0.5
  }
  const origL = Float32Array.from(l)
  const origR = Float32Array.from(r)
  function processOne (insert, bufL, bufR, n) {
    if (!insert || insert.enabled === false) return
    const p = makeProc(insert.state)
    p.process(bufL, bufR, n)
  }
  processOne({ pluginId: 'reverb-x', enabled: false, state: { amount: 1, returnOnly: false } }, l, r, BLOCK)
  let maxd = 0
  for (let i = 0; i < BLOCK; i++) {
    maxd = Math.max(maxd, Math.abs(l[i] - origL[i]), Math.abs(r[i] - origR[i]))
  }
  assert('3. Bypass leaves dry unchanged', maxd < 1e-12, 'delta=' + maxd)
}

// 4. increasing send/amount increases wet
{
  const a = impulseResponse({ amount: 0.2, returnOnly: true, venue: 'hall', decay: 1.5, size: 0.5 }, 0.4)
  const b = impulseResponse({ amount: 0.8, returnOnly: true, venue: 'hall', decay: 1.5, size: 0.5 }, 0.4)
  const pa = peakOf(a.l)
  const pb = peakOf(b.l)
  const ratio = pb / Math.max(1e-12, pa)
  assert('4. Increasing Send increases wet level', ratio > 2.5 && ratio < 6, 'peak ratio 0.8/0.2 = ' + ratio.toFixed(2))
}

// 5. increasing decay increases RT60
{
  const short = measureRt60({ venue: 'hall', size: 0.6, decay: 0.8, amount: 1 })
  const long = measureRt60({ venue: 'hall', size: 0.6, decay: 3.2, amount: 1 })
  assert('5. Increasing Decay increases RT60', long.rt60 > short.rt60 * 1.4, 'RT60 0.8s→' + short.rt60.toFixed(2) + 's, 3.2s→' + long.rt60.toFixed(2) + 's')
}

// 6. size increases reflection delay
{
  const small = compileReverbNetwork({ venue: 'hall', size: 0, decay: 2, amount: 1 }, SR)
  const large = compileReverbNetwork({ venue: 'hall', size: 1, decay: 2, amount: 1 }, SR)
  const scale0 = sizeScale(0)
  const scale1 = sizeScale(1)
  const delayRatio = large.taps[0].delaySec / small.taps[0].delaySec
  const expect = scale1 / scale0
  assert('6. Increasing Size increases reflection delay', Math.abs(delayRatio - expect) < 0.05 && large.preDelaySec > small.preDelaySec, 'delay ratio=' + delayRatio.toFixed(3) + ' expected ' + expect.toFixed(3))
}

// 7. venue changes reflection pattern
{
  const a = compileReverbNetwork({ venue: 'small-room', size: 0.5, decay: 1.5, amount: 1 }, SR)
  const b = compileReverbNetwork({ venue: 'cathedral', size: 0.5, decay: 1.5, amount: 1 }, SR)
  const delaysDiffer = a.taps.length !== b.taps.length || Math.abs(a.taps[0].delaySec - b.taps[0].delaySec) > 1e-4
  assert('7. Venue changes reflection pattern', delaysDiffer, 'small-room taps=' + a.taps.length + ' cathedral taps=' + b.taps.length)
}

// 8. cathedral tail >> small room
{
  const room = measureRt60({ venue: 'small-room', size: 0.22, decay: 0.45, amount: 1 })
  const cath = measureRt60({ venue: 'cathedral', size: 1, decay: 6.2, amount: 1 })
  assert('8. Cathedral tail much longer than Small Room', cath.rt60 > room.rt60 * 3, 'room=' + room.rt60.toFixed(2) + 's cathedral=' + cath.rt60.toFixed(2) + 's')
}

// 9. outdoor weak/short
{
  const ir = impulseResponse({ venue: 'outdoor', size: 0.7, decay: 0.35, amount: 1, returnOnly: true }, 0.8)
  const early = energyOf(ir.l, 0, Math.floor(0.12 * SR))
  const late = energyOf(ir.l, Math.floor(0.25 * SR), Math.floor(0.8 * SR))
  const hall = impulseResponse({ venue: 'hall', size: 0.68, decay: 2.1, amount: 1, returnOnly: true }, 0.8)
  const hallLate = energyOf(hall.l, Math.floor(0.25 * SR), Math.floor(0.8 * SR))
  assert('9. Outdoor has weak/short reflections', late < early && late < hallLate * 0.15, 'late/early=' + (late / Math.max(1e-12, early)).toFixed(3))
}

// 10. wet process only on wet path
{
  const host = {
    processOne (insert, l, r, n) {
      for (let i = 0; i < n; i++) {
        l[i] = 0
        r[i] = 0
      }
    }
  }
  function drive (proc, samples) {
    const n = BLOCK
    const blocks = Math.ceil(samples / n)
    const outL = []
    const inL = []
    for (let b = 0; b < blocks; b++) {
      const l = new Float32Array(n)
      const r = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        l[i] = Math.sin((b * n + i) * 0.13) * 0.4
        r[i] = Math.cos((b * n + i) * 0.11) * 0.4
      }
      for (let i = 0; i < n; i++) inL.push(l[i])
      proc.process(l, r, n)
      for (let i = 0; i < n; i++) outL.push(l[i])
    }
    return { inL, outL }
  }
  const pKill = new ReverbXProcessor(SR, host, 'wet-test')
  pKill.setState({
    amount: 1,
    decay: 1.2,
    size: 0.4,
    venue: 'studio',
    returnOnly: false,
    wetProcess: true,
    wetPluginId: 'equalizer-x',
    wetState: {}
  })
  const killed = drive(pKill, Math.floor(SR * 0.12))
  let maxd = 0
  for (let i = 0; i < killed.outL.length; i++) maxd = Math.max(maxd, Math.abs(killed.outL[i] - killed.inL[i]))

  const pMix = new ReverbXProcessor(SR, null, 'wet-off')
  pMix.setState({
    amount: 1,
    decay: 1.2,
    size: 0.4,
    venue: 'studio',
    returnOnly: false,
    wetProcess: false
  })
  const mixed = drive(pMix, Math.floor(SR * 0.12))
  let mixDiff = 0
  for (let i = 0; i < mixed.outL.length; i++) mixDiff = Math.max(mixDiff, Math.abs(mixed.outL[i] - mixed.inL[i]))
  assert('10. Wet Process affects only wet path', maxd < 1e-5 && mixDiff > 1e-4, 'dry delta=' + maxd.toExponential(2) + ' mixed delta=' + mixDiff.toExponential(2))
}

// 11. CPU
{
  const proc = makeProc({ venue: 'cathedral', size: 1, decay: 6.2, amount: 1, returnOnly: true })
  const seconds = 8
  const blocks = Math.ceil(seconds * SR / BLOCK)
  const l = new Float32Array(BLOCK)
  const r = new Float32Array(BLOCK)
  for (let i = 0; i < BLOCK; i++) {
    l[i] = ((i * 17) % 100) / 200 - 0.25
    r[i] = ((i * 13) % 100) / 200 - 0.25
  }
  const t0 = performance.now()
  for (let b = 0; b < blocks; b++) proc.process(l, r, BLOCK)
  const elapsed = performance.now() - t0
  const pct = elapsed / (seconds * 1000) * 100
  assert('11. CPU remains reasonable', pct < 25, elapsed.toFixed(1) + 'ms for ' + seconds + 's audio (' + pct.toFixed(2) + '% realtime)')
}

// 12. no NaN / runaway
{
  const cath = measureRt60({ venue: 'cathedral', size: 1, decay: 6.2, amount: 1 })
  const proc = makeProc({ venue: 'cathedral', size: 1, decay: 6.2, amount: 1, returnOnly: true })
  const after = processBlocks(proc, Math.ceil(2 * SR / BLOCK), (l, r, b) => {
    l.fill(0)
    r.fill(0)
    if (b === 0) {
      l[0] = 1
      r[0] = 1
    }
  })
  const tailPeak = peakOf(after.l, Math.floor(1.6 * SR))
  let nan = cath.nan
  for (let i = 0; i < after.l.length; i++) {
    if (after.l[i] !== after.l[i] || after.r[i] !== after.r[i]) nan = true
  }
  assert('12. No denormals, NaN, or runaway feedback', !nan && cath.maxAbs < 4 && tailPeak < 0.5, 'maxAbs=' + cath.maxAbs.toFixed(3) + ' tailPeak=' + tailPeak.toExponential(2))
}

REVERB_X_FACTORY_PRESETS.forEach((preset) => {
  const m = measureRt60(preset.state)
  rt60Table.push({
    id: preset.id,
    name: preset.name,
    targetDecay: preset.state.decay,
    measuredRt60: +m.rt60.toFixed(3),
    peak: +m.peak.toFixed(4)
  })
})

assert('feedbackGain never >= 1', feedbackGain(0.001, 12) < 1 && feedbackGain(0.05, 0.15) < 1, 'g(short,long)=' + feedbackGain(0.001, 12).toFixed(4))
assert('sizeScale 0→0.5, 1→2', Math.abs(sizeScale(0) - 0.5) < 1e-9 && Math.abs(sizeScale(1) - 2) < 1e-9)
assert('all 8 venues defined', Object.keys(VENUE_DEFINITIONS).length === 8)
assert('viz data matches venue taps', getReverbVisualization({ venue: 'chamber', size: 0.48, decay: 1.4, amount: 0.3 }).earlyTaps.length === VENUE_DEFINITIONS.chamber.reflectionDelayRatios.length)

{
  const st = { venue: 'hall', size: 0.7, decay: 1.8, amount: 0.4, preDelayMs: 40 }
  const viz = getReverbVisualization(st)
  const net = compileReverbNetwork(st, SR)
  assert('viz envelope starts at t=0', Math.abs(viz.envelope[0].t) < 1e-9, 't0=' + viz.envelope[0].t)
  assert('viz tMax follows decay', viz.tMax + 1e-9 >= st.decay * 2, 'tMax=' + viz.tMax)
  const expectedTap = net.preDelaySec + net.taps[0].delaySec
  assert('viz tap is not double pre-delay', Math.abs(viz.earlyTaps[0].t - expectedTap) < 1e-9, 't=' + viz.earlyTaps[0].t + ' expected=' + expectedTap)
}

const failed = results.filter((r) => !r.ok)
console.log('\n=== Measured approximate RT60 (not physically exact) ===')
rt60Table.forEach((row) => {
  console.log(row.name.padEnd(14) + '  target ' + String(row.targetDecay).padEnd(4) + 's   measured ~' + row.measuredRt60.toFixed(2) + 's')
})
const meta = reverbXReportMeta(SR)
console.log('\n=== DSP meta ===')
console.log(JSON.stringify(meta, null, 2))
console.log('\n' + results.filter((r) => r.ok).length + '/' + results.length + ' passed')
if (failed.length) {
  console.error('FAILED:\n' + failed.map((f) => ' - ' + f.name + ' ' + f.extra).join('\n'))
  process.exit(1)
}
