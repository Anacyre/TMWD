/** Standalone Limiter X DSP checks. Run: node src/dsp/limiter-x.test.mjs */

import {
  LIMITER_X_THRESHOLD_DB,
  LIMITER_X_PROCESSOR_SOURCE,
  limiterDbToLin,
  limiterCeilingLin,
  targetGainReductionDb,
  limiterReleaseCoeff,
  normalizeLimiterState,
  defaultLimiterState,
  createLimiterProcessor
} from './limiter-x.js'
import { plugins } from './registry.js'

function assert (cond, msg) {
  if (!cond) throw new Error(msg)
}

function almost (a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, (msg || 'almost') + ': ' + a + ' vs ' + b)
}

function peakOf (l, r) {
  let p = 0
  for (let i = 0; i < l.length; i++) {
    const a = Math.abs(l[i])
    const b = r ? Math.abs(r[i]) : 0
    if (a > p) p = a
    if (b > p) p = b
  }
  return p
}

function fillSine (buf, sr, freq, amp, phase = 0) {
  for (let i = 0; i < buf.length; i++) buf[i] = amp * Math.sin(2 * Math.PI * freq * i / sr + phase)
}

function processSeconds (proc, sr, seconds, ampL, ampR, state, freq = 440) {
  const n = 128
  const blocks = Math.max(1, Math.round(seconds * sr / n))
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  let lastPeak = 0
  for (let k = 0; k < blocks; k++) {
    for (let i = 0; i < n; i++) {
      const t = (k * n + i) / sr
      l[i] = ampL * Math.sin(2 * Math.PI * freq * t)
      r[i] = ampR * Math.sin(2 * Math.PI * freq * t)
    }
    proc.process(l, r, n, state)
    lastPeak = peakOf(l, r)
  }
  return { l, r, peak: lastPeak, grDb: proc.meters.gainReductionDb, outDb: proc.meters.outputPeakDb }
}

function testMath () {
  almost(limiterDbToLin(0), 1, 1e-12, '0 dB is unity')
  almost(targetGainReductionDb(-6, -0.1), 0, 1e-12, 'below ceiling → no GR')
  almost(targetGainReductionDb(-0.1, -0.1), 0, 1e-12, 'at ceiling → no GR')
  almost(targetGainReductionDb(2, -0.1), -2.1, 1e-9, '+2 dB peak → -2.1 dB GR')
  const a10 = limiterReleaseCoeff(10, 48000)
  const a1000 = limiterReleaseCoeff(1000, 48000)
  assert(a10 > 0 && a10 < 1, '10 ms coeff in (0,1)')
  assert(a1000 > a10, 'longer release → coeff closer to 1')
  const st = normalizeLimiterState({ gainDb: 99, releaseMs: 1, extra: true })
  almost(st.gainDb, 18, 1e-9, 'gain clamp +18')
  almost(st.releaseMs, 10, 1e-9, 'release clamp 10 ms')
  const d = defaultLimiterState()
  almost(d.gainDb, 0, 1e-12, 'default gain 0')
  almost(d.releaseMs, 100, 1e-12, 'default release 100')
}

function testBelowCeilingNoGr () {
  const sr = 48000
  const proc = createLimiterProcessor(sr)
  const result = processSeconds(proc, sr, 0.25, 0.4, 0.4, { gainDb: 0, releaseMs: 100 })
  assert(result.grDb > -0.15, 'no unnecessary GR, got ' + result.grDb)
  assert(result.peak < limiterCeilingLin(), 'output under ceiling')
}

function testPlusSixStaysUnderCeiling () {
  const ceiling = limiterCeilingLin()
  for (const sr of [44100, 48000, 96000]) {
    const proc = createLimiterProcessor(sr)
    const result = processSeconds(proc, sr, 0.35, 1, 1, { gainDb: 6, releaseMs: 100 }, 1000)
    assert(result.peak <= ceiling + 1e-4, sr + ' Hz peak ' + result.peak + ' exceeds ceiling ' + ceiling)
    assert(result.grDb < -4, sr + ' Hz should reduce, GR=' + result.grDb)
  }
}

function testReleaseSpeed () {
  function recover (releaseMs) {
    const sr = 48000
    const proc = createLimiterProcessor(sr)
    processSeconds(proc, sr, 0.2, 1, 1, { gainDb: 12, releaseMs }, 200)
    assert(proc.meters.gainReductionDb < -6, 'should be limiting before release, GR=' + proc.meters.gainReductionDb)
    const n = 64
    const l = new Float32Array(n)
    const r = new Float32Array(n)
    let samples = 0
    for (let k = 0; k < 8000; k++) {
      l.fill(0)
      r.fill(0)
      proc.process(l, r, n, { gainDb: 12, releaseMs })
      samples += n
      if (proc.meters.gainReductionDb > -0.4) return samples
    }
    return samples
  }
  const fast = recover(10)
  const slow = recover(1000)
  assert(fast < slow / 8, '10 ms recovers faster than 1000 ms (' + fast + ' vs ' + slow + ')')
}

function testStereoLink () {
  const sr = 48000
  const proc = createLimiterProcessor(sr)
  const n = 128
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  for (let k = 0; k < 80; k++) {
    for (let i = 0; i < n; i++) {
      const s = Math.sin(2 * Math.PI * 220 * (k * n + i) / sr)
      l[i] = s
      r[i] = s * 0.15
    }
    proc.process(l, r, n, { gainDb: 8, releaseMs: 80 })
  }
  let ratioErr = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    if (Math.abs(l[i]) < 1e-4) continue
    const ratio = Math.abs(r[i] / l[i])
    ratioErr += Math.abs(ratio - 0.15)
    count++
  }
  assert(count > 10, 'enough samples for ratio')
  assert(ratioErr / count < 0.02, 'linked GR keeps L/R ratio, err=' + (ratioErr / count))
}

function testSilenceStable () {
  const proc = createLimiterProcessor(48000)
  const n = 256
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  for (let k = 0; k < 40; k++) {
    proc.process(l, r, n, { gainDb: 0, releaseMs: 100 })
    for (let i = 0; i < n; i++) {
      assert(Number.isFinite(l[i]) && Number.isFinite(r[i]), 'silence produced NaN/Inf')
    }
  }
  assert(Number.isFinite(proc.meters.gainReductionDb), 'GR meter finite')
  assert(proc.env === proc.env && proc.env !== 0, 'envelope finite')
}

function testParameterSemantics () {
  const def = plugins['limiter-x']
  assert(def, 'limiter-x registered')
  assert(def.parameters.some((p) => p.id === 'limiter.gain'), 'limiter.gain')
  assert(def.parameters.some((p) => p.id === 'limiter.release'), 'limiter.release')
  const gain = def.parameters.find((p) => p.id === 'limiter.gain')
  const rel = def.parameters.find((p) => p.id === 'limiter.release')
  almost(gain.min, -12, 0, 'gain min')
  almost(gain.max, 18, 0, 'gain max')
  almost(gain.default, 0, 0, 'gain default')
  almost(rel.min, 10, 0, 'release min')
  almost(rel.max, 1000, 0, 'release max')
  almost(rel.default, 100, 0, 'release default')
  const names = def.presets.map((p) => p.id).join(',')
  assert(names === 'default,clean,orchestral,punch,transparent', 'preset ids: ' + names)
  const punch = def.normalize({ ...def.createState(), ...def.presets.find((p) => p.id === 'punch').state })
  almost(punch.gainDb, 4, 1e-9, 'punch gain')
  almost(punch.releaseMs, 60, 1e-9, 'punch release')
}

function testAutomationNoClicks () {
  const sr = 48000
  const proc = createLimiterProcessor(sr)
  const n = 128
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  fillSine(l, sr, 200, 0.08)
  r.set(l)
  proc.process(l, r, n, { gainDb: 0, releaseMs: 100 })
  fillSine(l, sr, 200, 0.08)
  r.set(l)
  proc.process(l, r, n, { gainDb: 12, releaseMs: 1000 })
  let maxJump = 0
  for (let i = 1; i < n; i++) {
    const d = Math.abs(l[i] - l[i - 1])
    if (d > maxJump) maxJump = d
  }
  for (let i = 0; i < n; i++) assert(Number.isFinite(l[i]), 'automation NaN')
  assert(maxJump < 0.25, 'gain change should be smoothed, jump=' + maxJump)
}

function testSamplePeakFallbackStillSafe () {
  const sr = 48000
  const proc = createLimiterProcessor(sr)
  proc.setPeakMode(0)
  const result = processSeconds(proc, sr, 0.2, 1, 1, { gainDb: 10, releaseMs: 50 }, 800)
  assert(result.peak <= limiterCeilingLin() + 1e-4, 'sample-peak fallback still ceilings')
}

function testCpuBenchmark () {
  const sr = 48000
  const proc = createLimiterProcessor(sr)
  const n = 128
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  fillSine(l, sr, 1000, 0.9)
  r.set(l)
  const blocks = Math.ceil(sr / n)
  const t0 = performance.now()
  for (let k = 0; k < blocks; k++) proc.process(l, r, n, { gainDb: 6, releaseMs: 100 })
  const ms = performance.now() - t0
  const ns = (ms * 1e6) / (blocks * n)
  console.log('cpu  ' + ns.toFixed(1) + ' ns/sample (1s @ 48 kHz, 4x peak detect)')
  assert(ms < 500, '1s offline render should stay well under 500 ms, took ' + ms)
}

function testWorkletSourcePresent () {
  assert(LIMITER_X_PROCESSOR_SOURCE.indexOf('class LimiterXProcessor') >= 0, 'processor source')
  assert(LIMITER_X_THRESHOLD_DB === -0.1, 'fixed threshold')
}

const tests = [
  testMath,
  testBelowCeilingNoGr,
  testPlusSixStaysUnderCeiling,
  testReleaseSpeed,
  testStereoLink,
  testSilenceStable,
  testParameterSemantics,
  testAutomationNoClicks,
  testSamplePeakFallbackStillSafe,
  testCpuBenchmark,
  testWorkletSourcePresent
]

let failed = 0
for (const fn of tests) {
  try {
    fn()
    console.log('ok  ' + fn.name)
  } catch (err) {
    failed++
    console.error('FAIL ' + fn.name + ': ' + err.message)
  }
}
if (failed) {
  console.error(failed + ' failed')
  process.exit(1)
}
console.log(tests.length + ' passed')
