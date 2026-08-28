/** Browser-side sampler: WAV buffer playback with a sine fallback when no sample is loaded. */

export const WEB_SAMPLER_TYPE = 'web-sampler'

export function createWebSamplerInstrument (patch = {}) {
  return {
    type: WEB_SAMPLER_TYPE,
    name: patch.name || 'Web Sampler',
    sampleUrl: patch.sampleUrl || '',
    sampleName: patch.sampleName || '',
    rootNote: patch.rootNote == null ? 60 : patch.rootNote,
    pitchTracking: patch.pitchTracking !== false,
    velocity: patch.velocity == null ? 0.8 : patch.velocity,
    attack: patch.attack == null ? 0.005 : patch.attack,
    release: patch.release == null ? 0.12 : patch.release,
    gain: patch.gain == null ? 0.7 : patch.gain,
    loopStart: patch.loopStart || 0,
    loopEnd: patch.loopEnd || 0,
    polyphony: patch.polyphony || 8,
    roundRobin: patch.roundRobin || 1,
    zones: patch.zones || [{ rootNote: patch.rootNote == null ? 60 : patch.rootNote, sampleUrl: patch.sampleUrl || '' }]
  }
}

export async function decodeSampleFile (context, fileOrUrl) {
  let arrayBuffer
  if (typeof fileOrUrl === 'string') {
    const response = await fetch(fileOrUrl)
    arrayBuffer = await response.arrayBuffer()
  } else if (fileOrUrl instanceof ArrayBuffer) {
    arrayBuffer = fileOrUrl
  } else {
    arrayBuffer = await fileOrUrl.arrayBuffer()
  }
  return context.decodeAudioData(arrayBuffer.slice(0))
}

export class WebSamplerVoice {
  constructor (context, destination) {
    this.context = context
    this.destination = destination
    this.gain = context.createGain()
    this.gain.connect(destination)
    this.gain.gain.value = 0
    this.source = null
    this.osc = null
  }

  noteOn (pitch, velocity = 0.8, patch = createWebSamplerInstrument(), buffer = null) {
    const now = this.context.currentTime
    this.stopSource()
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(0, now)
    this.gain.gain.linearRampToValueAtTime(patch.gain * velocity, now + Math.max(0.001, patch.attack))

    if (buffer) {
      const src = this.context.createBufferSource()
      src.buffer = buffer
      const root = patch.rootNote == null ? 60 : patch.rootNote
      src.playbackRate.value = patch.pitchTracking === false ? 1 : Math.pow(2, (pitch - root) / 12)
      src.connect(this.gain)
      src.start()
      this.source = src
      return
    }

    this.osc = this.context.createOscillator()
    this.osc.type = 'sine'
    this.osc.frequency.setValueAtTime(440 * Math.pow(2, (pitch - 69) / 12), now)
    this.osc.connect(this.gain)
    try { this.osc.start() } catch (err) { /* already started */ }
  }

  noteOff (patch = createWebSamplerInstrument()) {
    const now = this.context.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(this.gain.gain.value, now)
    this.gain.gain.linearRampToValueAtTime(0, now + Math.max(0.001, patch.release))
  }

  stopSource () {
    try { if (this.source) this.source.stop() } catch (err) { /* already stopped */ }
    try { if (this.osc) this.osc.stop() } catch (err) { /* already stopped */ }
    if (this.source) try { this.source.disconnect() } catch (err) { /* ignore */ }
    if (this.osc) try { this.osc.disconnect() } catch (err) { /* ignore */ }
    this.source = null
    this.osc = null
  }

  dispose () {
    this.stopSource()
    this.gain.disconnect()
  }
}
