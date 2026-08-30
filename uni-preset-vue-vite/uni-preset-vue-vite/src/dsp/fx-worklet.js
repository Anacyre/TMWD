import { EQUALIZER_X_PROCESSOR_SOURCE } from './equalizer-x-processor.js'
import { BOOST_X_PROCESSOR_SOURCE } from './boost-x-processor.js'
import { DYNAMIC_X_PROCESSOR_SOURCE } from './dynamic-x-processor.js'
import { LIMITER_X_PROCESSOR_SOURCE } from './limiter-x.js'
import { REVERB_X_CORE_SOURCE } from './reverb-x.js'

export const FX_WORKLET_SOURCE = REVERB_X_CORE_SOURCE + EQUALIZER_X_PROCESSOR_SOURCE + `
class DelayLine {
  constructor (n) {
    this.b = new Float32Array(Math.max(4, n|0))
    this.n = this.b.length
    this.w = 0
  }
  write (x) { this.b[this.w] = x; this.w++ ; if (this.w >= this.n) this.w = 0 }
  tap (d) {
    const n = this.n
    let r = this.w - (d|0)
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

class Biquad {
  constructor () { this.z1 = 0; this.z2 = 0; this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0 }
  set (b0,b1,b2,a1,a2) { this.b0=b0; this.b1=b1; this.b2=b2; this.a1=a1; this.a2=a2 }
  reset () { this.z1 = 0; this.z2 = 0 }
  tick (x) {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
}

function rbj (type, freq, q, gainDb, sr) {
  const w0 = 2 * Math.PI * Math.max(10, Math.min(sr * 0.45, freq)) / sr
  const cos = Math.cos(w0), sin = Math.sin(w0)
  const A = Math.pow(10, (gainDb || 0) / 40)
  const alpha = sin / (2 * Math.max(0.05, q || 0.707))
  let b0=1,b1=0,b2=0,a0=1,a1=0,a2=0
  if (type === 'lowcut' || type === 'highpass') {
    b0 = (1+cos)/2; b1 = -(1+cos); b2 = (1+cos)/2; a0 = 1+alpha; a1 = -2*cos; a2 = 1-alpha
  } else if (type === 'highcut' || type === 'lowpass') {
    b0 = (1-cos)/2; b1 = 1-cos; b2 = (1-cos)/2; a0 = 1+alpha; a1 = -2*cos; a2 = 1-alpha
  } else if (type === 'bell') {
    b0 = 1+alpha*A; b1 = -2*cos; b2 = 1-alpha*A; a0 = 1+alpha/A; a1 = -2*cos; a2 = 1-alpha/A
  } else if (type === 'notch') {
    b0 = 1; b1 = -2*cos; b2 = 1; a0 = 1+alpha; a1 = -2*cos; a2 = 1-alpha
  } else if (type === 'lowshelf') {
    const f = 2 * Math.sqrt(A) * alpha
    b0 = A*((A+1)-(A-1)*cos+f); b1 = 2*A*((A-1)-(A+1)*cos); b2 = A*((A+1)-(A-1)*cos-f)
    a0 = (A+1)+(A-1)*cos+f; a1 = -2*((A-1)+(A+1)*cos); a2 = (A+1)+(A-1)*cos-f
  } else if (type === 'highshelf') {
    const f = 2 * Math.sqrt(A) * alpha
    b0 = A*((A+1)+(A-1)*cos+f); b1 = -2*A*((A-1)+(A+1)*cos); b2 = A*((A+1)+(A-1)*cos-f)
    a0 = (A+1)-(A-1)*cos+f; a1 = 2*((A-1)-(A+1)*cos); a2 = (A+1)-(A-1)*cos-f
  } else if (type === 'bandpass') {
    b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1+alpha; a1 = -2*cos; a2 = 1-alpha
  }
  return [b0/a0, b1/a0, b2/a0, a1/a0, a2/a0]
}

function tanhApprox (x) {
  const y = Math.max(-3, Math.min(3, x))
  return y * (27 + y * y) / (27 + 9 * y * y)
}

` + BOOST_X_PROCESSOR_SOURCE + DYNAMIC_X_PROCESSOR_SOURCE + LIMITER_X_PROCESSOR_SOURCE + `

class DawFxChain extends AudioWorkletProcessor {
  constructor () {
    super()
    this.chain = []
    this.enabled = true
    this.sr = sampleRate
    this.reverbs = new Map()
    this.eqs = new Map()
    this.boosts = new Map()
    this.dyns = new Map()
    this.lims = new Map()
    this.pluginMeters = {}
    this.meters = { inPeak: 0, outPeak: 0, inPeakL: 0, inPeakR: 0, outPeakL: 0, outPeakR: 0, wetPeak: 0, gr: 0, grBands: [0,0,0], boostWidth: 0, boostCorr: 1, boostGr: 0, boostActivity: 0 }
    this.chainFft = new EQX_API.SpectrumAnalyzer(this.sr)
    this.block = 0
    this.cpuEma = 0
    this.port.onmessage = (ev) => {
      const m = ev.data
      if (m && m.type === 'set') this.chain = m.chain || []
    }
  }

  memReverb (id) {
    if (!this.reverbs.has(id)) this.reverbs.set(id, new ReverbXProcessor(this.sr, this, id))
    return this.reverbs.get(id)
  }
  memEq (id) {
    if (!this.eqs.has(id)) this.eqs.set(id, new EQX_API.EqualizerXProcessor(this.sr))
    return this.eqs.get(id)
  }
  memBoost (id) {
    if (!this.boosts.has(id)) this.boosts.set(id, new BoostXProcessor(this.sr))
    return this.boosts.get(id)
  }
  memDyn (id) {
    if (!this.dyns.has(id)) this.dyns.set(id, new DynamicXProcessor(this.sr))
    return this.dyns.get(id)
  }
  memLim (id) {
    if (!this.lims.has(id)) this.lims.set(id, new LimiterXProcessor(this.sr))
    return this.lims.get(id)
  }

  processEq (proc, l, r, n, state) {
    proc.setState(state)
    proc.process(l, r, n)
  }

  processReverb (mem, l, r, n, state) {
    mem.setState(state)
    mem.process(l, r, n)
    this.meters.wetPeak = mem.lastWetPeak
    mem.reportedWetPeak = mem.lastWetPeak
  }

  processBoost (mem, l, r, n, state) {
    mem.process(l, r, n, state || {})
    this.meters.boostWidth = mem.width
    this.meters.boostCorr = mem.corr
    this.meters.boostGr = mem.gr
    this.meters.boostActivity = mem.activity
  }

  processDyn (mem, l, r, n, state) {
    mem.process(l, r, n, state || {})
    const m = mem.meters
    this.meters.gr = m.gr
    this.meters.grBands = m.grBands
  }

  processLim (mem, l, r, n, state) {
    mem.process(l, r, n, state || {})
    const m = mem.meters
    this.meters.gr = m.gr
  }

  processOne (insert, l, r, n) {
    if (!insert || insert.enabled === false) return
    const id = insert.instanceId || insert.pluginId
    const st = insert.state || {}
    if (insert.pluginId === 'reverb-x') this.processReverb(this.memReverb(id), l, r, n, st)
    else if (insert.pluginId === 'equalizer-x') this.processEq(this.memEq(id), l, r, n, st)
    else if (insert.pluginId === 'boost-x') this.processBoost(this.memBoost(id), l, r, n, st)
    else if (insert.pluginId === 'dynamic-x') this.processDyn(this.memDyn(id), l, r, n, st)
    else if (insert.pluginId === 'limiter-x') this.processLim(this.memLim(id), l, r, n, st)
  }

  process (inputs, outputs) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0
    const input = inputs[0]
    const output = outputs[0]
    if (!output || !output[0]) return true
    const n = output[0].length
    const srcL = input && input[0] ? input[0] : null
    const srcR = input && input[1] ? input[1] : (srcL)
    const l = output[0]
    const r = output[1] || output[0]
    let inL = 0
    let inR = 0
    for (let i = 0; i < n; i++) {
      const xL = srcL ? srcL[i] : 0
      const xR = srcR ? srcR[i] : xL
      l[i] = xL; r[i] = xR
      const aL = Math.abs(xL)
      const aR = Math.abs(xR)
      if (aL > inL) inL = aL
      if (aR > inR) inR = aR
    }
    for (let p = 0; p < this.chain.length; p++) this.processOne(this.chain[p], l, r, n)
    let outL = 0
    let outR = 0
    for (let i = 0; i < n; i++) {
      const aL = Math.abs(l[i])
      const aR = Math.abs(r[i])
      if (aL > outL) outL = aL
      if (aR > outR) outR = aR
    }
    const m = this.meters
    m.inPeakL = Math.max(m.inPeakL * 0.9, inL)
    m.inPeakR = Math.max(m.inPeakR * 0.9, inR)
    m.outPeakL = Math.max(m.outPeakL * 0.9, outL)
    m.outPeakR = Math.max(m.outPeakR * 0.9, outR)
    m.inPeak = Math.max(m.inPeakL, m.inPeakR)
    m.outPeak = Math.max(m.outPeakL, m.outPeakR)
    this.chainFft.push(l, r, n)
    this.block++
    if (this.block % 16 === 0) {
      if (t0) this.cpuEma = this.cpuEma * 0.9 + (performance.now() - t0) * 0.1
      const eqById = {}
      this.eqs.forEach((proc, id) => {
        eqById[id] = {
          spectrum: proc.getSpectrumArray(),
          spectrumPre: proc.getPreSpectrumArray ? proc.getPreSpectrumArray() : null,
          autoGainDb: proc.autoGainDb,
          autoGain: proc.autoOn
        }
      })
      const plugins = {}
      this.dyns.forEach((proc, id) => {
        if (proc && proc.meters) plugins[id] = proc.meters
      })
      this.reverbs.forEach((proc, id) => {
        if (!proc) return
        plugins[id] = { wetPeak: proc.reportedWetPeak || proc.lastWetPeak || 0 }
      })
      this.boosts.forEach((proc, id) => {
        if (!proc) return
        plugins[id] = {
          width: proc.width,
          corr: proc.corr,
          gr: proc.gr,
          activity: proc.activity
        }
      })
      this.lims.forEach((proc, id) => {
        if (proc && proc.meters) plugins[id] = proc.meters
      })
      this.port.postMessage({
        type: 'meters',
        inPeak: this.meters.inPeak,
        outPeak: this.meters.outPeak,
        inPeakL: this.meters.inPeakL,
        inPeakR: this.meters.inPeakR,
        outPeakL: this.meters.outPeakL,
        outPeakR: this.meters.outPeakR,
        active: this.chain.length,
        wetPeak: this.meters.wetPeak,
        gr: this.meters.gr,
        grBands: this.meters.grBands,
        spectrum: this.chainFft.getArray(),
        eqById,
        plugins,
        cpuMs: this.cpuEma,
        boostWidth: this.meters.boostWidth,
        boostCorr: this.meters.boostCorr,
        boostGr: this.meters.boostGr,
        boostActivity: this.meters.boostActivity
      })
    }
    return true
  }
}
registerProcessor('daw-fx-chain', DawFxChain)
`
