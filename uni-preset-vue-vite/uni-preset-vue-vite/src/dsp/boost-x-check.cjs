/** Node checks for BoostXProcessor (equations + mode behaviour). */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const srcFile = path.join(__dirname, 'boost-x-processor.js')
const text = fs.readFileSync(srcFile, 'utf8')
const start = text.indexOf('`')
const end = text.lastIndexOf('`')
if (start < 0 || end <= start) throw new Error('Could not extract BoostXProcessor source')
const processorSrc = text.slice(start + 1, end)

function tanhApprox (x) {
  const y = Math.max(-3, Math.min(3, x))
  return y * (27 + y * y) / (27 + 9 * y * y)
}

class DelayLine {
  constructor (n) {
    this.b = new Float32Array(Math.max(4, n | 0))
    this.n = this.b.length
    this.w = 0
  }
  write (x) { this.b[this.w] = x; this.w++; if (this.w >= this.n) this.w = 0 }
  tap (d) {
    const n = this.n
    let r = this.w - (d | 0)
    r %= n
    if (r < 0) r += n
    return this.b[r]
  }
  tapLin (d) {
    const n = this.n
    const b = this.b
    let r = this.w - d
    r %= n
    if (r < 0) r += n
    const i0 = r | 0
    let i1 = i0 + 1
    if (i1 >= n) i1 = 0
    const f = r - i0
    return b[i0] + (b[i1] - b[i0]) * f
  }
}

const sandbox = { DelayLine, tanhApprox, Math, Float32Array, console }
vm.runInNewContext(processorSrc + '\nthis.BoostXProcessor = BoostXProcessor', sandbox)
const BoostXProcessor = sandbox.BoostXProcessor

const SR = 48000
const INV = Math.SQRT1_2
let failed = 0

function assert (cond, name) {
  if (!cond) {
    failed++
    console.error('FAIL', name)
  } else {
    console.log('ok  ', name)
  }
}

function rms (a) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * a[i]
  return Math.sqrt(s / a.length)
}

function peak (a, b) {
  let p = 0
  for (let i = 0; i < a.length; i++) {
    const x = Math.abs(a[i])
    const y = b ? Math.abs(b[i]) : 0
    if (x > p) p = x
    if (y > p) p = y
  }
  return p
}

function sideRms (l, r) {
  let s = 0
  for (let i = 0; i < l.length; i++) {
    const side = (l[i] - r[i]) * INV
    s += side * side
  }
  return Math.sqrt(s / l.length)
}

function midRms (l, r) {
  let s = 0
  for (let i = 0; i < l.length; i++) {
    const m = (l[i] + r[i]) * INV
    s += m * m
  }
  return Math.sqrt(s / l.length)
}

function maxDiff (a, b) {
  let m = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    if (d > m) m = d
  }
  return m
}

function run (mode, amount, character, fill, seconds, settle) {
  const proc = new BoostXProcessor(SR)
  const n = 128
  const blocks = Math.ceil(SR * seconds / n)
  const skip = Math.ceil(SR * (settle || 0) / n)
  let accL = 0
  let accR = 0
  let accN = 0
  let lastL = null
  let lastR = null
  let t = 0
  let finite = true
  let pk = 0
  for (let b = 0; b < blocks; b++) {
    const l = new Float32Array(n)
    const r = new Float32Array(n)
    fill(l, r, t)
    const inL = Float32Array.from(l)
    const inR = Float32Array.from(r)
    proc.process(l, r, n, { mode, amount, character })
    for (let i = 0; i < n; i++) {
      if (l[i] !== l[i] || r[i] !== r[i] || l[i] === Infinity || r[i] === Infinity) finite = false
      const p = Math.max(Math.abs(l[i]), Math.abs(r[i]))
      if (p > pk) pk = p
    }
    t += n
    if (b >= skip) {
      accL += rms(l)
      accR += rms(r)
      accN++
      lastL = l
      lastR = r
      lastL._in = inL
      lastR._in = inR
    }
  }
  return {
    proc,
    finite,
    peak: pk,
    rmsL: accL / Math.max(1, accN),
    rmsR: accR / Math.max(1, accN),
    lastL,
    lastR
  }
}

function sineFill (freq, ampL, ampR, phaseR) {
  const w = 2 * Math.PI * freq / SR
  return (l, r, t0) => {
    for (let i = 0; i < l.length; i++) {
      const t = t0 + i
      l[i] = ampL * Math.sin(w * t)
      r[i] = ampR * Math.sin(w * t + (phaseR || 0))
    }
  }
}

function noiseFill (amp) {
  return (l, r) => {
    for (let i = 0; i < l.length; i++) {
      l[i] = (Math.random() * 2 - 1) * amp
      r[i] = (Math.random() * 2 - 1) * amp
    }
  }
}

// Equations
{
  const l = 0.4, r = -0.2
  const M = (l + r) * INV
  const S = (l - r) * INV
  const l2 = (M + S) * INV
  const r2 = (M - S) * INV
  assert(Math.abs(l2 - l) < 1e-12 && Math.abs(r2 - r) < 1e-12, 'M/S roundtrip (1/sqrt(2))')
  const mono = 0.3
  const Mm = (mono + mono) * INV
  const Sm = (mono - mono) * INV
  assert(Math.abs(Sm) < 1e-12, 'mono side is 0')
  assert(Math.abs((Mm + Sm) * INV - mono) < 1e-12, 'mono reconstructs')
}

{
  const downThresh = -12
  const levelDb = -6
  const ratioDown = 8
  const compressionGainDb = (1 - 1 / ratioDown) * (downThresh - levelDb)
  assert(compressionGainDb < 0, 'downward gain is negative above threshold')
  const upThresh = -32
  const quietDb = -44
  const ratioUp = 4
  let upwardGainDb = (1 - 1 / ratioUp) * (upThresh - quietDb)
  if (upwardGainDb > 12) upwardGainDb = 12
  assert(upwardGainDb > 0 && upwardGainDb <= 12, 'upward gain is positive and clamped')
}

{
  const x = 0.5
  const y = Math.tanh(4 * x)
  assert(y === y && Math.abs(y) < 1, 'tanh drive is finite and bounded')
}

// Stereo expander
{
  const out = run('expander', 1, 'wide', sineFill(1000, 0.25, 0.25, 0), 0.12, 0.04)
  const last = out.lastL
  let maxC = 0
  for (let i = 0; i < last.length; i++) maxC = Math.max(maxC, Math.abs(last[i] - out.lastR[i]))
  assert(maxC < 1e-5, 'expander: mono input remains centered')
}

{
  const fill = sineFill(1000, 0.3, 0.2, 0.4)
  const z = run('expander', 0, 'wide', fill, 0.08, 0.02)
  let err = 0
  for (let i = 0; i < z.lastL.length; i++) {
    err = Math.max(err, Math.abs(z.lastL[i] - z.lastL._in[i]), Math.abs(z.lastR[i] - z.lastR._in[i]))
  }
  assert(err < 2e-5, 'expander: Boost=0 is bypass')
}

{
  const fill = sineFill(2000, 0.35, 0.22, 0.9)
  const a = run('expander', 0.2, 'wide', fill, 0.1, 0.04)
  const b = run('expander', 1, 'wide', fill, 0.1, 0.04)
  const sideA = sideRms(a.lastL, a.lastR)
  const sideB = sideRms(b.lastL, b.lastR)
  assert(sideB > sideA * 1.15, 'expander: increasing Boost widens stereo')
}

{
  const fillLow = sineFill(80, 0.4, 0.15, 0.8)
  const fillHigh = sineFill(4000, 0.4, 0.15, 0.8)
  const low = run('expander', 1, 'wide', fillLow, 0.15, 0.06)
  const high = run('expander', 1, 'wide', fillHigh, 0.15, 0.06)
  const lowRatio = sideRms(low.lastL, low.lastR) / (midRms(low.lastL, low.lastR) + 1e-12)
  const highRatio = sideRms(high.lastL, high.lastR) / (midRms(high.lastL, high.lastR) + 1e-12)
  assert(highRatio > lowRatio * 1.05, 'expander: highs expand more than bass')
}

{
  const fill = sineFill(440, 0.4, 0.25, 0.3)
  const out = run('expander', 1, 'wide', fill, 0.1, 0.04)
  let corr = 0, l2 = 0, r2 = 0
  for (let i = 0; i < out.lastL.length; i++) {
    corr += out.lastL[i] * out.lastR[i]
    l2 += out.lastL[i] * out.lastL[i]
    r2 += out.lastR[i] * out.lastR[i]
  }
  const c = corr / (Math.sqrt(l2 * r2) + 1e-12)
  assert(c > 0.15, 'expander: correlation stays reasonable (no polarity flip)')
}

// OTT
{
  const fill = sineFill(1000, 0.2, 0.2, 0)
  const z = run('ott', 0, 'clean', fill, 0.08, 0.02)
  let err = 0
  for (let i = 0; i < z.lastL.length; i++) err = Math.max(err, Math.abs(z.lastL[i] - z.lastL._in[i]))
  assert(err < 2e-5, 'OTT: Boost=0 is bypass')
}

{
  const quietFill = sineFill(2000, 0.008, 0.008, 0)
  const dry = run('ott', 0, 'clean', quietFill, 0.35, 0.18)
  const wet = run('ott', 1, 'clean', quietFill, 0.35, 0.18)
  assert(wet.rmsL > dry.rmsL * 1.2, 'OTT: low-level detail is raised (' + dry.rmsL.toFixed(4) + ' → ' + wet.rmsL.toFixed(4) + ')')
}

{
  const loud = run('ott', 1, 'aggressive', sineFill(200, 0.9, 0.9, 0), 0.25, 0.12)
  assert(loud.peak <= 1.001, 'OTT: loud peaks are controlled (' + loud.peak.toFixed(3) + ')')
}

{
  const floor = run('ott', 1, 'aggressive', sineFill(3000, 1e-6, 1e-6, 0), 0.2, 0.08)
  assert(floor.finite && floor.peak < 0.05, 'OTT: no runaway noise gain')
}

{
  const dense = run('ott', 1, 'clean', noiseFill(0.12), 0.2, 0.1)
  const dry = run('ott', 0, 'clean', noiseFill(0.12), 0.2, 0.1)
  assert(dense.finite && dense.peak < 2, 'OTT: dense processing stays finite/safe')
  assert(Math.abs(dry.rmsL - 0.12 / Math.sqrt(3)) < 0.08 || dry.finite, 'OTT: dry noise remains finite')
}

// Chorus
{
  const fill = sineFill(500, 0.3, 0.3, 0)
  const out = run('chorus', 0.8, 'wide', fill, 0.25, 0.08)
  let stereo = 0
  for (let i = 0; i < out.lastL.length; i++) stereo = Math.max(stereo, Math.abs(out.lastL[i] - out.lastR[i]))
  let diff = 0
  for (let i = 0; i < out.lastL.length; i++) diff = Math.max(diff, Math.abs(out.lastL[i] - out.lastL._in[i]))
  assert(diff > 0.01, 'chorus: modulation audible vs dry')
  assert(stereo > 0.005, 'chorus: stereo movement')
  assert(out.finite, 'chorus: no NaN')
}

{
  const z = run('chorus', 0, 'soft', sineFill(500, 0.3, 0.3, 0), 0.08, 0.02)
  let err = 0
  for (let i = 0; i < z.lastL.length; i++) err = Math.max(err, Math.abs(z.lastL[i] - z.lastL._in[i]))
  assert(err < 2e-5, 'chorus: Boost=0 is bypass')
}

// Distortion
{
  const mild = run('distortion', 0.25, 'warm', sineFill(220, 0.5, 0.5, 0), 0.1, 0.03)
  const hard = run('distortion', 1, 'crunch', sineFill(220, 0.5, 0.5, 0), 0.1, 0.03)
  const errM = maxDiff(mild.lastL, mild.lastL._in)
  const errH = maxDiff(hard.lastL, hard.lastL._in)
  assert(errH > errM * 1.2, 'distortion: more Boost => more saturation')
  assert(hard.finite && hard.peak < 2, 'distortion: output stays safe / finite')
}

{
  const z = run('distortion', 0, 'warm', sineFill(220, 0.5, 0.5, 0), 0.06, 0.02)
  let err = 0
  for (let i = 0; i < z.lastL.length; i++) err = Math.max(err, Math.abs(z.lastL[i] - z.lastL._in[i]))
  assert(err < 2e-5, 'distortion: Boost=0 is bypass')
}

// Mode switch should not explode
{
  const proc = new BoostXProcessor(SR)
  const n = 128
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  for (let i = 0; i < n; i++) { l[i] = 0.2; r[i] = -0.1 }
  proc.process(l, r, n, { mode: 'ott', amount: 0.7 })
  for (let i = 0; i < n; i++) { l[i] = 0.2; r[i] = -0.1 }
  proc.process(l, r, n, { mode: 'expander', amount: 0.7 })
  let ok = true
  for (let i = 0; i < n; i++) if (l[i] !== l[i] || Math.abs(l[i]) > 4) ok = false
  assert(ok, 'mode switch ott→expander stays finite')
}

if (failed) {
  console.error('\n' + failed + ' failed')
  process.exit(1)
}
console.log('\nall checks passed')
