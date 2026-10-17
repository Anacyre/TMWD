export const TWIN_WORKLET_SOURCE = `
class TwinVoice {
  constructor (pitch, vel, state, sr) {
    this.pitch = pitch
    this.vel = vel
    this.state = state
    this.sr = sr
    this.t = 0
    this.gate = true
    this.releaseT = 0
    this.alive = true
    this.phases = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    this.z1 = [0, 0, 0, 0]
    this.seed = (pitch * 1103515245 + 12345) >>> 0
  }
  noise () {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return (this.seed / 4294967295) * 2 - 1
  }
  env (e, t, gated) {
    var a = Math.max(0.001, e.attack), d = Math.max(0.01, e.decay), s = e.sustain, r = Math.max(0.01, e.release)
    if (!gated) {
      var rel = this.releaseT
      var level = t < a ? t / a : (t < a + d ? 1 - (1 - s) * ((t - a) / d) : s)
      return rel >= r ? 0 : Math.max(0, level * (1 - rel / r))
    }
    if (t < a) return t / a
    if (t < a + d) return 1 - (1 - s) * ((t - a) / d)
    return s
  }
  osc (osc, idx) {
    var n = Math.max(1, osc.unison | 0)
    var sum = 0
    for (var i = 0; i < n; i++) {
      var spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2
      var hz = 440 * Math.pow(2, (this.pitch + spread * (osc.detune || 0) / 100 - 69) / 12)
      var p = this.phases[idx + i] = (this.phases[idx + i] + hz / this.sr) % 1
      var w = osc.wave
      var s
      if (w === 'sine') s = Math.sin(p * Math.PI * 2)
      else if (w === 'square') s = p < 0.5 ? 1 : -1
      else if (w === 'tri') s = 1 - 4 * Math.abs(Math.round(p) - p)
      else if (w === 'noise') s = this.noise()
      else s = p * 2 - 1
      sum += s
    }
    return sum / n * osc.level
  }
  tickFilter (x, which, cutoff, res, type) {
    var f = Math.max(20, Math.min(this.sr * 0.45, cutoff))
    var w = 2 * Math.PI * f / this.sr
    var q = 0.5 + res * 8
    var a = Math.sin(w) / (2 * q)
    var cos = Math.cos(w)
    var b0, b1, b2
    if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2 }
    else if (type === 'bandpass') { b0 = a; b1 = 0; b2 = -a }
    else { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2 }
    var a0 = 1 + a, a1 = -2 * cos, a2 = 1 - a
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0
    var z1 = this.z1[which], z2 = this.z1[which + 1]
    var y = b0 * x + z1
    this.z1[which] = b1 * x - a1 * y + z2
    this.z1[which + 1] = b2 * x - a2 * y
    return y
  }
  process () {
    var st = this.state
    var t = this.t
    var e1 = this.env(st.env1, t, this.gate)
    if (!this.gate) {
      this.releaseT += 1 / this.sr
      if (this.releaseT > Math.max(0.01, st.env1.release) + 0.02) this.alive = false
    }
    var x = this.osc(st.osc1, 0) + this.osc(st.osc2, 4) + this.osc(st.osc3, 8)
    var y1 = this.tickFilter(x, 0, st.filter1.cutoff, st.filter1.res, st.filter1.type)
    var y2 = this.tickFilter(st.filterRoute === 'parallel' ? x : y1, 2, st.filter2.cutoff, st.filter2.res, st.filter2.type)
    var y = st.filterRoute === 'parallel' ? (y1 + y2) * 0.5 : y2
    this.t += 1 / this.sr
    return y * e1 * this.vel * st.gain
  }
  release () { this.gate = false; this.releaseT = 0 }
}

class DawTwinProcessor extends AudioWorkletProcessor {
  constructor () {
    super()
    this.voices = []
    this.state = null
    this.delayL = new Float32Array(24000)
    this.delayR = new Float32Array(24000)
    this.di = 0
    this.port.onmessage = (ev) => {
      var m = ev.data || {}
      if (m.type === 'state') this.state = m.state
      if (m.type === 'noteOn' && this.state) {
        while (this.voices.length >= (this.state.voices || 8)) this.voices.shift().release()
        this.voices.push(new TwinVoice(m.pitch, m.velocity, this.state, sampleRate))
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
      var s = 0
      for (var v = this.voices.length - 1; v >= 0; v--) {
        s += this.voices[v].process()
        if (!this.voices[v].alive) this.voices.splice(v, 1)
      }
      var chorus = st ? st.chorus : 0
      var delayAmt = st ? st.delay : 0
      var reverb = st ? st.reverb : 0
      var tap = Math.min(this.delayL.length - 1, 2400)
      var idx = (this.di - tap + this.delayL.length) % this.delayL.length
      var d = this.delayL[idx] || 0
      var wet = s + d * (0.22 + delayAmt * 0.45) + d * reverb * 0.35
      var c = s * (1 - chorus * 0.3) + wet * chorus
      L[i] = c
      R[i] = s * (1 - chorus * 0.3) + this.delayR[idx] * (chorus + delayAmt * 0.4)
      this.delayL[this.di] = s * 0.65 + d * 0.35
      this.delayR[this.di] = s * 0.65 + (this.delayR[idx] || 0) * 0.35
      this.di = (this.di + 1) % this.delayL.length
    }
    return true
  }
}
registerProcessor('daw-twin', DawTwinProcessor)
`
