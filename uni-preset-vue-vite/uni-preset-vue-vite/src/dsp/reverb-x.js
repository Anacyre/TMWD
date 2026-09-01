/** Reverb X DSP — early reflection network + Schroeder/Moorer late reverb.
 *  Vue never processes samples. This module is the source of truth for
 *  venue tables, parameter equations, visualization data, and ReverbXProcessor.
 */

export const REVERB_X_MAX_PRE = 0.25
export const REVERB_X_MAX_ER = 0.22
export const REVERB_X_MAX_COMB = 0.12
export const REVERB_X_MAX_AP = 0.06
export const REVERB_X_MIN_DELAY = 0.0003
export const REVERB_X_NUM_COMBS = 6
export const REVERB_X_NUM_ALLPASS = 3
export const REVERB_X_MAX_BLOCK = 4096

const REVERB_X_MAX_PRE_ = 0.25
const REVERB_X_MAX_ER_ = 0.22
const REVERB_X_MAX_COMB_ = 0.12
const REVERB_X_MAX_AP_ = 0.06
const REVERB_X_MIN_DELAY_ = 0.0003
const REVERB_X_NUM_COMBS_ = 6
const REVERB_X_NUM_ALLPASS_ = 3
const REVERB_X_MAX_BLOCK_ = 4096

/** Delay times in seconds, resampled at compile time (2.0: no 44.1 kHz index pinning). */
const REVERB_X_COMB_SEC = [0.02532880, 0.02691610, 0.02895692, 0.03063492, 0.03226757, 0.03385488]
const REVERB_X_COMB_R_OFF_SEC = [0.00029478, 0.00043084, 0.00052154, 0.00065760, 0.00070295, 0.00083900]
const REVERB_X_ALLPASS_SEC = [0.00696145, 0.00505669, 0.00369615]
const REVERB_X_ALLPASS_R_OFF_SEC = [0.00024943, 0.00038549, 0.00029478]

/** Sub-Hz comb length modulation: breaks up the metallic ring of a static comb bank. */
const REVERB_X_MOD_HZ = [0.331, 0.417, 0.523, 0.271, 0.611, 0.383]
const REVERB_X_MOD_PHASE = [0, 1.71, 3.02, 4.63, 5.41, 2.19]
const REVERB_X_MOD_DEPTH_ = 0.006
const REVERB_X_MOD_R_SKEW_ = 2.1

const REVERB_X_SAT_T_ = 1.2
const REVERB_X_SAT_K_ = 1.2

/**
 * Venue models as DATA. Each reflection:
 *   delay_i = baseDelay × sizeScale × delayRatio_i
 *   gain_i  = gainRatio_i × sizeGain
 * sizeScale = 0.5 + 1.5s,  s ∈ [0,1]
 */
const REVERB_X_VENUES = {
  'small-room': {
    id: 'small-room',
    name: 'Small Room',
    reflectionDelayRatios: [1.0, 1.6, 2.3, 3.1, 4.0, 5.2],
    reflectionGainRatios: [1.00, 0.78, 0.62, 0.50, 0.40, 0.32],
    stereoOffsets: [0.012, -0.016, 0.021, -0.018, 0.025, -0.022],
    preDelay: 0.006,
    baseDelay: 0.008,
    diffusion: 0.35,
    damping: 0.55,
    earlyLevel: 0.72,
    lateLevel: 0.55,
    stereoWidth: 0.45
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    reflectionDelayRatios: [1.0, 1.4, 2.0, 2.8, 3.7],
    reflectionGainRatios: [0.85, 0.65, 0.50, 0.38, 0.28],
    stereoOffsets: [0.014, -0.018, 0.016, -0.022, 0.020],
    preDelay: 0.010,
    baseDelay: 0.011,
    diffusion: 0.42,
    damping: 0.40,
    earlyLevel: 0.48,
    lateLevel: 0.62,
    stereoWidth: 0.50
  },
  chamber: {
    id: 'chamber',
    name: 'Chamber',
    reflectionDelayRatios: [1.0, 1.35, 1.75, 2.2, 2.8, 3.5, 4.3, 5.2],
    reflectionGainRatios: [0.90, 0.74, 0.62, 0.52, 0.43, 0.36, 0.29, 0.24],
    stereoOffsets: [0.010, -0.014, 0.018, -0.012, 0.022, -0.020, 0.016, -0.024],
    preDelay: 0.016,
    baseDelay: 0.013,
    diffusion: 0.55,
    damping: 0.38,
    earlyLevel: 0.55,
    lateLevel: 0.70,
    stereoWidth: 0.55
  },
  hall: {
    id: 'hall',
    name: 'Hall',
    reflectionDelayRatios: [1.0, 1.8, 2.9, 4.2],
    reflectionGainRatios: [0.70, 0.50, 0.36, 0.24],
    stereoOffsets: [0.030, -0.038, 0.042, -0.035],
    preDelay: 0.024,
    baseDelay: 0.018,
    diffusion: 0.68,
    damping: 0.32,
    earlyLevel: 0.32,
    lateLevel: 0.85,
    stereoWidth: 0.72
  },
  'concert-hall': {
    id: 'concert-hall',
    name: 'Concert Hall',
    reflectionDelayRatios: [1.0, 1.5, 2.1, 2.8, 3.7, 4.8],
    reflectionGainRatios: [0.80, 0.64, 0.52, 0.42, 0.33, 0.26],
    stereoOffsets: [0.028, -0.034, 0.040, -0.030, 0.036, -0.042],
    preDelay: 0.032,
    baseDelay: 0.022,
    diffusion: 0.72,
    damping: 0.28,
    earlyLevel: 0.42,
    lateLevel: 0.82,
    stereoWidth: 0.70
  },
  cathedral: {
    id: 'cathedral',
    name: 'Cathedral',
    reflectionDelayRatios: [1.0, 1.7, 2.6, 3.8, 5.2, 6.8],
    reflectionGainRatios: [0.55, 0.44, 0.35, 0.28, 0.22, 0.17],
    stereoOffsets: [0.035, -0.040, 0.048, -0.038, 0.044, -0.050],
    preDelay: 0.048,
    baseDelay: 0.038,
    diffusion: 0.88,
    damping: 0.62,
    earlyLevel: 0.28,
    lateLevel: 0.95,
    stereoWidth: 0.65
  },
  'large-stage': {
    id: 'large-stage',
    name: 'Large Stage',
    reflectionDelayRatios: [1.0, 1.45, 2.15, 3.0, 4.1],
    reflectionGainRatios: [0.88, 0.70, 0.54, 0.40, 0.30],
    stereoOffsets: [0.045, -0.050, 0.055, -0.042, 0.060],
    preDelay: 0.018,
    baseDelay: 0.016,
    diffusion: 0.58,
    damping: 0.30,
    earlyLevel: 0.68,
    lateLevel: 0.60,
    stereoWidth: 0.88
  },
  outdoor: {
    id: 'outdoor',
    name: 'Outdoor',
    reflectionDelayRatios: [1.0, 2.2, 3.8],
    reflectionGainRatios: [0.22, 0.12, 0.06],
    stereoOffsets: [0.060, -0.080, 0.070],
    preDelay: 0.035,
    baseDelay: 0.028,
    diffusion: 0.18,
    damping: 0.12,
    earlyLevel: 0.18,
    lateLevel: 0.06,
    stereoWidth: 0.90
  }
}

export const VENUE_DEFINITIONS = REVERB_X_VENUES

export const REVERB_X_FACTORY_PRESETS = [
  { id: 'small-room', name: 'Small Room', state: { amount: 0.28, reverbLevel: 0.55, decay: 0.45, size: 0.22, width: 0.80, preDelayMs: 8, dampingHz: 5200, venue: 'small-room' } },
  { id: 'studio', name: 'Studio', state: { amount: 0.22, reverbLevel: 0.55, decay: 0.85, size: 0.32, width: 0.90, preDelayMs: 12, dampingHz: 7200, venue: 'studio' } },
  { id: 'chamber', name: 'Chamber', state: { amount: 0.30, reverbLevel: 0.62, decay: 1.40, size: 0.48, width: 1.00, preDelayMs: 18, dampingHz: 6800, venue: 'chamber' } },
  { id: 'hall', name: 'Hall', state: { amount: 0.32, reverbLevel: 0.68, decay: 2.10, size: 0.68, width: 1.15, preDelayMs: 26, dampingHz: 7800, venue: 'hall' } },
  { id: 'concert-hall', name: 'Concert Hall', state: { amount: 0.35, reverbLevel: 0.65, decay: 2.80, size: 0.82, width: 1.10, preDelayMs: 32, dampingHz: 6200, venue: 'concert-hall' } },
  { id: 'cathedral', name: 'Cathedral', state: { amount: 0.38, reverbLevel: 0.72, decay: 6.20, size: 1.00, width: 1.00, preDelayMs: 48, dampingHz: 3800, venue: 'cathedral' } },
  { id: 'large-stage', name: 'Large Stage', state: { amount: 0.30, reverbLevel: 0.60, decay: 1.70, size: 0.78, width: 1.35, preDelayMs: 20, dampingHz: 8200, venue: 'large-stage' } },
  { id: 'outdoor', name: 'Outdoor', state: { amount: 0.20, reverbLevel: 0.35, decay: 0.35, size: 0.70, width: 1.50, preDelayMs: 42, dampingHz: 9000, venue: 'outdoor' } }
]

function reverbClamp (value, min, max) {
  return value < min ? min : (value > max ? max : value)
}

/** Soft knee above ±REVERB_X_SAT_T_, C1-continuous, asymptote ±(T+K). */
function reverbSoftSat (x) {
  if (x > REVERB_X_SAT_T_) {
    const u = x - REVERB_X_SAT_T_
    return REVERB_X_SAT_T_ + u / (1 + u / REVERB_X_SAT_K_)
  }
  if (x < -REVERB_X_SAT_T_) {
    const u = -REVERB_X_SAT_T_ - x
    return -REVERB_X_SAT_T_ - u / (1 + u / REVERB_X_SAT_K_)
  }
  return x
}

function dampCoeff (hz, sr) {
  const rate = sr < 8000 ? 44100 : sr
  const fc = reverbClamp(hz, 20, rate * 0.49)
  const a = 1 - Math.exp(-2 * Math.PI * fc / rate)
  return a < 0.002 ? 0.002 : (a > 1 ? 1 : a)
}

/** Legacy venue `damping` (one-pole coefficient at 44.1 kHz) expressed as a cutoff. */
function venueDampingHz (venue) {
  const d = reverbClamp(venue && venue.damping != null ? venue.damping : 0.3, 0, 0.92)
  const a = 1 - d
  const fc = -Math.log(a < 1e-6 ? 1e-6 : a) * 44100 / (2 * Math.PI)
  return reverbClamp(fc, 500, 20000)
}

function sizeScale (s) {
  return 0.5 + 1.5 * reverbClamp(s == null ? 0.62 : s, 0, 1)
}

function feedbackGain (delaySeconds, decayTime) {
  const D = delaySeconds < 1e-6 ? 1e-6 : delaySeconds
  const T = decayTime < 0.05 ? 0.05 : decayTime
  const g = Math.pow(10, -3 * D / T)
  if (g >= 1) return 0.98
  return g > 0.98 ? 0.98 : (g < 0 ? 0 : g)
}

function compileReverbNetwork (state, sr) {
  const st = state || {}
  const rate = sr < 8000 ? 44100 : sr
  const venue = REVERB_X_VENUES[st.venue] || REVERB_X_VENUES['concert-hall']
  const s = sizeScale(st.size)
  const decay = reverbClamp(st.decay == null ? 2.2 : st.decay, 0.15, 12)
  const wetGain = reverbClamp(st.amount == null ? 0.35 : st.amount, 0, 1)
  const reverbLevel = reverbClamp(st.reverbLevel == null ? 0.65 : st.reverbLevel, 0, 1.5)
  const width = reverbClamp(st.width == null ? 1 : st.width, 0, 2)
  const preDelaySec = st.preDelayMs == null
    ? reverbClamp(venue.preDelay * s, 0, REVERB_X_MAX_PRE_)
    : reverbClamp(st.preDelayMs / 1000, 0, REVERB_X_MAX_PRE_)
  const dampingHz = reverbClamp(st.dampingHz == null ? venueDampingHz(venue) : st.dampingHz, 500, 20000)
  const sizeGain = 1 / Math.sqrt(s)
  const ratios = venue.reflectionDelayRatios
  const gains = venue.reflectionGainRatios
  const offsets = venue.stereoOffsets || []
  const taps = []
  for (let i = 0; i < ratios.length; i++) {
    const delaySec = reverbClamp(venue.baseDelay * s * ratios[i], REVERB_X_MIN_DELAY_, REVERB_X_MAX_ER_)
    const off = offsets[i] || 0
    const g = (gains[i] == null ? 0.5 : gains[i]) * sizeGain
    const dL = reverbClamp(delaySec * (1 - off), REVERB_X_MIN_DELAY_, REVERB_X_MAX_ER_)
    const dR = reverbClamp(delaySec * (1 + off), REVERB_X_MIN_DELAY_, REVERB_X_MAX_ER_)
    taps.push({
      delaySec: delaySec,
      dL: dL * rate,
      dR: dR * rate,
      gL: g * (off >= 0 ? 1 : 0.82),
      gR: g * (off <= 0 ? 1 : 0.82)
    })
  }
  const combs = []
  for (let i = 0; i < REVERB_X_NUM_COMBS_; i++) {
    const delaySec = reverbClamp(REVERB_X_COMB_SEC[i] * s, 0.003, REVERB_X_MAX_COMB_)
    const offSec = REVERB_X_COMB_R_OFF_SEC[i] * s
    const dR = reverbClamp(delaySec + offSec, 0.003, REVERB_X_MAX_COMB_)
    combs.push({
      delaySec: delaySec,
      dL: delaySec * rate,
      dR: dR * rate,
      fb: feedbackGain(delaySec, decay)
    })
  }
  const allpass = []
  for (let i = 0; i < REVERB_X_NUM_ALLPASS_; i++) {
    const delaySec = reverbClamp(REVERB_X_ALLPASS_SEC[i] * s, 0.001, REVERB_X_MAX_AP_)
    const offSec = REVERB_X_ALLPASS_R_OFF_SEC[i] * s
    allpass.push({
      dL: delaySec * rate,
      dR: reverbClamp(delaySec + offSec, 0.001, REVERB_X_MAX_AP_) * rate
    })
  }
  return {
    venue: venue,
    sizeScale: s,
    decay: decay,
    wetGain: wetGain,
    reverbLevel: reverbLevel,
    preDelaySec: preDelaySec,
    preDelaySamples: preDelaySec * rate,
    taps: taps,
    combs: combs,
    allpass: allpass,
    dampingHz: dampingHz,
    dampAlpha: dampCoeff(dampingHz, rate),
    damping: reverbClamp(venue.damping, 0, 0.92),
    diffusion: reverbClamp(venue.diffusion, 0, 1),
    apG: reverbClamp(venue.diffusion * 0.62, 0.12, 0.86),
    earlyLevel: venue.earlyLevel,
    lateLevel: venue.lateLevel,
    width: width,
    venueWidth: reverbClamp(venue.stereoWidth, 0, 1),
    returnOnly: !!st.returnOnly,
    wetProcess: !!st.wetProcess
  }
}

function wetInsertsFromState (state, memId) {
  const st = state || {}
  const id = memId || 'rev'
  if (st.wetChain && st.wetChain.length) {
    const out = []
    for (let i = 0; i < st.wetChain.length; i++) {
      const item = st.wetChain[i]
      if (!item || !item.pluginId || item.pluginId === 'reverb-x') continue
      out.push({
        pluginId: item.pluginId,
        enabled: item.enabled !== false,
        state: item.state || {},
        instanceId: item.instanceId || (id + '-wet' + i)
      })
    }
    return out
  }
  if (st.wetPluginId && st.wetPluginId !== 'reverb-x') {
    return [{
      pluginId: st.wetPluginId,
      enabled: true,
      state: st.wetState || {},
      instanceId: id + '-wet0'
    }]
  }
  return []
}

class ReverbDelayLine {
  constructor (n) {
    const len = n < 8 ? 8 : n
    this.b = new Float32Array(len)
    this.n = len
    this.w = 0
  }

  write (x) {
    this.b[this.w] = x
    this.w += 1
    if (this.w >= this.n) this.w = 0
  }

  tapFrac (d) {
    const n = this.n
    let delay = d
    if (delay < 1) delay = 1
    else if (delay > n - 3) delay = n - 3
    const i = delay | 0
    const f = delay - i
    let r1 = this.w - i
    if (r1 < 0) r1 += n
    let r2 = r1 - 1
    if (r2 < 0) r2 += n
    return this.b[r1] + f * (this.b[r2] - this.b[r1])
  }

  clear () {
    this.b.fill(0)
    this.w = 0
  }
}

class WetProcessorChain {
  constructor (host, instanceId) {
    this.host = host
    this.instanceId = instanceId || 'rev'
    this.inserts = []
    this.dryL = new Float32Array(128)
    this.dryR = new Float32Array(128)
  }

  setFromState (state) {
    this.inserts = wetInsertsFromState(state, this.instanceId)
  }

  ensure (n) {
    if (this.dryL.length < n) {
      this.dryL = new Float32Array(n)
      this.dryR = new Float32Array(n)
    }
  }

  process (l, r, n, mix) {
    if (!this.host || mix < 1e-4 || !this.inserts.length) return
    const list = this.inserts
    if (mix < 0.999) {
      this.ensure(n)
      const dL = this.dryL
      const dR = this.dryR
      for (let i = 0; i < n; i++) {
        dL[i] = l[i]
        dR[i] = r[i]
      }
    }
    for (let p = 0; p < list.length; p++) {
      const ins = list[p]
      if (ins && ins.enabled !== false) this.host.processOne(ins, l, r, n)
    }
    if (mix < 0.999) {
      const dL = this.dryL
      const dR = this.dryR
      const m = mix
      const im = 1 - m
      for (let i = 0; i < n; i++) {
        l[i] = dL[i] * im + l[i] * m
        r[i] = dR[i] * im + r[i] * m
      }
    }
  }
}

class ReverbXProcessor {
  constructor (sr, host, instanceId) {
    this.sr = sr || 48000
    this.host = host || null
    this.instanceId = instanceId || 'rev'
    this.state = {}
    this.venueId = ''
    this.wetChain = new WetProcessorChain(this.host, this.instanceId)
    const srN = this.sr
    this.preL = new ReverbDelayLine(((srN * REVERB_X_MAX_PRE_) | 0) + 8)
    this.preR = new ReverbDelayLine(((srN * REVERB_X_MAX_PRE_) | 0) + 8)
    this.erL = new ReverbDelayLine(((srN * REVERB_X_MAX_ER_) | 0) + 8)
    this.erR = new ReverbDelayLine(((srN * REVERB_X_MAX_ER_) | 0) + 8)
    this.combL = []
    this.combR = []
    this.dampZL = new Float32Array(REVERB_X_NUM_COMBS_)
    this.dampZR = new Float32Array(REVERB_X_NUM_COMBS_)
    this.combDL = new Float32Array(REVERB_X_NUM_COMBS_)
    this.combDR = new Float32Array(REVERB_X_NUM_COMBS_)
    this.combMDL = new Float32Array(REVERB_X_NUM_COMBS_)
    this.combMDR = new Float32Array(REVERB_X_NUM_COMBS_)
    this.modPhase = new Float32Array(REVERB_X_NUM_COMBS_)
    this.modInc = new Float32Array(REVERB_X_NUM_COMBS_)
    this.fb = new Float32Array(REVERB_X_NUM_COMBS_)
    for (let i = 0; i < REVERB_X_NUM_COMBS_; i++) {
      this.modPhase[i] = REVERB_X_MOD_PHASE[i]
      this.modInc[i] = 2 * Math.PI * REVERB_X_MOD_HZ[i] / this.sr
    }
    for (let i = 0; i < REVERB_X_NUM_COMBS_; i++) {
      this.combL.push(new ReverbDelayLine(((srN * REVERB_X_MAX_COMB_) | 0) + 8))
      this.combR.push(new ReverbDelayLine(((srN * REVERB_X_MAX_COMB_) | 0) + 8))
    }
    this.apL = []
    this.apR = []
    this.apDL = new Float32Array(REVERB_X_NUM_ALLPASS_)
    this.apDR = new Float32Array(REVERB_X_NUM_ALLPASS_)
    for (let i = 0; i < REVERB_X_NUM_ALLPASS_; i++) {
      this.apL.push(new ReverbDelayLine(((srN * REVERB_X_MAX_AP_) | 0) + 8))
      this.apR.push(new ReverbDelayLine(((srN * REVERB_X_MAX_AP_) | 0) + 8))
    }
    this.taps = []
    this.tapN = 0
    this.apG = 0.5
    this.earlyLevel = 0.4
    this.lateLevel = 0.8
    this.combNorm = 1 / REVERB_X_NUM_COMBS_
    this.returnOnly = false
    this.amountT = 0.35
    this.amountZ = 0.35
    this.sizeT = 0.62
    this.sizeZ = 0.62
    this.decayT = 2.2
    this.decayZ = 2.2
    this.levelT = 0.65
    this.levelZ = 0.65
    this.widthT = 1
    this.widthZ = 1
    this.preT = 0.02 * this.sr
    this.preZ = this.preT
    this.dampHzT = 6200
    this.dampHzZ = 6200
    this.dampA = dampCoeff(6200, this.sr)
    this.wetMixT = 0
    this.wetMixZ = 0
    this.amtCoeff = 1 - Math.exp(-1 / (0.02 * this.sr))
    this.dcXL = 0
    this.dcXR = 0
    this.dcYL = 0
    this.dcYR = 0
    this.scratchL = new Float32Array(REVERB_X_MAX_BLOCK_)
    this.scratchR = new Float32Array(REVERB_X_MAX_BLOCK_)
    this.muteSamples = 0
    this.lastWetPeak = 0
    this.lastCompileKey = ''
    this.compiled = null
    this.inited = false
  }

  clearDelays () {
    this.preL.clear()
    this.preR.clear()
    this.erL.clear()
    this.erR.clear()
    for (let i = 0; i < REVERB_X_NUM_COMBS_; i++) {
      this.combL[i].clear()
      this.combR[i].clear()
      this.dampZL[i] = 0
      this.dampZR[i] = 0
    }
    for (let i = 0; i < REVERB_X_NUM_ALLPASS_; i++) {
      this.apL[i].clear()
      this.apR[i].clear()
    }
    this.dcXL = 0
    this.dcXR = 0
    this.dcYL = 0
    this.dcYR = 0
  }

  setState (state) {
    this.state = state || {}
    this.amountT = reverbClamp(this.state.amount == null ? 0.35 : this.state.amount, 0, 1)
    this.sizeT = reverbClamp(this.state.size == null ? 0.62 : this.state.size, 0, 1)
    this.decayT = reverbClamp(this.state.decay == null ? 2.2 : this.state.decay, 0.15, 12)
    this.levelT = reverbClamp(this.state.reverbLevel == null ? 0.65 : this.state.reverbLevel, 0, 1.5)
    this.widthT = reverbClamp(this.state.width == null ? 1 : this.state.width, 0, 2)
    const ven = REVERB_X_VENUES[this.state.venue] || REVERB_X_VENUES['concert-hall']
    const preMs = this.state.preDelayMs == null
      ? ven.preDelay * sizeScale(this.sizeT) * 1000
      : this.state.preDelayMs
    this.preT = reverbClamp(preMs, 0, 250) / 1000 * this.sr
    this.dampHzT = reverbClamp(this.state.dampingHz == null ? venueDampingHz(ven) : this.state.dampingHz, 500, 20000)
    const hasWet = !!(this.state.wetProcess && (this.state.wetPluginId || (this.state.wetChain && this.state.wetChain.length)))
    this.wetMixT = hasWet ? 1 : 0
    this.returnOnly = !!this.state.returnOnly
    this.wetChain.setFromState(this.state)
    const venue = this.state.venue || 'concert-hall'
    if (this.venueId && venue !== this.venueId) {
      this.clearDelays()
      this.muteSamples = (0.008 * this.sr) | 0
      this.lastCompileKey = ''
    }
    this.venueId = venue
    if (!this.inited) {
      this.amountZ = this.amountT
      this.sizeZ = this.sizeT
      this.decayZ = this.decayT
      this.levelZ = this.levelT
      this.widthZ = this.widthT
      this.preZ = this.preT
      this.dampHzZ = this.dampHzT
      this.dampA = dampCoeff(this.dampHzZ, this.sr)
      this.wetMixZ = this.wetMixT
      this.inited = true
      this.lastCompileKey = ''
    }
  }

  applyNetwork (net) {
    this.compiled = net
    this.taps = net.taps
    this.tapN = net.taps.length
    this.apG = net.apG
    this.earlyLevel = net.earlyLevel
    this.lateLevel = net.lateLevel
    for (let i = 0; i < REVERB_X_NUM_COMBS_; i++) {
      this.combDL[i] = net.combs[i].dL
      this.combDR[i] = net.combs[i].dR
      this.combMDL[i] = net.combs[i].dL
      this.combMDR[i] = net.combs[i].dR
      this.fb[i] = net.combs[i].fb
    }
    for (let i = 0; i < REVERB_X_NUM_ALLPASS_; i++) {
      this.apDL[i] = net.allpass[i].dL
      this.apDR[i] = net.allpass[i].dR
    }
  }

  compileIfNeeded () {
    const key = this.venueId + '|' + (this.sizeZ * 10000 | 0) + '|' + (this.decayZ * 1000 | 0)
    if (key === this.lastCompileKey) return
    this.lastCompileKey = key
    this.applyNetwork(compileReverbNetwork({
      venue: this.venueId,
      size: this.sizeZ,
      decay: this.decayZ,
      amount: this.amountT,
      returnOnly: this.returnOnly
    }, this.sr))
  }

  updateModulation (n) {
    const combDL = this.combDL
    const combDR = this.combDR
    const phase = this.modPhase
    const inc = this.modInc
    const twoPi = 2 * Math.PI
    for (let c = 0; c < REVERB_X_NUM_COMBS_; c++) {
      let p = phase[c] + inc[c] * n
      if (p >= twoPi) p -= twoPi
      phase[c] = p
      this.combMDL[c] = combDL[c] * (1 + REVERB_X_MOD_DEPTH_ * Math.sin(p))
      this.combMDR[c] = combDR[c] * (1 + REVERB_X_MOD_DEPTH_ * Math.sin(p + REVERB_X_MOD_R_SKEW_))
    }
  }

  process (l, r, n) {
    this.lastWetPeak = 0
    let base = 0
    while (base < n) {
      const left = n - base
      const count = left > REVERB_X_MAX_BLOCK_ ? REVERB_X_MAX_BLOCK_ : left
      this.renderChunk(l, r, base, count)
      base += count
    }
  }

  renderChunk (l, r, base, n) {
    const dt = n / this.sr
    this.sizeZ += (this.sizeT - this.sizeZ) * (1 - Math.exp(-dt / 0.08))
    this.decayZ += (this.decayT - this.decayZ) * (1 - Math.exp(-dt / 0.05))
    this.wetMixZ += (this.wetMixT - this.wetMixZ) * (1 - Math.exp(-dt / 0.03))
    this.preZ += (this.preT - this.preZ) * (1 - Math.exp(-dt / 0.05))
    this.dampHzZ += (this.dampHzT - this.dampHzZ) * (1 - Math.exp(-dt / 0.03))
    this.dampA = dampCoeff(this.dampHzZ, this.sr)
    this.compileIfNeeded()
    this.updateModulation(n)
    const wetL = this.scratchL
    const wetR = this.scratchR
    const taps = this.taps
    const tapN = this.tapN
    const combL = this.combL
    const combR = this.combR
    const apL = this.apL
    const apR = this.apR
    const combDL = this.combMDL
    const combDR = this.combMDR
    const fb = this.fb
    const dampZL = this.dampZL
    const dampZR = this.dampZR
    const apDL = this.apDL
    const apDR = this.apDR
    const dampA = this.dampA
    const apG = this.apG
    const eLvl = this.earlyLevel
    const lLvl = this.lateLevel
    const combNorm = this.combNorm
    const preD = this.preZ < 1 ? 1 : this.preZ
    const amtC = this.amtCoeff
    const amountT = this.amountT
    const levelT = this.levelT
    const widthT = this.widthT
    const satT = REVERB_X_SAT_T_
    let levelZ = this.levelZ
    let widthZ = this.widthZ
    let dcXL = this.dcXL
    let dcXR = this.dcXR
    let dcYL = this.dcYL
    let dcYR = this.dcYR
    let mute = this.muteSamples
    let wetPeak = 0
    let broken = false
    const DEN = 1e-30

    for (let i = 0; i < n; i++) {
      const j = base + i
      const inL = l[j]
      const inR = r[j]
      this.preL.write(inL)
      this.preR.write(inR)
      const pL = this.preL.tapFrac(preD)
      const pR = this.preR.tapFrac(preD)

      this.erL.write(pL)
      this.erR.write(pR)
      let eL = 0
      let eR = 0
      for (let t = 0; t < tapN; t++) {
        const tap = taps[t]
        eL += this.erL.tapFrac(tap.dL) * tap.gL
        eR += this.erR.tapFrac(tap.dR) * tap.gR
      }

      let accL = 0
      let accR = 0
      for (let c = 0; c < REVERB_X_NUM_COMBS_; c++) {
        const yL = combL[c].tapFrac(combDL[c])
        const yR = combR[c].tapFrac(combDR[c])
        const zL = dampZL[c] + dampA * (yL - dampZL[c]) + DEN
        const zR = dampZR[c] + dampA * (yR - dampZR[c]) + DEN
        dampZL[c] = zL
        dampZR[c] = zR
        let gL = zL * fb[c]
        let gR = zR * fb[c]
        if (gL > satT || gL < -satT) gL = reverbSoftSat(gL)
        if (gR > satT || gR < -satT) gR = reverbSoftSat(gR)
        combL[c].write(pL + gL)
        combR[c].write(pR + gR)
        accL += yL
        accR += yR
      }
      accL *= combNorm
      accR *= combNorm

      for (let a = 0; a < REVERB_X_NUM_ALLPASS_; a++) {
        const bufL = apL[a].tapFrac(apDL[a])
        const bufR = apR[a].tapFrac(apDR[a])
        const oL = -apG * accL + bufL
        const oR = -apG * accR + bufR
        apL[a].write(accL + apG * oL)
        apR[a].write(accR + apG * oR)
        accL = oL
        accR = oR
      }

      levelZ += (levelT - levelZ) * amtC
      widthZ += (widthT - widthZ) * amtC
      let wL = (eL * eLvl + accL * lLvl) * levelZ
      let wR = (eR * eLvl + accR * lLvl) * levelZ
      const mid = (wL + wR) * 0.5
      const side = (wL - wR) * 0.5 * widthZ
      wL = mid + side
      wR = mid - side

      const yL = wL - dcXL + 0.995 * dcYL
      const yR = wR - dcXR + 0.995 * dcYR
      dcXL = wL
      dcXR = wR
      dcYL = yL
      dcYR = yR

      let oL = yL
      let oR = yR
      if (mute > 0) {
        oL = 0
        oR = 0
        mute -= 1
      }
      if (oL > 4 || oL < -4 || oR > 4 || oR < -4 || oL !== oL || oR !== oR) {
        oL = 0
        oR = 0
        broken = true
      }
      wetL[i] = oL
      wetR[i] = oR
      const pk = oL > oR ? (oL < 0 ? -oL : oL) : (oR < 0 ? -oR : oR)
      if (pk > wetPeak) wetPeak = pk
    }

    this.dcXL = dcXL
    this.dcXR = dcXR
    this.dcYL = dcYL
    this.dcYR = dcYR
    this.muteSamples = mute
    this.lastWetPeak = wetPeak
    if (broken) this.clearDelays()

    this.wetChain.process(wetL, wetR, n, this.wetMixZ)

    const wetOnly = this.returnOnly
    let amountZ = this.amountZ
    for (let i = 0; i < n; i++) {
      amountZ += (amountT - amountZ) * amtC
      const g = amountZ
      const wL = wetL[i] * g
      const wR = wetR[i] * g
      l[i] = wetOnly ? wL : (l[i] + wL)
      r[i] = wetOnly ? wR : (r[i] + wR)
    }
    this.amountZ = amountZ
  }

  getViz () {
    return {
      wetPeak: this.lastWetPeak,
      decay: this.decayZ,
      sizeScale: sizeScale(this.sizeZ),
      venue: this.venueId
    }
  }
}

function reverbXMemoryBytes (sr) {
  const s = sr || 48000
  let samples = 0
  samples += 2 * (((s * REVERB_X_MAX_PRE_) | 0) + 8)
  samples += 2 * (((s * REVERB_X_MAX_ER_) | 0) + 8)
  samples += 2 * REVERB_X_NUM_COMBS_ * (((s * REVERB_X_MAX_COMB_) | 0) + 8)
  samples += 2 * REVERB_X_NUM_ALLPASS_ * (((s * REVERB_X_MAX_AP_) | 0) + 8)
  samples += 2048 * 4
  return samples * 4
}

function getReverbVisualization (state, sr) {
  const net = compileReverbNetwork(state, sr || 48000)
  const decay = net.decay
  const amount = net.wetGain
  const tMax = Math.min(12, Math.max(0.6, decay * 2.2))
  const envelope = []
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * tMax
    envelope.push({ t: t, env: amount * Math.pow(10, -3 * t / decay) })
  }
  return {
    wetGain: amount,
    sizeScale: net.sizeScale,
    decay: decay,
    venue: net.venue.id,
    venueName: net.venue.name,
    preDelay: net.preDelaySec,
    earlyTaps: net.taps.map(function (t) {
      return {
        t: net.preDelaySec + t.delaySec,
        gL: t.gL * net.earlyLevel,
        gR: t.gR * net.earlyLevel
      }
    }),
    damping: net.damping,
    lateLevel: net.lateLevel,
    theoreticalRt60: decay,
    tMax: tMax,
    envelope: envelope
  }
}

function reverbXReportMeta (sr) {
  const rate = sr || 48000
  return {
    algorithm: 'Early-reflection FIR network + Schroeder/Moorer late reverb (6 damped combs + 3 allpass diffusers, stereo)',
    mainDelayLines: REVERB_X_NUM_COMBS_,
    allpassStages: REVERB_X_NUM_ALLPASS_,
    delayLines: {
      preDelay: 2,
      early: 2,
      comb: REVERB_X_NUM_COMBS_ * 2,
      allpass: REVERB_X_NUM_ALLPASS_ * 2
    },
    maxMemoryBytes: reverbXMemoryBytes(rate),
    sampleRate: rate
  }
}

function workletDecl (name, fn) {
  const src = Function.prototype.toString.call(fn).trim()
  if (src.startsWith('class')) {
    return src
      .replace(/^class\s*[\w$]*/, 'class ' + name)
      .replace(/^class\s*\{/, 'class ' + name + ' {')
  }
  if (src.startsWith('function')) {
    const args = src.slice(src.indexOf('('))
    return 'function ' + name + args
  }
  return 'const ' + name + ' = ' + src
}

export const REVERB_X_CORE_SOURCE = `
const REVERB_X_VENUES = ${JSON.stringify(REVERB_X_VENUES)};
const REVERB_X_MAX_PRE_ = ${REVERB_X_MAX_PRE_};
const REVERB_X_MAX_ER_ = ${REVERB_X_MAX_ER_};
const REVERB_X_MAX_COMB_ = ${REVERB_X_MAX_COMB_};
const REVERB_X_MAX_AP_ = ${REVERB_X_MAX_AP_};
const REVERB_X_MIN_DELAY_ = ${REVERB_X_MIN_DELAY_};
const REVERB_X_NUM_COMBS_ = ${REVERB_X_NUM_COMBS_};
const REVERB_X_NUM_ALLPASS_ = ${REVERB_X_NUM_ALLPASS_};
const REVERB_X_MAX_BLOCK_ = ${REVERB_X_MAX_BLOCK_};
const REVERB_X_COMB_SEC = [${REVERB_X_COMB_SEC.join(',')}];
const REVERB_X_COMB_R_OFF_SEC = [${REVERB_X_COMB_R_OFF_SEC.join(',')}];
const REVERB_X_ALLPASS_SEC = [${REVERB_X_ALLPASS_SEC.join(',')}];
const REVERB_X_ALLPASS_R_OFF_SEC = [${REVERB_X_ALLPASS_R_OFF_SEC.join(',')}];
const REVERB_X_COMB_BASE = REVERB_X_COMB_SEC;
const REVERB_X_COMB_R_OFF = REVERB_X_COMB_R_OFF_SEC;
const REVERB_X_ALLPASS_BASE = REVERB_X_ALLPASS_SEC;
const REVERB_X_ALLPASS_R_OFF = REVERB_X_ALLPASS_R_OFF_SEC;
const REVERB_X_MOD_HZ = [${REVERB_X_MOD_HZ.join(',')}];
const REVERB_X_MOD_PHASE = [${REVERB_X_MOD_PHASE.join(',')}];
const REVERB_X_MOD_DEPTH_ = ${REVERB_X_MOD_DEPTH_};
const REVERB_X_MOD_R_SKEW_ = ${REVERB_X_MOD_R_SKEW_};
const REVERB_X_SAT_T_ = ${REVERB_X_SAT_T_};
const REVERB_X_SAT_K_ = ${REVERB_X_SAT_K_};
${workletDecl('reverbClamp', reverbClamp)}
${workletDecl('reverbSoftSat', reverbSoftSat)}
${workletDecl('dampCoeff', dampCoeff)}
${workletDecl('venueDampingHz', venueDampingHz)}
${workletDecl('sizeScale', sizeScale)}
${workletDecl('feedbackGain', feedbackGain)}
${workletDecl('compileReverbNetwork', compileReverbNetwork)}
${workletDecl('wetInsertsFromState', wetInsertsFromState)}
${workletDecl('ReverbDelayLine', ReverbDelayLine)}
${workletDecl('WetProcessorChain', WetProcessorChain)}
${workletDecl('ReverbXProcessor', ReverbXProcessor)}
`

export {
  sizeScale,
  feedbackGain,
  compileReverbNetwork,
  wetInsertsFromState,
  reverbXMemoryBytes,
  getReverbVisualization,
  reverbXReportMeta,
  ReverbDelayLine,
  WetProcessorChain,
  ReverbXProcessor
}
