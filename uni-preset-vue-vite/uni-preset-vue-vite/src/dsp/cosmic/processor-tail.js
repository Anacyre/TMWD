export const COSMIC_PROCESSOR_TAIL = `
var SCOPE_N = 512
class CosmicProcessor extends AudioWorkletProcessor {
  constructor () {
    super()
    this.state = defaultCosmicState()
    this.voices = []
    this.fx = createFx(sampleRate)
    this.bpm = 120
    this.perf = { bend: 0, wheel: 0, after: 0 }
    this.stack = []
    this.freeLfo = [0, 0, 0]
    this.tick = 0
    this.peak = 0
    this.quiet = 0
    this.watch = false
    this.ring = new Float32Array(SCOPE_N)
    this.ringAt = 0
    var self = this
    this.port.onmessage = function (event) {
      var msg = event.data || {}
      if (msg.type === 'state') self.state = normalizeCosmicState(msg.state)
      else if (msg.type === 'clock') self.bpm = Number(msg.bpm) || 120
      else if (msg.type === 'perf') self.perf = msg.perf || self.perf
      else if (msg.type === 'watch') self.watch = !!msg.on
      else if (msg.type === 'noteOn') self.noteOn(msg)
      else if (msg.type === 'noteOff') self.noteOff(msg)
      else if (msg.type === 'allOff') {
        self.voices.forEach(releaseVoice)
        self.stack = []
      }
    }
  }
  steal () {
    var victim = null
    var best = Infinity
    for (var i = 0; i < this.voices.length; i++) {
      var v = this.voices[i]
      if (v.kill) continue
      var score = (v.held ? 10 : 0) + voiceLevel(v) - v.age * 0.001
      if (score < best) { best = score; victim = v }
    }
    if (victim) killVoice(victim)
  }
  noteOn (msg) {
    var state = this.state
    var mode = state.global.mode
    var key = String(msg.key || msg.pitch)
    this.stack.push({ pitch: msg.pitch, vel: msg.velocity, key: key })
    var held = this.voices.filter(function (v) { return v.held && !v.kill })
    if (mode !== 'poly' && held.length) {
      retargetVoice(held[0], msg.pitch, msg.velocity, mode === 'mono')
      held[0].key = key
      return
    }
    var poly = state.global.poly || 8
    if (held.length >= poly) releaseVoice(held[0])
    var alive = this.voices.filter(function (v) { return !v.kill })
    if (alive.length >= MAX_VOICES) this.steal()
    var oscs = state.osc.filter(function (o) { return o.on }).length || 1
    var sounding = Math.min(MAX_VOICES, alive.length + 1)
    var cap = Math.max(1, Math.min(8, Math.floor(UNISON_BUDGET / (sounding * oscs))))
    this.voices.push(createVoice(state, msg.pitch, msg.velocity, sampleRate, {
      freeLfo: this.freeLfo,
      uniCap: cap,
      key: key
    }))
  }
  noteOff (msg) {
    var key = String(msg.key || '')
    this.stack = this.stack.filter(function (n) { return n.key !== key })
    if (this.state.global.mode !== 'poly' && this.stack.length) {
      var top = this.stack[this.stack.length - 1]
      var voice = this.voices.filter(function (v) { return v.held && !v.kill })[0]
      if (voice) {
        retargetVoice(voice, top.pitch, top.vel, this.state.global.mode === 'mono')
        voice.key = top.key
      }
      return
    }
    this.voices.forEach(function (v) {
      if (String(v.key) === key) releaseVoice(v)
    })
  }
  postLive () {
    var pick = null
    for (var i = this.voices.length - 1; i >= 0; i--) {
      var v = this.voices[i]
      if (v.kill) continue
      if (!pick || (v.held && !pick.held)) pick = v
      if (pick.held) break
    }
    this.port.postMessage({ type: 'live', voices: this.voices.length, live: voiceLive(pick), lfo: this.freeLfo.slice() })
  }
  process (inputs, outputs) {
    var out = outputs[0]
    if (!out || !out[0]) return true
    var L = out[0]
    var R = out[1] || L
    var n = L.length
    for (var i = 0; i < n; i++) {
      L[i] = 0
      if (out[1]) R[i] = 0
    }
    this.freeLfo = advanceFree(this.freeLfo, this.state, n, sampleRate, this.bpm)
    for (var v = this.voices.length - 1; v >= 0; v--) {
      renderVoice(this.voices[v], n, L, R, 0, this.state, this.bpm, this.perf)
      if (voiceFinished(this.voices[v])) this.voices.splice(v, 1)
    }
    this.quiet = this.voices.length ? 0 : this.quiet + n
    if (this.quiet < sampleRate * 12) applyFx(this.fx, L, R, n, this.state, sampleRate, this.bpm, this.perf, this.freeLfo)
    var peak = 0
    for (var s = 0; s < n; s++) {
      var a = L[s] < 0 ? -L[s] : L[s]
      if (a > peak) peak = a
      this.ring[this.ringAt] = L[s]
      this.ringAt = (this.ringAt + 1) % SCOPE_N
    }
    this.peak = this.peak * 0.85 + peak * 0.15
    this.tick++
    if (!this.watch) return true
    if (this.tick % 8 === 0) {
      var samples = new Float32Array(SCOPE_N)
      for (var k = 0; k < SCOPE_N; k++) samples[k] = this.ring[(this.ringAt + k) % SCOPE_N]
      this.port.postMessage({ type: 'scope', peak: this.peak, samples: samples })
    }
    if (this.tick % 10 === 5) this.postLive()
    return true
  }
}
registerProcessor('daw-cosmic', CosmicProcessor)
`
