/** Boost X AudioWorklet DSP. Concatenated into fx-worklet.js. No allocations in process(). */

export const BOOST_X_PROCESSOR_SOURCE = `
class BoostXProcessor {
  constructor (sr) {
    this.sr = sr
    this.invSr = 1 / sr
    this.invSqrt2 = Math.SQRT1_2
    this.cap = 2048
    this.inL = new Float32Array(2048)
    this.inR = new Float32Array(2048)
    this.aL = new Float32Array(2048)
    this.aR = new Float32Array(2048)
    this.amount = 0.35
    this.amountZ = 0.35
    this.amountReady = false
    this.modeA = ''
    this.modeB = ''
    this.xfade = 1
    this.xfadeInc = 1 / (0.008 * sr)
    this.character = 'clean'
    this.width = 0
    this.corr = 1
    this.gr = 0
    this.activity = 0
    this.bx = 0
    this.by = 0

    this.sideZ1 = 0
    this.sideZ2 = 0
    this.splitA = 1 - Math.exp(-2 * Math.PI * 180 / sr)
    this.wLowZ = 1
    this.wHighZ = 1

    this.ottA1 = 1 - Math.exp(-2 * Math.PI * 150 / sr)
    this.ottA2 = 1 - Math.exp(-2 * Math.PI * 3500 / sr)
    this.ottL = { z1: 0, z2: 0, m1: 0, m2: 0 }
    this.ottR = { z1: 0, z2: 0, m1: 0, m2: 0 }
    this.gainSmooth = 1 - Math.exp(-1 / (0.0008 * sr))
    this.ottCeilZ = 1
    this.ottCeilRel = 1 - Math.exp(-1 / (0.06 * sr))
    this.ottBands = [
      this.makeOttBand(0.010, 0.140, -8, -24, 4, 3, 8),
      this.makeOttBand(0.003, 0.070, -12, -32, 8, 4, 12),
      this.makeOttBand(0.0008, 0.035, -14, -36, 10, 6, 14)
    ]

    this.dL = new DelayLine((sr * 0.05) | 0)
    this.dR = new DelayLine((sr * 0.05) | 0)
    this.lfo = 0

    this.dcXL = 0
    this.dcYL = 0
    this.dcXR = 0
    this.dcYR = 0
  }

  makeOttBand (atkSec, relSec, downThresh, upThresh, ratioDown, ratioUp, maxUp) {
    return {
      env: 0,
      det: 0,
      gainZ: 1,
      gr: 0,
      atk: Math.exp(-1 / Math.max(1, atkSec * this.sr)),
      atkUse: Math.exp(-1 / Math.max(1, atkSec * this.sr)),
      rel: Math.exp(-1 / Math.max(1, relSec * this.sr)),
      downThresh: downThresh,
      upThresh: upThresh,
      ratioDown: ratioDown,
      ratioUp: ratioUp,
      maxUp: maxUp
    }
  }

  prepareMode (mode) {
    if (mode === 'ott') {
      this.ottL.z1 = this.ottL.z2 = this.ottL.m1 = this.ottL.m2 = 0
      this.ottR.z1 = this.ottR.z2 = this.ottR.m1 = this.ottR.m2 = 0
      for (let b = 0; b < 3; b++) {
        this.ottBands[b].env = 0
        this.ottBands[b].det = 0
        this.ottBands[b].gainZ = 1
        this.ottBands[b].gr = 0
      }
      this.ottCeilZ = 1
    } else if (mode === 'expander') {
      this.sideZ1 = 0
      this.sideZ2 = 0
      this.wLowZ = 1
      this.wHighZ = 1
    } else if (mode === 'distortion') {
      this.dcXL = this.dcYL = this.dcXR = this.dcYR = 0
    }
  }

  normMode (mode) {
    if (mode === 'expander' || mode === 'ott' || mode === 'chorus' || mode === 'distortion') return mode
    if (mode === 'wide' || mode === 'stereo') return 'expander'
    if (mode === 'drive') return 'distortion'
    return 'ott'
  }

  intensity (x, gamma) {
    if (x < 0) x = 0
    else if (x > 1) x = 1
    return Math.pow(x, gamma)
  }

  process (l, r, n, state) {
    if (n <= this.cap) {
      this.processBlock(l, r, n, state)
      return
    }
    for (let off = 0; off < n; off += this.cap) {
      const m = n - off < this.cap ? n - off : this.cap
      this.processBlock(l.subarray(off, off + m), r.subarray(off, off + m), m, state)
    }
  }

  processBlock (l, r, n, state) {
    const target = state && state.amount != null ? state.amount : 0.35
    this.amount = target < 0 ? 0 : target > 1 ? 1 : target
    if (!this.amountReady) {
      this.amountZ = this.amount
      this.amountReady = true
    } else {
      const blockA = Math.exp(-n / (0.012 * this.sr))
      this.amountZ = this.amount + (this.amountZ - this.amount) * blockA
    }
    this.character = (state && state.character) || 'clean'
    const mode = this.normMode(state && state.mode)

    if (!this.modeB) {
      this.modeA = mode
      this.modeB = mode
      this.xfade = 1
    } else if (mode !== this.modeB) {
      this.modeA = this.modeB
      this.modeB = mode
      this.xfade = 0
      this.prepareMode(mode)
    }

    if (this.xfade >= 1) {
      this.processMode(this.modeB, l, r, n)
    } else {
      const inL = this.inL, inR = this.inR, aL = this.aL, aR = this.aR
      for (let i = 0; i < n; i++) { inL[i] = l[i]; inR[i] = r[i] }
      this.processMode(this.modeA, l, r, n)
      for (let i = 0; i < n; i++) { aL[i] = l[i]; aR[i] = r[i]; l[i] = inL[i]; r[i] = inR[i] }
      this.processMode(this.modeB, l, r, n)
      let xf = this.xfade
      const inc = this.xfadeInc
      for (let i = 0; i < n; i++) {
        const t = xf > 1 ? 1 : xf
        l[i] = aL[i] + (l[i] - aL[i]) * t
        r[i] = aR[i] + (r[i] - aR[i]) * t
        xf += inc
      }
      this.xfade = xf > 1 ? 1 : xf
    }

    this.finish(l, r, n)
  }

  processMode (mode, l, r, n) {
    const x = this.amountZ
    if (mode === 'expander') this.processExpander(l, r, n, this.intensity(x, 1.65), this.character)
    else if (mode === 'ott') this.processOtt(l, r, n, this.intensity(x, 1.55), this.character)
    else if (mode === 'chorus') this.processChorus(l, r, n, this.intensity(x, 1.5), this.character)
    else this.processDistortion(l, r, n, this.intensity(x, 1.7), this.character)
  }

  processExpander (l, r, n, intensity, character) {
    let kLow = 0.12, kHigh = 0.88, wLowMax = 1.22, wHighMax = 1.82, splitHz = 180
    if (character === 'subtle') { kHigh = 0.42; wHighMax = 1.4; kLow = 0.06 }
    else if (character === 'air') { splitHz = 320; kHigh = 1.02; kLow = 0.05; wHighMax = 1.9 }

    const aT = 1 - Math.exp(-2 * Math.PI * splitHz / this.sr)
    this.splitA += (aT - this.splitA) * 0.04
    const a = this.splitA
    const inv = this.invSqrt2

    let wLow = 1 + kLow * intensity
    let wHigh = 1 + kHigh * intensity
    if (wLow < 0.92) wLow = 0.92
    else if (wLow > wLowMax) wLow = wLowMax
    if (wHigh < 1) wHigh = 1
    else if (wHigh > wHighMax) wHigh = wHighMax
    this.wLowZ += (wLow - this.wLowZ) * 0.12
    this.wHighZ += (wHigh - this.wHighZ) * 0.12
    wLow = this.wLowZ
    wHigh = this.wHighZ

    for (let i = 0; i < n; i++) {
      const M = (l[i] + r[i]) * inv
      const S = (l[i] - r[i]) * inv
      this.sideZ1 += a * (S - this.sideZ1)
      this.sideZ2 += a * (this.sideZ1 - this.sideZ2)
      const sLow = this.sideZ2
      const sHigh = S - sLow
      let sBoost = sLow * wLow + sHigh * wHigh
      const mPow = M * M
      const den = mPow + sBoost * sBoost
      let comp = den > 1e-20 ? Math.sqrt((mPow + S * S) / den) : 1
      if (comp < 0.72) comp = 0.72
      else if (comp > 1) comp = 1
      sBoost *= comp
      l[i] = (M + sBoost) * inv
      r[i] = (M - sBoost) * inv
    }
  }

  ottFollow (band, xL, xR) {
    const det = Math.sqrt(xL * xL + xR * xR) * 0.7071067811865476
    band.det = det
    const env = band.env
    const coeff = det > env ? band.atkUse : band.rel
    band.env = coeff * env + (1 - coeff) * det
  }

  ottUpScale (band, maxEnv) {
    const rel = band.env / (maxEnv + 1e-12)
    if (rel < 0.06) return 0
    if (rel < 0.25) return (rel - 0.06) / 0.19
    return 1
  }

  applyOttBand (band, xL, xR, intensity, upScale) {
    const envDb = 20 * Math.log10(band.env + 1e-8)
    const peakDb = 20 * Math.log10(Math.max(band.env, band.det) + 1e-8)
    const rDown = 1 + (band.ratioDown - 1) * intensity
    const rUp = 1 + (band.ratioUp - 1) * intensity
    const maxUp = band.maxUp * intensity
    let gainDb = 0
    if (peakDb > band.downThresh) {
      gainDb += (1 - 1 / rDown) * (band.downThresh - peakDb)
    }
    if (envDb < band.upThresh) {
      let up = (1 - 1 / rUp) * (band.upThresh - envDb)
      if (up > maxUp) up = maxUp
      if (envDb < -72) up = 0
      else if (envDb < -60) up *= (envDb + 72) / 12
      gainDb += up * upScale
    }
    if (gainDb < -24) gainDb = -24
    else if (gainDb > 14) gainDb = 14
    gainDb *= 0.4 + 0.6 * intensity
    let g = Math.pow(10, gainDb * 0.05)
    band.gainZ += (g - band.gainZ) * this.gainSmooth
    g = band.gainZ
    band.gr = gainDb < 0 ? -gainDb : 0
    this.bx = xL * g
    this.by = xR * g
  }

  processOtt (l, r, n, intensity, character) {
    const a1 = this.ottA1
    const a2 = this.ottA2
    const stL = this.ottL
    const stR = this.ottR
    const b0 = this.ottBands[0]
    const b1 = this.ottBands[1]
    const b2 = this.ottBands[2]
    const wet = intensity
    let makeupDb = 1.8 * intensity
    let highMul = 1
    let lowMul = 1
    let atkMul = 1
    if (character === 'bright') { highMul = 1 + 0.22 * intensity; lowMul = 1 - 0.06 * intensity; makeupDb += 0.4 * intensity }
    else if (character === 'punch') { atkMul = 0.55; lowMul = 1 + 0.1 * intensity }
    else if (character === 'aggressive') { highMul = 1 + 0.12 * intensity; lowMul = 1 + 0.05 * intensity; atkMul = 0.7; makeupDb += 0.5 * intensity }
    const makeup = Math.pow(10, makeupDb * 0.05)
    b0.atkUse = atkMul < 1 ? Math.pow(b0.atk, 1 / atkMul) : b0.atk
    b1.atkUse = atkMul < 1 ? Math.pow(b1.atk, 1 / atkMul) : b1.atk
    b2.atkUse = atkMul < 1 ? Math.pow(b2.atk, 1 / atkMul) : b2.atk
    const ceilRel = this.ottCeilRel
    let grSum = 0

    for (let i = 0; i < n; i++) {
      const dryL = l[i]
      const dryR = r[i]

      stL.z1 += a1 * (dryL - stL.z1)
      stL.z2 += a1 * (stL.z1 - stL.z2)
      const lowL = stL.z2
      const restL = dryL - lowL
      stL.m1 += a2 * (restL - stL.m1)
      stL.m2 += a2 * (stL.m1 - stL.m2)
      const midL = stL.m2
      const highL = restL - midL

      stR.z1 += a1 * (dryR - stR.z1)
      stR.z2 += a1 * (stR.z1 - stR.z2)
      const lowR = stR.z2
      const restR = dryR - lowR
      stR.m1 += a2 * (restR - stR.m1)
      stR.m2 += a2 * (stR.m1 - stR.m2)
      const midR = stR.m2
      const highR = restR - midR

      this.ottFollow(b0, lowL, lowR)
      this.ottFollow(b1, midL, midR)
      this.ottFollow(b2, highL, highR)
      const maxEnv = b0.env > b1.env ? (b0.env > b2.env ? b0.env : b2.env) : (b1.env > b2.env ? b1.env : b2.env)

      this.applyOttBand(b0, lowL, lowR, intensity, this.ottUpScale(b0, maxEnv))
      let yL = this.bx * lowMul
      let yR = this.by * lowMul
      grSum += b0.gr
      this.applyOttBand(b1, midL, midR, intensity, this.ottUpScale(b1, maxEnv))
      yL += this.bx
      yR += this.by
      grSum += b1.gr
      this.applyOttBand(b2, highL, highR, intensity, this.ottUpScale(b2, maxEnv))
      yL += this.bx * highMul
      yR += this.by * highMul
      grSum += b2.gr

      yL *= makeup
      yR *= makeup
      const pk = yL > yR ? (yL > -yL ? yL : -yL) : (yR > -yR ? yR : -yR)
      if (pk > this.ottCeilZ) this.ottCeilZ = pk
      else this.ottCeilZ += (pk - this.ottCeilZ) * ceilRel
      const ceilG = this.ottCeilZ > 1 ? 1 / this.ottCeilZ : 1
      yL *= ceilG
      yR *= ceilG

      l[i] = dryL + (yL - dryL) * wet
      r[i] = dryR + (yR - dryR) * wet
    }
    this.gr = this.gr * 0.8 + 0.2 * (grSum / Math.max(1, n * 3) / 18)
    if (this.gr > 1) this.gr = 1
  }

  processChorus (l, r, n, intensity, character) {
    const wet = (character === 'soft' ? 0.48 : 0.62) * intensity
    const dry = 1 - 0.5 * wet
    const depthMul = character === 'wide' ? 1.2 : character === 'soft' ? 0.7 : 1
    const base = 0.018 * this.sr
    const base2 = 0.024 * this.sr
    const depth = (0.002 + 0.007 * intensity) * this.sr * depthMul
    const rate = (character === 'soft' ? 0.32 : 0.45) + 0.7 * intensity
    const lfoInc = rate * this.invSr
    const dL = this.dL
    const dR = this.dR
    let phase = this.lfo

    for (let i = 0; i < n; i++) {
      const xL = l[i]
      const xR = r[i]
      dL.write(xL)
      dR.write(xR)
      phase += lfoInc
      if (phase >= 1) phase -= 1
      const s = Math.sin(phase * 6.283185307179586)
      const ns = -s
      const tapL = 0.72 * dL.tapLin(base + depth * s) + 0.28 * dL.tapLin(base2 + depth * 0.55 * ns)
      const tapR = 0.72 * dR.tapLin(base + depth * ns) + 0.28 * dR.tapLin(base2 + depth * 0.55 * s)
      l[i] = xL * dry + tapL * wet
      r[i] = xR * dry + tapR * wet
    }
    this.lfo = phase
  }

  dcBlock (x, ch) {
    if (ch === 0) {
      const y = x - this.dcXL + 0.995 * this.dcYL
      this.dcXL = x
      this.dcYL = y
      return y
    }
    const y = x - this.dcXR + 0.995 * this.dcYR
    this.dcXR = x
    this.dcYR = y
    return y
  }

  processDistortion (l, r, n, intensity, character) {
    const driveMul = character === 'crunch' ? 1.35 : 1
    const drive = 1 + 16 * intensity * driveMul
    const wet = intensity
    const makeup = Math.tanh(0.4) / Math.max(1e-4, Math.tanh(0.4 * drive))
    const warm = character !== 'crunch'

    for (let i = 0; i < n; i++) {
      let xL = l[i]
      let xR = r[i]
      let sL, sR
      if (warm) {
        sL = this.dcBlock(tanhApprox((xL + 0.1 * xL * xL) * drive), 0)
        sR = this.dcBlock(tanhApprox((xR + 0.1 * xR * xR) * drive), 1)
      } else {
        sL = tanhApprox(xL * drive)
        sR = tanhApprox(xR * drive)
      }
      l[i] = xL + (sL * makeup - xL) * wet
      r[i] = xR + (sR * makeup - xR) * wet
    }
  }

  finish (l, r, n) {
    let sumL2 = 0, sumR2 = 0, sumLR = 0, sumM = 0, sumS = 0, peak = 0
    const inv = this.invSqrt2
    for (let i = 0; i < n; i++) {
      let xL = l[i]
      let xR = r[i]
      if (xL !== xL) xL = 0
      if (xR !== xR) xR = 0
      if (xL > 2 || xL < -2) xL = tanhApprox(xL)
      if (xR > 2 || xR < -2) xR = tanhApprox(xR)
      l[i] = xL
      r[i] = xR
      sumL2 += xL * xL
      sumR2 += xR * xR
      sumLR += xL * xR
      const m = (xL + xR) * inv
      const s = (xL - xR) * inv
      sumM += m * m
      sumS += s * s
      const p = xL > xR ? (xL > -xL ? xL : -xL) : (xR > -xR ? xR : -xR)
      if (p > peak) peak = p
    }
    const corrDen = Math.sqrt(sumL2 * sumR2) + 1e-12
    let corr = sumLR / corrDen
    if (corr > 1) corr = 1
    else if (corr < -1) corr = -1
    this.corr = this.corr * 0.85 + 0.15 * corr
    const midRms = Math.sqrt(sumM / n)
    const sideRms = Math.sqrt(sumS / n)
    this.width = this.width * 0.85 + 0.15 * (sideRms / (midRms + sideRms + 1e-12))
    this.activity = this.activity * 0.8 + 0.2 * (peak > 1 ? 1 : peak)
    if (this.modeB !== 'ott') this.gr *= 0.9
  }
}
`
