import {
  applyFx,
  createFx,
  createVoice,
  defaultCosmicState,
  normalizeCosmicState,
  releaseVoice,
  renderVoice,
  voiceFinished
} from './dsp.js'

export function renderCosmicNote (options) {
  const opt = options || {}
  const st = normalizeCosmicState(opt.state || defaultCosmicState())
  const sr = opt.sampleRate || 44100
  const gate = Math.max(0.01, opt.gateSec == null ? 0.4 : opt.gateSec)
  const total = Math.min(sr * 8, Math.ceil((gate + st.env[0].release + 0.08) * sr))
  const L = new Float32Array(total)
  const R = new Float32Array(total)
  const voice = createVoice(st, opt.pitch == null ? 60 : opt.pitch, opt.velocity == null ? 0.8 : opt.velocity, sr, { uniCap: 8 })
  const bpm = opt.bpm || 120
  let end = total
  let released = false
  for (let i = 0; i < total; i += 128) {
    const n = Math.min(128, total - i)
    if (!released && i / sr >= gate) {
      releaseVoice(voice)
      released = true
    }
    renderVoice(voice, n, L, R, i, st, bpm, { bend: 0, wheel: 0, after: 0 })
    if (released && voiceFinished(voice)) {
      end = Math.min(total, i + n)
      break
    }
  }
  const outL = L.subarray(0, end)
  const outR = R.subarray(0, end)
  applyFx(createFx(sr), outL, outR, end, st, sr, bpm, null, null)
  return { L: outL, R: outR, sampleRate: sr, duration: end / sr }
}
