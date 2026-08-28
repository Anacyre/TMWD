/** AudioWorklet-safe Equalizer X kernel. No imports. No nested template literals. */
export const EQUALIZER_X_PROCESSOR_SOURCE = `
var EQX_API = (function () {
  'use strict'

  var FREQ_MIN = 20
  var FREQ_MAX = 20000
  var NODE_GAIN_MIN = -18
  var NODE_GAIN_MAX = 18
  var Q_MIN = 0.2
  var Q_MAX = 12
  var MAX_NODES = 7
  var MAX_BIQUADS = 4
  var FFT_SIZE = 1024
  var VIZ_BINS = 192
  var VIZ_FPS = 24
  var AUTO_GAIN_CLAMP = 12
  var SMOOTH_PARAM_SEC = 0.02
  var SMOOTH_GAIN_SEC = 0.012
  var RMS_WINDOW_SEC = 0.08
  var AUTO_ATK_SEC = 0.07
  var AUTO_REL_SEC = 0.22
  var BUTTER_Q = 0.7071067811865476
  var EPS = 1e-12
  var SPEC_MIN_DB = -90
  var SPEC_MAX_DB = -12

  var EQX = {
    FREQ_MIN: FREQ_MIN,
    FREQ_MAX: FREQ_MAX,
    NODE_GAIN_MIN: NODE_GAIN_MIN,
    NODE_GAIN_MAX: NODE_GAIN_MAX,
    Q_MIN: Q_MIN,
    Q_MAX: Q_MAX,
    MAX_NODES: MAX_NODES,
    MAX_BIQUADS: MAX_BIQUADS,
    FFT_SIZE: FFT_SIZE,
    VIZ_BINS: VIZ_BINS,
    VIZ_FPS: VIZ_FPS,
    AUTO_GAIN_CLAMP: AUTO_GAIN_CLAMP,
    topology: 'DF2T',
    fftWindow: 'hann'
  }

  function clamp (v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v)
  }

  function isFiniteNum (v) {
    return typeof v === 'number' && isFinite(v)
  }

  function cutOrder (slope) {
    var s = slope || 12
    if (s >= 48) return 8
    if (s >= 36) return 6
    if (s >= 30) return 5
    if (s >= 24) return 4
    if (s >= 18) return 3
    if (s >= 12) return 2
    return 1
  }

  function emptyBiquad (c) {
    if (!c) c = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
    else { c.b0 = 1; c.b1 = 0; c.b2 = 0; c.a1 = 0; c.a2 = 0 }
    return c
  }

  function emptyFo (c) {
    if (!c) c = { b0: 1, b1: 0, a1: 0 }
    else { c.b0 = 1; c.b1 = 0; c.a1 = 0 }
    return c
  }

  function designBiquad (type, freq, q, gainDb, sr, slope, out) {
    out = emptyBiquad(out)
    if (!sr || sr < 1000) return out
    var ny = sr * 0.49
    var f = clamp(freq || 1000, FREQ_MIN, ny)
    var w0 = 2 * Math.PI * f / sr
    var cos = Math.cos(w0)
    var sin = Math.sin(w0)
    var A = Math.pow(10, (gainDb || 0) / 40)
    var alpha
    var isShelf = type === 'lowshelf' || type === 'highshelf'
    if (isShelf && slope != null && slope > 0) {
      var S = clamp((slope || 12) / 12, 0.25, 1)
      alpha = sin * 0.5 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2)
    } else {
      var Q = clamp(q == null ? BUTTER_Q : q, 0.05, 40)
      alpha = sin / (2 * Q)
    }
    var b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0
    var twoSqrtAAlpha
    if (type === 'lowcut' || type === 'highpass') {
      b0 = (1 + cos) * 0.5
      b1 = -(1 + cos)
      b2 = (1 + cos) * 0.5
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
    } else if (type === 'highcut' || type === 'lowpass') {
      b0 = (1 - cos) * 0.5
      b1 = 1 - cos
      b2 = (1 - cos) * 0.5
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
    } else if (type === 'notch') {
      b0 = 1
      b1 = -2 * cos
      b2 = 1
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
    } else if (type === 'bandpass') {
      b0 = alpha
      b1 = 0
      b2 = -alpha
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
    } else if (type === 'lowshelf') {
      twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha
      b0 = A * ((A + 1) - (A - 1) * cos + twoSqrtAAlpha)
      b1 = 2 * A * ((A - 1) - (A + 1) * cos)
      b2 = A * ((A + 1) - (A - 1) * cos - twoSqrtAAlpha)
      a0 = (A + 1) + (A - 1) * cos + twoSqrtAAlpha
      a1 = -2 * ((A - 1) + (A + 1) * cos)
      a2 = (A + 1) + (A - 1) * cos - twoSqrtAAlpha
    } else if (type === 'highshelf') {
      twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha
      b0 = A * ((A + 1) + (A - 1) * cos + twoSqrtAAlpha)
      b1 = -2 * A * ((A - 1) + (A + 1) * cos)
      b2 = A * ((A + 1) + (A - 1) * cos - twoSqrtAAlpha)
      a0 = (A + 1) - (A - 1) * cos + twoSqrtAAlpha
      a1 = 2 * ((A - 1) - (A + 1) * cos)
      a2 = (A + 1) - (A - 1) * cos - twoSqrtAAlpha
    } else {
      b0 = 1 + alpha * A
      b1 = -2 * cos
      b2 = 1 - alpha * A
      a0 = 1 + alpha / A
      a1 = -2 * cos
      a2 = 1 - alpha / A
    }
    if (!a0) a0 = 1
    out.b0 = b0 / a0
    out.b1 = b1 / a0
    out.b2 = b2 / a0
    out.a1 = a1 / a0
    out.a2 = a2 / a0
    if (!isFiniteNum(out.b0) || !isFiniteNum(out.a1)) emptyBiquad(out)
    return out
  }

  function designFirstOrder (type, freq, sr, out) {
    out = emptyFo(out)
    if (!sr || sr < 1000) return out
    var ny = sr * 0.49
    var f = clamp(freq || 1000, FREQ_MIN, ny)
    var g = Math.tan(Math.PI * f / sr)
    var a = 1 / (1 + g)
    var hp = type === 'lowcut' || type === 'highpass'
    if (hp) {
      out.b0 = a
      out.b1 = -a
      out.a1 = (g - 1) * a
    } else {
      out.b0 = g * a
      out.b1 = g * a
      out.a1 = (g - 1) * a
    }
    if (!isFiniteNum(out.b0) || !isFiniteNum(out.a1)) emptyFo(out)
    return out
  }

  function createRecipe () {
    return {
      nBq: 0,
      hasFo: false,
      type: 'bell',
      bq: [emptyBiquad(), emptyBiquad(), emptyBiquad(), emptyBiquad()],
      fo: emptyFo()
    }
  }

  function designNode (node, sr, recipe) {
    if (!recipe) recipe = createRecipe()
    recipe.nBq = 0
    recipe.hasFo = false
    recipe.type = (node && (node.shape || node.type)) || 'bell'
    if (!node) return recipe
    var type = recipe.type
    var freq = node.freq != null ? node.freq : (node.frequency != null ? node.frequency : 1000)
    var gain = node.gain || 0
    var q = node.q != null ? node.q : 0.9
    var slope = node.slope != null ? node.slope : 12
    var i
    if (type === 'lowcut' || type === 'highcut' || type === 'highpass' || type === 'lowpass') {
      var mapped = type === 'highpass' ? 'lowcut' : (type === 'lowpass' ? 'highcut' : type)
      var order = cutOrder(slope)
      recipe.nBq = order >> 1
      recipe.hasFo = !!(order & 1)
      if (recipe.nBq > MAX_BIQUADS) recipe.nBq = MAX_BIQUADS
      for (i = 0; i < recipe.nBq; i++) designBiquad(mapped, freq, BUTTER_Q, 0, sr, 0, recipe.bq[i])
      if (recipe.hasFo) designFirstOrder(mapped, freq, sr, recipe.fo)
    } else if (type === 'lowshelf' || type === 'highshelf') {
      recipe.nBq = 1
      designBiquad(type, freq, q, gain, sr, slope, recipe.bq[0])
    } else {
      recipe.nBq = 1
      designBiquad(type, freq, q, gain, sr, 0, recipe.bq[0])
    }
    return recipe
  }

  function biquadMag2 (c, w) {
    var c1 = Math.cos(w)
    var s1 = Math.sin(w)
    var c2 = Math.cos(2 * w)
    var s2 = Math.sin(2 * w)
    var br = c.b0 + c.b1 * c1 + c.b2 * c2
    var bi = -(c.b1 * s1 + c.b2 * s2)
    var ar = 1 + c.a1 * c1 + c.a2 * c2
    var ai = -(c.a1 * s1 + c.a2 * s2)
    var den = ar * ar + ai * ai
    if (den < 1e-24) return 1
    return (br * br + bi * bi) / den
  }

  function foMag2 (c, w) {
    var c1 = Math.cos(w)
    var s1 = Math.sin(w)
    var br = c.b0 + c.b1 * c1
    var bi = -c.b1 * s1
    var ar = 1 + c.a1 * c1
    var ai = -c.a1 * s1
    var den = ar * ar + ai * ai
    if (den < 1e-24) return 1
    return (br * br + bi * bi) / den
  }

  function recipeMag2 (recipe, w) {
    var m = 1
    var i
    for (i = 0; i < recipe.nBq; i++) m *= biquadMag2(recipe.bq[i], w)
    if (recipe.hasFo) m *= foMag2(recipe.fo, w)
    return m
  }

  function eqResponseDb (freq, nodes, sr) {
    sr = sr || 48000
    var w = 2 * Math.PI * clamp(freq, 0.01, sr * 0.49) / sr
    var mag2 = 1
    var list = nodes || []
    var tmp = createRecipe()
    var i
    for (i = 0; i < list.length && i < MAX_NODES; i++) {
      var node = list[i]
      if (!node || node.enabled === false) continue
      designNode(node, sr, tmp)
      mag2 *= recipeMag2(tmp, w)
    }
    if (!(mag2 > 0)) mag2 = EPS
    return 10 * Math.log10(mag2)
  }

  function EqBiquad () {
    this.z1 = 0
    this.z2 = 0
    this.b0 = 1
    this.b1 = 0
    this.b2 = 0
    this.a1 = 0
    this.a2 = 0
    this.on = false
  }
  EqBiquad.prototype.set = function (b0, b1, b2, a1, a2) {
    this.b0 = b0
    this.b1 = b1
    this.b2 = b2
    this.a1 = a1
    this.a2 = a2
    this.on = true
  }
  EqBiquad.prototype.reset = function () {
    this.z1 = 0
    this.z2 = 0
  }
  EqBiquad.prototype.flush = function () {
    if (this.z1 > -1e-18 && this.z1 < 1e-18) this.z1 = 0
    if (this.z2 > -1e-18 && this.z2 < 1e-18) this.z2 = 0
  }
  EqBiquad.prototype.tick = function (x) {
    if (!this.on) return x
    var y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    if (y === y && y !== Infinity && y !== -Infinity) return y
    this.z1 = 0
    this.z2 = 0
    return 0
  }

  function EqFo () {
    this.z1 = 0
    this.b0 = 1
    this.b1 = 0
    this.a1 = 0
    this.on = false
  }
  EqFo.prototype.set = function (b0, b1, a1) {
    this.b0 = b0
    this.b1 = b1
    this.a1 = a1
    this.on = true
  }
  EqFo.prototype.reset = function () { this.z1 = 0 }
  EqFo.prototype.flush = function () {
    if (this.z1 > -1e-18 && this.z1 < 1e-18) this.z1 = 0
  }
  EqFo.prototype.tick = function (x) {
    if (!this.on) return x
    var y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y
    if (y === y && y !== Infinity && y !== -Infinity) return y
    this.z1 = 0
    return 0
  }

  function SpectrumAnalyzer (sr, fftSize, vizBins, fps) {
    this.sr = sr || 48000
    this.N = fftSize || FFT_SIZE
    this.bins = vizBins || VIZ_BINS
    this.fps = fps || VIZ_FPS
    this.hop = Math.max(this.N, Math.round(this.sr / this.fps))
    this.buf = new Float32Array(this.N)
    this.win = new Float32Array(this.N)
    this.re = new Float32Array(this.N)
    this.im = new Float32Array(this.N)
    this.cos = new Float32Array(this.N)
    this.sin = new Float32Array(this.N)
    this.rev = new Uint16Array(this.N)
    this.display = new Float32Array(this.bins)
    this.displayDb = new Float32Array(this.bins)
    this.copy = new Array(this.bins)
    this.w = 0
    this.filled = 0
    this.since = 0
    this.ready = false
    this.winSum = 0
    var n = this.N
    var i, j, k
    for (i = 0; i < n; i++) {
      this.win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)))
      this.winSum += this.win[i]
      this.cos[i] = Math.cos(2 * Math.PI * i / n)
      this.sin[i] = -Math.sin(2 * Math.PI * i / n)
    }
    for (i = 0; i < this.bins; i++) this.displayDb[i] = SPEC_MIN_DB
    var bits = 0
    while ((1 << bits) < n) bits++
    for (i = 0; i < n; i++) {
      j = 0
      k = i
      for (var b = 0; b < bits; b++) {
        j = (j << 1) | (k & 1)
        k >>= 1
      }
      this.rev[i] = j
    }
    for (i = 0; i < this.bins; i++) this.copy[i] = 0
  }
  SpectrumAnalyzer.prototype.push = function (l, r, n) {
    var i, x
    for (i = 0; i < n; i++) {
      x = 0.5 * ((l[i] || 0) + (r[i] || 0))
      this.buf[this.w] = x
      this.w++
      if (this.w >= this.N) this.w = 0
      if (this.filled < this.N) this.filled++
    }
    this.since += n
    if (this.filled >= this.N && this.since >= this.hop) {
      this.since = 0
      this.transform()
    }
  }
  SpectrumAnalyzer.prototype.transform = function () {
    var n = this.N
    var i, j, half, stage, step, wr, wi, tr, ti, ur, ui, idx, k
    var wpos = this.w
    for (i = 0; i < n; i++) {
      j = wpos + i
      if (j >= n) j -= n
      this.re[this.rev[i]] = this.buf[j] * this.win[i]
      this.im[this.rev[i]] = 0
    }
    for (stage = 2; stage <= n; stage <<= 1) {
      half = stage >> 1
      step = n / stage
      for (i = 0; i < n; i += stage) {
        idx = 0
        for (k = 0; k < half; k++) {
          wr = this.cos[idx]
          wi = this.sin[idx]
          ur = this.re[i + k]
          ui = this.im[i + k]
          tr = wr * this.re[i + k + half] - wi * this.im[i + k + half]
          ti = wr * this.im[i + k + half] + wi * this.re[i + k + half]
          this.re[i + k] = ur + tr
          this.im[i + k] = ui + ti
          this.re[i + k + half] = ur - tr
          this.im[i + k + half] = ui - ti
          idx += step
        }
      }
    }
    var scale = 2 / Math.max(1e-8, this.winSum)
    var nyquist = this.sr * 0.5
    var logMin = Math.log(FREQ_MIN)
    var logSpan = Math.log(Math.min(FREQ_MAX, nyquist)) - logMin
    var prevDb
    var alphaUp = 0.4
    var alphaDn = 0.15
    for (i = 0; i < this.bins; i++) {
      var t0 = i / this.bins
      var t1 = (i + 1) / this.bins
      var f0 = Math.exp(logMin + t0 * logSpan)
      var f1 = Math.exp(logMin + t1 * logSpan)
      var b0 = Math.max(1, Math.floor(f0 / nyquist * (n * 0.5)))
      var b1 = Math.min((n * 0.5) - 1, Math.ceil(f1 / nyquist * (n * 0.5)))
      if (b1 < b0) b1 = b0
      var peak = 0
      for (k = b0; k <= b1; k++) {
        var mag = Math.sqrt(this.re[k] * this.re[k] + this.im[k] * this.im[k]) * scale
        if (mag > peak) peak = mag
      }
      var db = 20 * Math.log10(peak + EPS)
      prevDb = this.displayDb[i]
      if (db > prevDb) this.displayDb[i] = alphaUp * db + (1 - alphaUp) * prevDb
      else this.displayDb[i] = alphaDn * db + (1 - alphaDn) * prevDb
      var norm = (this.displayDb[i] - SPEC_MIN_DB) / (SPEC_MAX_DB - SPEC_MIN_DB)
      if (norm < 0) norm = 0
      if (norm > 1) norm = 1
      this.display[i] = norm
      this.copy[i] = norm
    }
    this.ready = true
  }
  SpectrumAnalyzer.prototype.getArray = function () {
    return this.copy
  }

  function makeParams () {
    return {
      used: false,
      enabled: false,
      solo: false,
      type: 'bell',
      sType: 'bell',
      tFreq: 1000, sFreq: 1000,
      tGain: 0, sGain: 0,
      tQ: 0.9, sQ: 0.9,
      tSlope: 12, sSlope: 12,
      nBq: 0,
      hasFo: false
    }
  }

  function EqualizerXProcessor (sr) {
    this.sr = sr || 48000
    this.params = []
    this.recipe = []
    this.L = []
    this.R = []
    this.foL = []
    this.foR = []
    this.audL = new EqBiquad()
    this.audR = new EqBiquad()
    this.audRecipe = createRecipe()
    this.autoOn = false
    this.tGain = 1
    this.gain = 1
    this.inRms2 = 1e-12
    this.outRms2 = 1e-12
    this.compDb = 0
    this.compGain = 1
    this.autoGainDb = 0
    this._yl = 0
    this._yr = 0
    this._node = { shape: 'bell', freq: 1000, gain: 0, q: 0.9, slope: 12, enabled: true }
    this.analyzer = new SpectrumAnalyzer(this.sr, FFT_SIZE, VIZ_BINS, VIZ_FPS)
    var i, s
    for (i = 0; i < MAX_NODES; i++) {
      this.params.push(makeParams())
      this.recipe.push(createRecipe())
      this.L.push([])
      this.R.push([])
      for (s = 0; s < MAX_BIQUADS; s++) {
        this.L[i].push(new EqBiquad())
        this.R[i].push(new EqBiquad())
      }
      this.foL.push(new EqFo())
      this.foR.push(new EqFo())
    }
  }

  EqualizerXProcessor.prototype.reset = function () {
    var i, s
    for (i = 0; i < MAX_NODES; i++) {
      for (s = 0; s < MAX_BIQUADS; s++) {
        this.L[i][s].reset()
        this.R[i][s].reset()
      }
      this.foL[i].reset()
      this.foR[i].reset()
    }
    this.audL.reset()
    this.audR.reset()
  }

  EqualizerXProcessor.prototype.setState = function (state) {
    this.autoOn = !!(state && state.autoGain)
    this.tGain = Math.pow(10, ((state && state.outputGainDb) || 0) / 20)
    if (!isFiniteNum(this.tGain)) this.tGain = 1
    var nodes = state && state.nodes
    var len = nodes && nodes.length ? nodes.length : 0
    if (len > MAX_NODES) len = MAX_NODES
    var i
    for (i = 0; i < MAX_NODES; i++) {
      var dst = this.params[i]
      if (i >= len || !nodes[i]) {
        dst.used = false
        dst.enabled = false
        dst.solo = false
        continue
      }
      var src = nodes[i]
      dst.used = true
      dst.enabled = src.enabled !== false
      dst.solo = !!src.solo
      dst.type = src.shape || src.type || 'bell'
      dst.tFreq = src.freq != null ? src.freq : (src.frequency != null ? src.frequency : 1000)
      dst.tGain = src.gain || 0
      dst.tQ = src.q != null ? src.q : 0.9
      dst.tSlope = src.slope != null ? src.slope : 12
    }
  }

  EqualizerXProcessor.prototype.applyRecipe = function (index, recipe, reset) {
    var s
    var p = this.params[index]
    p.nBq = recipe.nBq
    p.hasFo = recipe.hasFo
    for (s = 0; s < MAX_BIQUADS; s++) {
      if (s < recipe.nBq) {
        var c = recipe.bq[s]
        this.L[index][s].set(c.b0, c.b1, c.b2, c.a1, c.a2)
        this.R[index][s].set(c.b0, c.b1, c.b2, c.a1, c.a2)
      } else {
        this.L[index][s].on = false
        this.R[index][s].on = false
      }
      if (reset) {
        this.L[index][s].reset()
        this.R[index][s].reset()
      }
    }
    if (recipe.hasFo) {
      this.foL[index].set(recipe.fo.b0, recipe.fo.b1, recipe.fo.a1)
      this.foR[index].set(recipe.fo.b0, recipe.fo.b1, recipe.fo.a1)
    } else {
      this.foL[index].on = false
      this.foR[index].on = false
    }
    if (reset) {
      this.foL[index].reset()
      this.foR[index].reset()
    }
  }

  EqualizerXProcessor.prototype.updateCoeffs = function (n) {
    var a = 1 - Math.exp(-n / (SMOOTH_PARAM_SEC * this.sr))
    if (a > 1) a = 1
    var i, s
    var node = this._node
    for (i = 0; i < MAX_NODES; i++) {
      var p = this.params[i]
      if (!p.used) {
        p.nBq = 0
        p.hasFo = false
        p._designed = false
        for (s = 0; s < MAX_BIQUADS; s++) {
          this.L[i][s].on = false
          this.R[i][s].on = false
        }
        this.foL[i].on = false
        this.foR[i].on = false
        continue
      }
      var typeChanged = p.type !== p.sType
      var nextOrder = (p.type === 'lowcut' || p.type === 'highcut') ? cutOrder(p.tSlope) : 2
      var prevOrder = (p.sType === 'lowcut' || p.sType === 'highcut') ? cutOrder(p.sSlope) : 2
      var topoChanged = typeChanged || nextOrder !== prevOrder
      if (topoChanged) {
        p.sFreq = p.tFreq
        p.sGain = p.tGain
        p.sQ = p.tQ
        p.sSlope = p.tSlope
        p.sType = p.type
      } else {
        p.sFreq += (p.tFreq - p.sFreq) * a
        p.sGain += (p.tGain - p.sGain) * a
        p.sQ += (p.tQ - p.sQ) * a
        p.sSlope = p.tSlope
        p.sType = p.type
      }
      if (!p.enabled) {
        p.nBq = 0
        p.hasFo = false
        p._designed = false
        for (s = 0; s < MAX_BIQUADS; s++) {
          this.L[i][s].on = false
          this.R[i][s].on = false
        }
        this.foL[i].on = false
        this.foR[i].on = false
        continue
      }
      var settled = Math.abs(p.sFreq - p.tFreq) < 1e-4 && Math.abs(p.sGain - p.tGain) < 1e-4 && Math.abs(p.sQ - p.tQ) < 1e-5
      if (!topoChanged && settled && p._designed) continue
      p._designed = true
      node.shape = p.sType
      node.freq = p.sFreq
      node.gain = p.sGain
      node.q = p.sQ
      node.slope = p.sSlope
      designNode(node, this.sr, this.recipe[i])
      this.applyRecipe(i, this.recipe[i], topoChanged)
    }
  }

  EqualizerXProcessor.prototype.processNode = function (index, xL, xR) {
    var s
    var nBq = this.params[index].nBq
    for (s = 0; s < nBq; s++) {
      xL = this.L[index][s].tick(xL)
      xR = this.R[index][s].tick(xR)
    }
    if (this.params[index].hasFo) {
      xL = this.foL[index].tick(xL)
      xR = this.foR[index].tick(xR)
    }
    this._yl = xL
    this._yr = xR
  }

  EqualizerXProcessor.prototype.process = function (l, r, n) {
    this.updateCoeffs(n)
    var solo = -1
    var i, s
    for (i = 0; i < MAX_NODES; i++) {
      if (this.params[i].used && this.params[i].enabled && this.params[i].solo) solo = i
    }
    var ga = 1 - Math.exp(-n / (SMOOTH_GAIN_SEC * this.sr))
    this.gain += (this.tGain - this.gain) * ga
    var inPow = 0
    var outPow = 0
    var xL, xR
    var audType = solo >= 0 ? this.params[solo].type : ''
    var useAud = audType === 'lowshelf' || audType === 'highshelf' || audType === 'notch'
    if (useAud) {
      var audShape = audType === 'lowshelf' ? 'highcut' : (audType === 'highshelf' ? 'lowcut' : 'bandpass')
      var sp = this.params[solo]
      designBiquad(audShape, sp.sFreq, audType === 'notch' ? sp.sQ : BUTTER_Q, 0, this.sr, 0, this.audRecipe.bq[0])
      var ac = this.audRecipe.bq[0]
      this.audL.set(ac.b0, ac.b1, ac.b2, ac.a1, ac.a2)
      this.audR.set(ac.b0, ac.b1, ac.b2, ac.a1, ac.a2)
    } else {
      this.audL.on = false
      this.audR.on = false
    }

    for (i = 0; i < n; i++) {
      xL = l[i]
      xR = r[i]
      inPow += xL * xL + xR * xR
      if (solo >= 0) {
        if (useAud) {
          xL = this.audL.tick(xL)
          xR = this.audR.tick(xR)
        } else {
          this.processNode(solo, xL, xR)
          xL = this._yl
          xR = this._yr
        }
      } else {
        for (s = 0; s < MAX_NODES; s++) {
          if (!this.params[s].used || !this.params[s].enabled) continue
          this.processNode(s, xL, xR)
          xL = this._yl
          xR = this._yr
        }
      }
      if (xL !== xL || xL === Infinity || xL === -Infinity) xL = 0
      if (xR !== xR || xR === Infinity || xR === -Infinity) xR = 0
      outPow += xL * xL + xR * xR
      l[i] = xL
      r[i] = xR
    }

    var meanIn = inPow / Math.max(1, n * 2)
    var meanOut = outPow / Math.max(1, n * 2)
    var rmsA = 1 - Math.exp(-n / (RMS_WINDOW_SEC * this.sr))
    this.inRms2 += (meanIn - this.inRms2) * rmsA
    this.outRms2 += (meanOut - this.outRms2) * rmsA
    var inDb = 10 * Math.log10(this.inRms2 + EPS)
    var outDb = 10 * Math.log10(this.outRms2 + EPS)
    var err = this.autoOn ? clamp(inDb - outDb, -AUTO_GAIN_CLAMP, AUTO_GAIN_CLAMP) : 0
    var tau = err < this.compDb ? AUTO_ATK_SEC : AUTO_REL_SEC
    var ca = 1 - Math.exp(-n / (tau * this.sr))
    this.compDb += (err - this.compDb) * ca
    this.autoGainDb = this.compDb
    this.compGain = Math.pow(10, this.compDb / 20)
    if (!isFiniteNum(this.compGain)) this.compGain = 1
    var g = this.gain * this.compGain
    if (!isFiniteNum(g)) g = 1
    for (i = 0; i < n; i++) {
      l[i] *= g
      r[i] *= g
    }

    this.analyzer.push(l, r, n)

    for (i = 0; i < MAX_NODES; i++) {
      if (!this.params[i].used || !this.params[i].enabled) continue
      for (s = 0; s < this.params[i].nBq; s++) {
        this.L[i][s].flush()
        this.R[i][s].flush()
      }
      if (this.params[i].hasFo) {
        this.foL[i].flush()
        this.foR[i].flush()
      }
    }
  }

  EqualizerXProcessor.prototype.getSpectrumArray = function () {
    return this.analyzer.getArray()
  }

  return {
    EQX: EQX,
    designBiquad: designBiquad,
    designFirstOrder: designFirstOrder,
    designNode: designNode,
    createRecipe: createRecipe,
    biquadMag2: biquadMag2,
    foMag2: foMag2,
    recipeMag2: recipeMag2,
    eqResponseDb: eqResponseDb,
    cutOrder: cutOrder,
    EqualizerXProcessor: EqualizerXProcessor,
    SpectrumAnalyzer: SpectrumAnalyzer,
    EqBiquad: EqBiquad
  }
})();
`
