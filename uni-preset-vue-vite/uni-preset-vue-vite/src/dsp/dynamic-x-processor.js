/** Worklet-side DynamicXProcessor source. Concatenated into fx-worklet.js. */

export const DYNAMIC_X_PROCESSOR_SOURCE = `
function dynClamp (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }
function dynDb (x) { return 20 * Math.log10(x + 1e-12) }
function dynLin (db) {
  if (db > 60) db = 60
  if (db < -120) db = -120
  return Math.pow(10, db / 20)
}
function dynCoeff (seconds, sr) {
  const t = seconds * sr
  if (!(t > 1e-4)) return 0
  return Math.exp(-1 / t)
}
function dynBlockCoeff (seconds, sr, n) {
  const t = seconds * sr
  if (!(t > 1e-4)) return 0
  return Math.exp(-n / t)
}
function dynFinite (x) {
  return x === x && x !== Infinity && x !== -Infinity ? x : 0
}

class DynEnv {
  constructor () {
    this.envDb = -120
    this.gainDb = 0
    this.targetDb = 0
  }
  reset () {
    this.envDb = -120
    this.gainDb = 0
    this.targetDb = 0
  }
}

class DynamicXProcessor {
  constructor (sr) {
    this.sr = sr || 48000
    this.full = new DynEnv()
    this.bands = [new DynEnv(), new DynEnv(), new DynEnv()]
    this.xo = {
      lp1: { L: [new Biquad(), new Biquad()], R: [new Biquad(), new Biquad()] },
      hp1: { L: [new Biquad(), new Biquad()], R: [new Biquad(), new Biquad()] },
      lp2: { L: [new Biquad(), new Biquad()], R: [new Biquad(), new Biquad()] },
      hp2: { L: [new Biquad(), new Biquad()], R: [new Biquad(), new Biquad()] }
    }
    this.p = {
      th: -18, ratio: 4, logRatio: Math.log(4),
      atk: 0.012, rel: 0.12, makeup: 0,
      autoRel: 0, autoGain: 0, split: 0,
      xo1: 180, xo2: 3500
    }
    this.xo1Used = -1
    this.xo2Used = -1
    this.autoRelTime = 0.12
    this.prevEnvDb = -120
    this.avgGrDb = 0
    this.autoMakeupDb = 0
    this.makeupLin = 1
    this.appliedGainDb = 0
    this.peakIn = 0
    this.peakOut = 0
    this.rmsInLin = 0
    this.rmsOutLin = 0
    this.blockN = 0
    this.bL = null
    this.bR = null
    this.tmpL = null
    this.tmpR = null
    this.fullL = null
    this.fullR = null
    this.grBandsLin = [0, 0, 0]
    this.analyzer = null
    this._wasSplit = 0
    this.meters = {
      inPeak: 0, outPeak: 0, inRms: 0, outRms: 0, gr: 0,
      grBands: [0, 0, 0],
      inputPeakDb: -120, inputRmsDb: -120,
      outputPeakDb: -120, outputRmsDb: -120,
      gainReductionDb: 0,
      spectrum: []
    }
  }

  reset () {
    this.full.reset()
    for (let i = 0; i < 3; i++) this.bands[i].reset()
    this.flushFilters(true)
    this.makeupLin = 1
    this.appliedGainDb = 0
    this.avgGrDb = 0
    this.autoMakeupDb = 0
  }

  ensureAnalyzer () {
    if (this.analyzer) return this.analyzer
    if (typeof EQX_API === 'undefined' || !EQX_API.SpectrumAnalyzer) return null
    this.analyzer = new EQX_API.SpectrumAnalyzer(this.sr, 1024, 96, 24)
    return this.analyzer
  }

  ensureBuf (n) {
    if (!this.bL || this.bL[0].length < n) {
      this.bL = [new Float32Array(n), new Float32Array(n), new Float32Array(n)]
      this.bR = [new Float32Array(n), new Float32Array(n), new Float32Array(n)]
    }
  }

  applyCoeff (sec, c) {
    sec.L[0].set(c[0], c[1], c[2], c[3], c[4])
    sec.L[1].set(c[0], c[1], c[2], c[3], c[4])
    sec.R[0].set(c[0], c[1], c[2], c[3], c[4])
    sec.R[1].set(c[0], c[1], c[2], c[3], c[4])
  }

  setCrossovers (f1, f2) {
    const sr = this.sr
    const q = 0.7071067811865476
    this.applyCoeff(this.xo.lp1, rbj('lowpass', f1, q, 0, sr))
    this.applyCoeff(this.xo.hp1, rbj('highpass', f1, q, 0, sr))
    this.applyCoeff(this.xo.lp2, rbj('lowpass', f2, q, 0, sr))
    this.applyCoeff(this.xo.hp2, rbj('highpass', f2, q, 0, sr))
    this.xo1Used = f1
    this.xo2Used = f2
  }

  xoTick (sec, ch, x) {
    const s = ch ? sec.R : sec.L
    return s[1].tick(s[0].tick(x))
  }

  flushFilters (force) {
    const secs = [this.xo.lp1, this.xo.hp1, this.xo.lp2, this.xo.hp2]
    for (let i = 0; i < 4; i++) {
      const sec = secs[i]
      const stages = [sec.L[0], sec.L[1], sec.R[0], sec.R[1]]
      for (let s = 0; s < 4; s++) {
        const q = stages[s]
        if (force) { q.reset(); continue }
        if (q.z1 > -1e-18 && q.z1 < 1e-18) q.z1 = 0
        if (q.z2 > -1e-18 && q.z2 < 1e-18) q.z2 = 0
      }
    }
  }

  computeGr (inputDb, th, ratio) {
    if (!(inputDb > th)) return 0
    const r = ratio < 1 ? 1 : ratio
    const outDb = th + (inputDb - th) / r
    let gr = outDb - inputDb
    if (gr > 0) gr = 0
    if (gr < -60) gr = -60
    return gr
  }

  tickGain (env, atkC, relC) {
    const a = env.targetDb < env.gainDb ? atkC : relC
    env.gainDb = a * env.gainDb + (1 - a) * env.targetDb
    if (env.gainDb > 0) env.gainDb = 0
    if (env.gainDb < -60) env.gainDb = -60
    const g = Math.pow(10, env.gainDb / 20)
    return g === g ? g : 1
  }

  releaseTime (p) {
    if (p.autoRel > 0.5) return this.autoRelTime
    return p.rel + (this.autoRelTime - p.rel) * p.autoRel
  }

  updateAutoRelease (p, n, envDb) {
    const gr = this.appliedGainDb < 0 ? -this.appliedGainDb : 0
    const move = envDb - this.prevEnvDb
    this.prevEnvDb = envDb
    const grN = gr / 18
    const grF = 0.65 + 1.05 * (grN < 0 ? 0 : grN > 1 ? 1 : grN)
    let mvF = 1
    if (move < -0.2) mvF = 0.62
    else if (move > 0.2) mvF = 1.18
    const levelF = envDb > -12 ? 1.12 : envDb < -36 ? 0.88 : 1
    let t = 0.1 * grF * mvF * levelF
    if (t < 0.035) t = 0.035
    if (t > 0.65) t = 0.65
    const a = 1 - dynBlockCoeff(0.08, this.sr, n)
    this.autoRelTime += (t - this.autoRelTime) * a
  }

  updateAutoMakeup (n) {
    const aAvg = 1 - dynBlockCoeff(0.85, this.sr, n)
    this.avgGrDb += (this.appliedGainDb - this.avgGrDb) * aAvg
    let target = -this.avgGrDb * 0.65
    if (target < 0) target = 0
    if (target > 12) target = 12
    const aMk = 1 - dynBlockCoeff(0.28, this.sr, n)
    this.autoMakeupDb += (target - this.autoMakeupDb) * aMk
  }

  measureBlock (l, r, n, dual) {
    let peak = 0, sum = 0
    for (let i = 0; i < n; i++) {
      const xL = l[i]
      const xR = dual ? r[i] : xL
      const aL = xL < 0 ? -xL : xL
      const aR = xR < 0 ? -xR : xR
      if (aL > peak) peak = aL
      if (aR > peak) peak = aR
      sum += xL * xL + (dual ? xR * xR : 0)
    }
    const ch = dual ? 2 : 1
    const rms = Math.sqrt(sum / (n * ch) + 1e-20)
    return { peak: peak, rms: rms, db: dynDb(rms) }
  }

  processFull (l, r, n, dual, p, atkC, relC, levelDb) {
    const db = levelDb == null ? this.measureBlock(l, r, n, dual).db : levelDb
    const envA = 1 - dynBlockCoeff(0.004, this.sr, n)
    this.full.envDb += (db - this.full.envDb) * envA
    this.full.targetDb = this.computeGr(this.full.envDb, p.th, p.ratio)
    for (let i = 0; i < n; i++) {
      const g = this.tickGain(this.full, atkC, relC)
      l[i] *= g
      if (dual) r[i] *= g
    }
    this.appliedGainDb = this.full.gainDb
    this.grBandsLin[0] = 0
    this.grBandsLin[1] = 0
    this.grBandsLin[2] = 0
  }

  processSplit (l, r, n, dual, p, state, atkC, relC) {
    if (Math.abs(p.xo1 - this.xo1Used) > 0.25 || Math.abs(p.xo2 - this.xo2Used) > 0.25) {
      this.setCrossovers(p.xo1, p.xo2)
    }
    const bL = this.bL
    const bR = this.bR
    const sum = [0, 0, 0]
    for (let i = 0; i < n; i++) {
      const xL = l[i]
      const xR = dual ? r[i] : xL
      const lowL = this.xoTick(this.xo.lp1, 0, xL)
      const restL = this.xoTick(this.xo.hp1, 0, xL)
      const midL = this.xoTick(this.xo.lp2, 0, restL)
      const highL = this.xoTick(this.xo.hp2, 0, restL)
      bL[0][i] = lowL
      bL[1][i] = midL
      bL[2][i] = highL
      sum[0] += lowL * lowL
      sum[1] += midL * midL
      sum[2] += highL * highL
      if (dual) {
        const lowR = this.xoTick(this.xo.lp1, 1, xR)
        const restR = this.xoTick(this.xo.hp1, 1, xR)
        const midR = this.xoTick(this.xo.lp2, 1, restR)
        const highR = this.xoTick(this.xo.hp2, 1, restR)
        bR[0][i] = lowR
        bR[1][i] = midR
        bR[2][i] = highR
        sum[0] += lowR * lowR
        sum[1] += midR * midR
        sum[2] += highR * highR
      }
    }
    const cfg = state.bands || []
    let anySolo = false
    for (let b = 0; b < 3; b++) {
      if (cfg[b] && cfg[b].solo) anySolo = true
    }
    const envA = 1 - dynBlockCoeff(0.004, this.sr, n)
    const ch = dual ? 2 : 1
    for (let b = 0; b < 3; b++) {
      const rms = Math.sqrt(sum[b] / (n * ch) + 1e-20)
      const levelDb = dynDb(rms)
      const env = this.bands[b]
      env.envDb += (levelDb - env.envDb) * envA
      const enabled = !(cfg[b] && cfg[b].enabled === false)
      env.targetDb = enabled ? this.computeGr(env.envDb, p.th, p.ratio) : 0
    }
    for (let i = 0; i < n; i++) {
      let oL = 0
      let oR = 0
      for (let b = 0; b < 3; b++) {
        const g = this.tickGain(this.bands[b], atkC, relC)
        const silent = anySolo && !(cfg[b] && cfg[b].solo)
        if (silent) continue
        oL += bL[b][i] * g
        if (dual) oR += bR[b][i] * g
      }
      l[i] = oL
      if (dual) r[i] = oR
    }
    let wGr = 0
    let wSum = 0
    for (let b = 0; b < 3; b++) {
      const w = Math.sqrt(sum[b] / (n * ch) + 1e-20)
      wSum += w
      wGr += this.bands[b].gainDb * w
      this.grBandsLin[b] = dynClamp(-this.bands[b].gainDb / 24, 0, 1)
    }
    this.appliedGainDb = wSum > 1e-12 ? wGr / wSum : 0
  }

  process (l, r, n, state) {
    if (!l || n < 1) return
    const dual = !!(r && r !== l)
    const sr = this.sr
    const st = state || {}
    const p = this.p
    const aP = 1 - dynBlockCoeff(0.018, sr, n)

    const thT = dynClamp(st.threshold == null ? -18 : st.threshold, -60, 0)
    const ratioT = dynClamp(st.ratio == null ? 4 : st.ratio, 1, 20)
    const atkT = dynClamp(st.attack == null ? 0.012 : st.attack, 0.0008, 0.25)
    const relT = dynClamp(st.release == null ? 0.12 : st.release, 0.02, 1.5)
    const mkT = dynClamp(st.makeupDb == null ? 0 : st.makeupDb, -12, 24)
    let xo1T = dynClamp(st.xo1 == null ? 180 : st.xo1, 40, 800)
    let xo2T = dynClamp(st.xo2 == null ? 3500 : st.xo2, 800, 12000)
    if (xo2T < xo1T + 80) xo2T = xo1T + 80

    p.th += (thT - p.th) * aP
    p.logRatio += (Math.log(ratioT) - p.logRatio) * aP
    p.ratio = Math.exp(p.logRatio)
    p.atk += (atkT - p.atk) * aP
    p.rel += (relT - p.rel) * aP
    p.makeup += (mkT - p.makeup) * aP
    p.autoRel += ((st.autoRelease ? 1 : 0) - p.autoRel) * aP
    p.autoGain += ((st.autoGain ? 1 : 0) - p.autoGain) * aP
    p.split += ((st.splitBands ? 1 : 0) - p.split) * (1 - dynBlockCoeff(0.012, sr, n))
    p.xo1 += (xo1T - p.xo1) * aP
    p.xo2 += (xo2T - p.xo2) * aP

    const inM = this.measureBlock(l, r, n, dual)
    this.ensureBuf(n)

    if (p.split > 0.2) {
      const an = this.ensureAnalyzer()
      if (an) {
        an.push(l, r, n)
        this.meters.spectrum = an.getArray()
      }
    } else if (this.meters.spectrum && this.meters.spectrum.length) {
      this.meters.spectrum = []
    }

    if (p.split > 0.02 && this._wasSplit <= 0.02) {
      for (let b = 0; b < 3; b++) {
        this.bands[b].gainDb = this.full.gainDb
        this.bands[b].envDb = this.full.envDb
        this.bands[b].targetDb = this.full.targetDb
      }
    } else if (p.split < 0.98 && this._wasSplit >= 0.98) {
      this.full.gainDb = this.appliedGainDb
      this.full.envDb = this.bands[1].envDb
    }
    this._wasSplit = p.split

    const relSec = this.releaseTime(p)
    const atkC = dynCoeff(p.atk < 0.0008 ? 0.0008 : p.atk, sr)
    const relC = dynCoeff(relSec, sr)

    const split = p.split
    if (split < 0.001) {
      this.processFull(l, r, n, dual, p, atkC, relC, inM.db)
    } else if (split > 0.999) {
      this.processSplit(l, r, n, dual, p, st, atkC, relC)
    } else {
      if (!this.tmpL || this.tmpL.length < n) {
        this.tmpL = new Float32Array(n)
        this.tmpR = new Float32Array(n)
        this.fullL = new Float32Array(n)
        this.fullR = new Float32Array(n)
      }
      for (let i = 0; i < n; i++) {
        this.tmpL[i] = l[i]
        if (dual) this.tmpR[i] = r[i]
      }
      this.processFull(l, r, n, dual, p, atkC, relC, inM.db)
      for (let i = 0; i < n; i++) {
        this.fullL[i] = l[i]
        if (dual) this.fullR[i] = r[i]
        l[i] = this.tmpL[i]
        if (dual) r[i] = this.tmpR[i]
      }
      const savedGr = this.appliedGainDb
      this.processSplit(l, r, n, dual, p, st, atkC, relC)
      this.appliedGainDb = savedGr + (this.appliedGainDb - savedGr) * split
      const w = split
      const dry = 1 - w
      for (let i = 0; i < n; i++) {
        l[i] = this.fullL[i] * dry + l[i] * w
        if (dual) r[i] = this.fullR[i] * dry + r[i] * w
      }
    }

    this.updateAutoRelease(p, n, split > 0.5 ? this.bands[1].envDb : this.full.envDb)
    this.updateAutoMakeup(n)

    let mkDb = p.makeup + this.autoMakeupDb * p.autoGain
    if (mkDb > 24) mkDb = 24
    if (mkDb < -12) mkDb = -12
    const mkTgt = dynLin(mkDb)
    const aMk = 1 - dynBlockCoeff(0.015, sr, n)
    this.makeupLin += (mkTgt - this.makeupLin) * aMk
    if (this.makeupLin > 15.85) this.makeupLin = 15.85
    if (this.makeupLin < 0.063) this.makeupLin = 0.063
    const gMk = this.makeupLin
    for (let i = 0; i < n; i++) {
      let yL = l[i] * gMk
      yL = dynFinite(yL)
      l[i] = yL
      if (dual) {
        let yR = r[i] * gMk
        yR = dynFinite(yR)
        r[i] = yR
      }
    }

    const outM = this.measureBlock(l, r, n, dual)
    const peakDecay = dynBlockCoeff(0.14, sr, n)
    const rmsA = 1 - dynBlockCoeff(0.07, sr, n)
    this.peakIn = Math.max(this.peakIn * peakDecay, inM.peak)
    this.peakOut = Math.max(this.peakOut * peakDecay, outM.peak)
    this.rmsInLin += (inM.rms - this.rmsInLin) * rmsA
    this.rmsOutLin += (outM.rms - this.rmsOutLin) * rmsA

    const m = this.meters
    m.inPeak = this.peakIn
    m.outPeak = this.peakOut
    m.inRms = this.rmsInLin
    m.outRms = this.rmsOutLin
    m.inputPeakDb = dynDb(this.peakIn)
    m.inputRmsDb = dynDb(this.rmsInLin)
    m.outputPeakDb = dynDb(this.peakOut)
    m.outputRmsDb = dynDb(this.rmsOutLin)
    m.gainReductionDb = this.appliedGainDb
    m.gr = dynClamp(-this.appliedGainDb / 24, 0, 1)
    m.grBands = this.grBandsLin

    this.blockN++
    if ((this.blockN & 63) === 0) this.flushFilters(false)
  }
}
`
