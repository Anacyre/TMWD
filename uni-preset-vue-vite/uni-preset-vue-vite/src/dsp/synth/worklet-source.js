export const TWIN_WORKLET_SOURCE = `
// ---- Wavetable generation (mirrors params.js so data matches offline render) ----
var WT_RECIPES = [
  [[1,1]],
  (function(){var a=[];for(var i=0;i<16;i++)a.push([i+1,1/(i+1)]);return a;})(),
  (function(){var a=[];for(var i=0;i<8;i++)a.push([i*2+1,1/(i*2+1)]);return a;})(),
  (function(){var a=[];for(var i=0;i<8;i++)a.push([i*2+1,1/((i*2+1)*(i*2+1))]);return a;})(),
  [[1,1],[2,0.7],[3,0.45],[4,0.25]],
  [[1,1],[2,0.55],[3,0.35],[4,0.22],[5,0.14]],
  [[1,1],[2,0.4],[3,0.32],[4,0.2],[5,0.14],[6,0.1]],
  [[1,1],[3,0.55],[5,0.35],[7,0.18],[9,0.12]]
]
function buildWavetable (index, size) {
  size = size || 2048
  var recipe = WT_RECIPES[Math.max(0, Math.min(WT_RECIPES.length - 1, index | 0))] || WT_RECIPES[0]
  var table = new Float32Array(size)
  for (var i = 0; i < size; i++) {
    var ph = i / size, s = 0
    for (var k = 0; k < recipe.length; k++) s += recipe[k][1] * Math.sin(ph * recipe[k][0] * Math.PI * 2)
    table[i] = s
  }
  var peak = 0.0001
  for (var j = 0; j < size; j++) peak = Math.max(peak, Math.abs(table[j]))
  var g = 0.89 / peak
  for (var m = 0; m < size; m++) table[m] *= g
  return table
}
var WAVETABLES = WT_RECIPES.map(function (_, i) { return buildWavetable(i) })

// ---- DSP helpers (parity with voice.js) ----
function div (b0,b1,b2,a1,a2,a0){return {b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0}}
function coeffsFor (type, cutoff, res, sr) {
  var f = Math.max(20, Math.min(sr * 0.45, cutoff))
  var w = 2 * Math.PI * f / sr
  var q = Math.max(0.3, 0.5 + res * 8)
  var a = Math.sin(w) / (2 * q)
  var cos = Math.cos(w)
  if (type === 'highpass' || type === 'high12') return div((1+cos)/2, -(1+cos), (1+cos)/2, -2*cos, 1-a, 1+a)
  if (type === 'bandpass') return div(a, 0, -a, -2*cos, 1-a, 1+a)
  if (type === 'notch') return div(1, -2*cos, 1, -2*cos, 1-a, 1+a)
  if (type === 'shelf') {
    var gain = 1 + res * 4, A = Math.sqrt(gain), sq = Math.sqrt(A), sw = Math.sin(w)
    var b0 = A*((A+1)-(A-1)*cos+2*sq*sw), b1 = 2*A*((A-1)-(A+1)*cos), b2 = A*((A+1)-(A-1)*cos-2*sq*sw)
    var a0 = (A+1)+(A-1)*cos+2*sq*sw, a1 = -2*((A-1)+(A+1)*cos), a2 = (A+1)+(A-1)*cos-2*sq*sw
    return div(b0,b1,b2,a1,a2,a0)
  }
  return div((1-cos)/2, 1-cos, (1-cos)/2, -2*cos, 1-a, 1+a)
}
function makeFilt (type, cutoff, res, sr) {
  var order = (type === 'lowpass' || type === 'highpass' || type === 'bandpass') ? 2 : 1
  var stages = [], z1 = [], z2 = []
  for (var i = 0; i < order; i++) { stages.push(coeffsFor(type, cutoff, res, sr)); z1.push(0); z2.push(0) }
  return { stages: stages, z1: z1, z2: z2 }
}
function tickFilt (flt, x) {
  var y = x
  for (var s = 0; s < flt.stages.length; s++) {
    var c = flt.stages[s]
    var yy = c.b0 * y + flt.z1[s]
    flt.z1[s] = c.b1 * y - c.a1 * yy + flt.z2[s]
    flt.z2[s] = c.b2 * y - c.a2 * yy
    y = yy
  }
  return y
}
// Recompute coefficients but KEEP delay-line state (poles) across samples.
function updateFilter (flt, type, cutoff, res, sr) {
  var nf = makeFilt(type, cutoff, res, sr)
  nf.z1 = flt.z1; nf.z2 = flt.z2
  return nf
}
function driveShape (x, drive) {
  if (drive < 0.001) return x
  var k = 1 + drive
  return Math.tanh(x * k) / Math.tanh(k)
}
function wtSample (pos, phase) {
  var n = WAVETABLES.length
  var x = Math.max(0, Math.min(n - 1, pos))
  var i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), frac = x - i0
  var t0 = WAVETABLES[i0], t1 = WAVETABLES[i1]
  var p = phase * t0.length, j = p | 0, f = p - j
  var a = t0[j % t0.length] + (t0[(j+1)%t0.length] - t0[j%t0.length]) * f
  var b = t1[j % t1.length] + (t1[(j+1)%t1.length] - t1[j%t1.length]) * f
  return a + (b - a) * frac
}
function oscSample (wave, phase, wtPos) {
  if (wave === 'sine') return Math.sin(phase * Math.PI * 2)
  if (wave === 'square') return phase < 0.5 ? 1 : -1
  if (wave === 'tri') return 1 - 4 * Math.abs(Math.round(phase) - phase)
  if (wave === 'saw') return phase * 2 - 1
  if (wave === 'noise') return Math.random() * 2 - 1
  return wtSample(wtPos, phase)
}
function lfoValue (lfo, t) {
  var ph = (t * lfo.rate) % 1
  if (lfo.shape === 'square') return ph < 0.5 ? 1 : -1
  if (lfo.shape === 'saw') return ph * 2 - 1
  if (lfo.shape === 'tri') return 4 * Math.abs(ph - 0.5) - 1
  if (lfo.shape === 'sah') { var step = Math.floor(t * lfo.rate); var r = Math.sin(step * 12.9898) * 43758.5453; return (r - Math.floor(r)) * 2 - 1 }
  return Math.sin(ph * Math.PI * 2)
}
function envGain (e, t, gateSec) {
  var a = Math.max(0.001, e.attack), d = Math.max(0.01, e.decay), s = e.sustain, r = Math.max(0.01, e.release)
  if (t < a) return t / a
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d)
  if (t < gateSec) return s
  var relT = t - gateSec
  if (relT >= r) return 0
  var level = t < a + d ? (1 - (1 - s) * ((Math.min(t, a + d) - a) / d)) : s
  return Math.max(0, level * (1 - relT / r))
}
function mixMod (state, src, dst, base, scale) {
  var v = base
  for (var i = 0; i < state.mods.length; i++) {
    var m = state.mods[i]
    if (m.dst === dst) v += (src[m.src] || 0) * m.amount * scale
  }
  return v
}

// ---- Per-note voice (outputs stereo, pan applied) ----
class TwinVoice {
  constructor (pitch, vel, state, sr, startT) {
    this.pitch = pitch; this.vel = vel; this.state = state; this.sr = sr; this.startT = startT
    this.gate = true; this.releaseT = 0; this.alive = true
    this.phases = [0,0,0,0,0,0,0,0,0,0,0,0]
    this.f1 = makeFilt(state.filter1.type, state.filter1.cutoff, state.filter1.res, sr)
    this.f2 = makeFilt(state.filter2.type, state.filter2.cutoff, state.filter2.res, sr)
    this.seed = (pitch * 1103515245 + 12345) >>> 0
  }
  noise () { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return (this.seed / 4294967295) * 2 - 1 }
  renderOsc (osc, lt) {
    var n = Math.max(1, Math.round(osc.unison) || 1), sum = 0
    for (var i = 0; i < n; i++) {
      var spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2
      var hz = 440 * Math.pow(2, (this.pitch + spread * (osc.detune || 0) / 100 - 69) / 12)
      var p = (this.phases[i] + lt * hz / this.sr * this.sr) % 1
      var wtBase = (osc.wave && osc.wave.indexOf('wt') === 0) ? (Number(osc.wave.slice(2)) || osc.wt) : osc.wt
      sum += oscSample(osc.wave, p, wtBase + (osc.wtPos || 0))
    }
    return (sum / n) * osc.level
  }
  process (t) {
    var st = this.state, lt = t - this.startT
    if (!this.gate) { this.releaseT += 1 / this.sr; if (this.releaseT > Math.max(0.01, st.env1.release) + 0.02) this.alive = false }
    var e1 = envGain(st.env1, lt, 1e9), e2 = envGain(st.env2, lt, 1e9)
    var l1 = lfoValue(st.lfo1, t) * st.lfo1.amount, l2 = lfoValue(st.lfo2, t) * st.lfo2.amount
    var src = { env1: e1, env2: e2, lfo1: l1, lfo2: l2, vel: this.vel }
    var cut = mixMod(st, src, 'cutoff', st.filter1.cutoff, 6000)
    var drive1 = st.filter1.drive + mixMod(st, src, 'f1Drive', 0, 6)
    var drive2 = st.filter2.drive + mixMod(st, src, 'f2Drive', 0, 6)
    var amp = mixMod(st, src, 'amp', 1, 1) * e1 * this.vel * st.gain
    var o1 = this.renderOsc(st.osc1, lt) * mixMod(st, src, 'osc1Level', 1, 1)
    var o2 = this.renderOsc(st.osc2, lt) * mixMod(st, src, 'osc2Level', 1, 1)
    var o3 = this.renderOsc(st.osc3, lt) * mixMod(st, src, 'osc3Level', 1, 1)
    var x = o1 + o2 + o3
    this.f1 = updateFilter(this.f1, st.filter1.type, cut, mixMod(st, src, 'res', st.filter1.res, 0.5), this.sr)
    var y1 = driveShape(tickFilt(this.f1, x), drive1)
    this.f2 = updateFilter(this.f2, st.filter2.type, st.filter2.cutoff, st.filter2.res, this.sr)
    var y2in = st.filterRoute === 'parallel' ? x : y1
    var y2 = driveShape(tickFilt(this.f2, y2in), drive2)
    var y = st.filterRoute === 'parallel' ? (y1 + y2) * 0.5 : y2
    var sample = y * amp
    var pan = mixMod(st, src, 'pan', (st.osc1.pan + st.osc2.pan) * 0.5, 1)
    return [sample * Math.min(1, 1 - pan), sample * Math.min(1, 1 + pan)]
  }
  release () { this.gate = false; this.releaseT = 0 }
}

// ---- Global FX (chorus -> delay -> reverb), persists across voices ----
class TwinFx {
  constructor (sr) {
    this.sr = sr
    this.chBuf = new Float32Array(Math.max(1, Math.floor(sr * 0.03)))
    this.chI = 0; this.chLfo = 0
    this.dBuf = new Float32Array(Math.max(1, Math.floor(sr * 0.6)))
    this.dI = 0
    var base = [0.0297, 0.0371, 0.0411, 0.0437], self = this
    this.revLen = base.map(function (s) { return Math.max(1, Math.floor((0.12 + s) * sr)) })
    this.revBuf = base.map(function () { return new Float32Array(Math.max(1, Math.floor(0.15 * sr))) })
    this.revI = 0
  }
  process (st, inL, inR) {
    var l = inL, r = inR
    if (st.chorus > 0.001) {
      this.chLfo = (this.chLfo + 5.5 / this.sr) % 1
      var mod = Math.sin(this.chLfo * Math.PI * 2) * this.chBuf.length * 0.4
      var ci = ((this.chI + this.chBuf.length - (this.chBuf.length * 0.5 + mod)) | 0) % this.chBuf.length
      var ct = this.chBuf[((ci % this.chBuf.length) + this.chBuf.length) % this.chBuf.length]
      this.chBuf[this.chI] = (l + r) * 0.5
      this.chI = (this.chI + 1) % this.chBuf.length
      l += ct * st.chorus * 0.6; r += ct * st.chorus * 0.6 * -1
    }
    if (st.delay > 0.001) {
      var dLen = Math.max(1, Math.floor((0.05 + st.delay * 0.5) * this.sr))
      var dPos = ((this.dI + this.dBuf.length - dLen) % this.dBuf.length + this.dBuf.length) % this.dBuf.length
      var dt = this.dBuf[dPos]
      var wet = dt * (0.25 + st.delay * 0.6)
      this.dBuf[this.dI] = l * 0.7 + dt * 0.45
      this.dI = (this.dI + 1) % this.dBuf.length
      l += wet; r += wet
    }
    if (st.reverb > 0.001) {
      var acc = 0
      for (var i = 0; i < 4; i++) {
        var li = (this.revI + this.revLen[i]) % this.revBuf[i].length
        var s = this.revBuf[i][li]
        acc += s
        this.revBuf[i][(this.revI + this.revBuf[i].length) % this.revBuf[i].length] = s * 0.5 + (l + r) * 0.25 * st.reverb
      }
      this.revI++
      var rw = acc * 0.25 * st.reverb
      l += rw; r += rw
    }
    return [l, r]
  }
}

class DawTwinProcessor extends AudioWorkletProcessor {
  constructor () {
    super()
    this.voices = []
    this.fx = new TwinFx(sampleRate)
    this.state = null
    this.t = 0
    this.port.onmessage = (ev) => {
      var m = ev.data || {}
      if (m.type === 'state') this.state = m.state
      if (m.type === 'noteOn' && this.state) {
        while (this.voices.length >= (this.state.voices || 8)) this.voices.shift().release()
        this.voices.push(new TwinVoice(m.pitch, m.velocity, this.state, sampleRate, this.t))
      }
      if (m.type === 'noteOff') {
        for (var i = 0; i < this.voices.length; i++) {
          if (this.voices[i].pitch === m.pitch && this.voices[i].gate) { this.voices[i].release(); break }
        }
      }
      if (m.type === 'allOff') {
        for (var j = 0; j < this.voices.length; j++) this.voices[j].release()
      }
    }
  }
  process (inputs, outputs) {
    var out = outputs[0]
    if (!out || !out[0]) return true
    var L = out[0], R = out[1] || out[0]
    var st = this.state
    for (var i = 0; i < L.length; i++) {
      var sL = 0, sR = 0
      for (var v = this.voices.length - 1; v >= 0; v--) {
        var o = this.voices[v].process(this.t)
        sL += o[0]; sR += o[1]
        if (!this.voices[v].alive) this.voices.splice(v, 1)
      }
      var fx = st ? this.fx.process(st, sL, sR) : [sL, sR]
      L[i] = fx[0]; R[i] = fx[1]
      this.t++
    }
    return true
  }
}
registerProcessor('daw-twin', DawTwinProcessor)
`
