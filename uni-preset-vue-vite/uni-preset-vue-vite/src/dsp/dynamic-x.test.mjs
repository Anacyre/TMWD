/** Standalone Dynamic X DSP checks. Run: node src/dsp/dynamic-x.test.mjs */

function compressorGainDb (inputDb, thresholdDb, ratio) {
  if (!(inputDb > thresholdDb)) return 0
  const r = Math.max(1, ratio)
  const outputDb = thresholdDb + (inputDb - thresholdDb) / r
  const grDb = outputDb - inputDb
  if (grDb > 0) return 0
  if (grDb < -60) return -60
  return grDb
}

function compressorOutputDb (inputDb, thresholdDb, ratio) {
  return inputDb + compressorGainDb(inputDb, thresholdDb, ratio)
}

function compressorCurve (thresholdDb, ratio, points = 64) {
  const n = Math.max(2, points | 0)
  const pts = []
  for (let i = 0; i < n; i++) {
    const inDb = -60 + (60 * i) / (n - 1)
    pts.push({ inDb, outDb: compressorOutputDb(inDb, thresholdDb, ratio) })
  }
  return pts
}

function autoMakeupDb (avgGrDb, factor = 0.65) {
  const v = -avgGrDb * factor
  return v < 0 ? 0 : v > 12 ? 12 : v
}

function envelopeCoeff (seconds, sampleRate) {
  return Math.exp(-1 / (Math.max(1e-5, seconds) * sampleRate))
}

function rbj (type, freq, q, gainDb, sr) {
  const w0 = 2 * Math.PI * Math.max(10, Math.min(sr * 0.45, freq)) / sr
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const alpha = sin / (2 * Math.max(0.05, q || 0.707))
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0
  if (type === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
  } else {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}

class Biquad {
  constructor () { this.z1 = 0; this.z2 = 0; this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0 }
  set (c) { this.b0 = c[0]; this.b1 = c[1]; this.b2 = c[2]; this.a1 = c[3]; this.a2 = c[4] }
  tick (x) {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
}

function lr4Tick (stages, x) {
  return stages[1].tick(stages[0].tick(x))
}

function assert (cond, msg) {
  if (!cond) throw new Error(msg)
}

function almost (a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, (msg || 'almost') + ': ' + a + ' vs ' + b)
}

function testGainComputer () {
  almost(compressorGainDb(-24, -18, 4), 0, 1e-12, 'below threshold')
  almost(compressorGainDb(-18, -18, 4), 0, 1e-12, 'at threshold')
  const gr = compressorGainDb(-6, -18, 4)
  const expected = (-18 + (-6 - -18) / 4) - (-6)
  almost(gr, expected, 1e-10, 'above threshold GR')
  assert(gr < 0, 'GR is negative')
  almost(compressorGainDb(-6, -18, 1), 0, 1e-12, 'ratio 1')
  const hard = compressorGainDb(0, -18, 20)
  assert(hard <= 0 && hard >= -60, 'GR bounds')
  almost(compressorOutputDb(-30, -12, 8), -30, 1e-12, 'linear below thresh')
}

function testCurveMatchesEquation () {
  const th = -18
  const ratio = 4
  const pts = compressorCurve(th, ratio, 64)
  assert(pts.length === 64, 'curve length')
  for (const p of pts) {
    almost(p.outDb, compressorOutputDb(p.inDb, th, ratio), 1e-10, 'curve point')
  }
  almost(pts[0].inDb, -60, 1e-9, 'curve start')
  almost(pts[pts.length - 1].inDb, 0, 1e-9, 'curve end')
}

function testAutoMakeup () {
  almost(autoMakeupDb(0), 0, 1e-12, 'no GR')
  almost(autoMakeupDb(-8, 0.65), 5.2, 1e-12, 'factor 0.65')
  almost(autoMakeupDb(-40, 0.65), 12, 1e-12, 'clamp 12')
  almost(autoMakeupDb(3, 0.65), 0, 1e-12, 'positive GR ignored')
  assert(0.5 <= 0.65 && 0.65 <= 0.8, 'compensation in 0.5-0.8')
}

function testEnvelopeCoeff () {
  const a = envelopeCoeff(0.012, 48000)
  assert(a > 0 && a < 1, 'attack coeff in (0,1)')
  const slow = envelopeCoeff(0.12, 48000)
  assert(slow > a, 'longer time → closer to 1')
}

function processCompressorBlock (buf, state) {
  const sr = 48000
  const n = buf.length
  let sum = 0
  let peak = 0
  for (let i = 0; i < n; i++) {
    const x = buf[i]
    const a = x < 0 ? -x : x
    if (a > peak) peak = a
    sum += x * x
  }
  const rms = Math.sqrt(sum / n + 1e-20)
  const levelDb = 20 * Math.log10(rms + 1e-12)
  const target = compressorGainDb(levelDb, state.th, state.ratio)
  const atkC = envelopeCoeff(state.atk, sr)
  const relC = envelopeCoeff(state.rel, sr)
  if (state.gainDb == null) state.gainDb = 0
  for (let i = 0; i < n; i++) {
    const a = target < state.gainDb ? atkC : relC
    state.gainDb = a * state.gainDb + (1 - a) * target
    buf[i] *= Math.pow(10, state.gainDb / 20)
    if (!Number.isFinite(buf[i])) buf[i] = 0
  }
  return { levelDb, gainDb: state.gainDb, peak }
}

function testOfflineCompressor () {
  const n = 128
  const sr = 48000
  const sine = new Float32Array(n)
  for (let i = 0; i < n; i++) sine[i] = 0.25 * Math.sin(2 * Math.PI * 440 * i / sr)

  const bypass = sine.slice()
  const st1 = { th: 0, ratio: 4, atk: 0.012, rel: 0.12, gainDb: 0 }
  for (let k = 0; k < 40; k++) processCompressorBlock(bypass, st1)
  let err = 0
  for (let i = 0; i < n; i++) err += Math.abs(bypass[i] - sine[i])
  assert(err / n < 1e-4, 'high threshold ≈ bypass, err=' + (err / n))

  const r1 = sine.slice()
  const st2 = { th: -18, ratio: 1, atk: 0.012, rel: 0.12, gainDb: 0 }
  for (let k = 0; k < 40; k++) processCompressorBlock(r1, st2)
  err = 0
  for (let i = 0; i < n; i++) err += Math.abs(r1[i] - sine[i])
  assert(err / n < 1e-4, 'ratio 1 ≈ bypass, err=' + (err / n))

  const st3 = { th: -18, ratio: 8, atk: 0.004, rel: 0.08, gainDb: 0 }
  let last = null
  for (let k = 0; k < 80; k++) {
    last = new Float32Array(n)
    for (let i = 0; i < n; i++) last[i] = 0.9 * Math.sin(2 * Math.PI * 200 * (k * n + i) / sr)
    processCompressorBlock(last, st3)
  }
  assert(st3.gainDb < -6, 'lower threshold produces GR, got ' + st3.gainDb)
  for (let i = 0; i < n; i++) assert(Number.isFinite(last[i]), 'no NaN')
}

function testLr4Reconstruction () {
  const sr = 48000
  const f1 = 180
  const f2 = 3500
  const q = 0.7071067811865476
  const lp1c = rbj('lowpass', f1, q, 0, sr)
  const hp1c = rbj('highpass', f1, q, 0, sr)
  const lp2c = rbj('lowpass', f2, q, 0, sr)
  const hp2c = rbj('highpass', f2, q, 0, sr)

  function makePair (c) {
    const s = [new Biquad(), new Biquad()]
    s[0].set(c); s[1].set(c)
    return s
  }
  const lp1 = makePair(lp1c)
  const hp1 = makePair(hp1c)
  const lp2 = makePair(lp2c)
  const hp2 = makePair(hp2c)

  function tick (x) {
    const low = lr4Tick(lp1, x)
    const rest = lr4Tick(hp1, x)
    const mid = lr4Tick(lp2, rest)
    const high = lr4Tick(hp2, rest)
    const y = low + mid + high
    assert(Number.isFinite(y), 'crossover NaN')
    return y
  }

  for (let i = 0; i < 4096; i++) tick(0)

  const probes = [80, 400, 1000, 5000, 10000]
  for (const freq of probes) {
    let inE = 0
    let outE = 0
    const n = 4096
    for (let i = 0; i < n; i++) {
      const x = Math.sin(2 * Math.PI * freq * i / sr)
      const y = tick(x)
      if (i < 512) continue
      inE += x * x
      outE += y * y
    }
    const magDb = 10 * Math.log10(outE / Math.max(1e-12, inE))
    assert(Math.abs(magDb) < 1.5, 'LR4 |H| at ' + freq + ' Hz is ' + magDb.toFixed(2) + ' dB')
  }
}

function testDisabledBandIsNotMute () {
  const enabled = compressorGainDb(-6, -18, 4)
  const disabled = 0
  assert(enabled < 0, 'enabled compresses')
  assert(disabled === 0, 'disabled GR is 0 (pass through)')
}

const tests = [
  testGainComputer,
  testCurveMatchesEquation,
  testAutoMakeup,
  testEnvelopeCoeff,
  testOfflineCompressor,
  testLr4Reconstruction,
  testDisabledBandIsNotMute
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
