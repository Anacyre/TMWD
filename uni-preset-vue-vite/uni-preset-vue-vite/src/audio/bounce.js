/** Browser WAV bounce for tracks that already sound in the page (M Orchestra / Web Sampler). */

import { expandRepeats } from '../model/note-model.js'
import { TICKS_PER_BEAT } from '../model/timeline.js'
import { isMOrchestraTrack } from '../model/m-orchestra-ui.js'
import { createWebSamplerInstrument } from './web-sampler.js'

function beatsToSec (beats, bpm) {
  return (beats || 0) * 60 / Math.max(1, bpm || 120)
}

function noteVelocity (note) {
  const value = Number(note && note.velocity)
  if (!Number.isFinite(value) || value <= 0) return 0.7
  return value > 1 ? Math.min(1, value / 127) : value
}

export function collectBounceEvents (session) {
  const events = []
  let endBeat = 0
  ;(session.clips || []).forEach((clip) => {
    if (!clip || clip.midi === false || clip.muted) return
    const track = (session.tracks || [])[clip.trackIndex]
    if (!track || track.type === 'master' || track.mute) return
    const orch = isMOrchestraTrack(track)
    const sampler = track.source === 'web-sampler'
    if (!orch && !sampler) return
    ;(clip.notes || []).forEach((note) => {
      if (!note || note.muted) return
      expandRepeats(note).forEach((slice) => {
        const start = (clip.startBeat || 0) + (slice.start != null ? slice.start : (slice.startTick || 0) / TICKS_PER_BEAT)
        const duration = slice.duration != null ? slice.duration : ((slice.durationTick || 240) / TICKS_PER_BEAT)
        endBeat = Math.max(endBeat, start + duration)
        events.push({
          kind: orch ? 'm-orchestra' : 'web-sampler',
          track,
          pitch: slice.pitch,
          velocity: noteVelocity(slice),
          startBeat: start,
          durationBeats: duration
        })
      })
    })
  })
  return { events, endBeat }
}

export function encodeWav (audioBuffer) {
  const channels = audioBuffer.numberOfChannels
  const sr = audioBuffer.sampleRate
  const length = audioBuffer.length
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataBytes = length * blockAlign
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const writeStr = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sr, true)
  view.setUint32(28, sr * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataBytes, true)
  const chans = []
  for (let c = 0; c < channels; c++) chans.push(audioBuffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, chans[c][i] || 0))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return buffer
}

function downloadBlob (filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function scheduleSampler (context, dest, event, startSec, buffer) {
  const patch = createWebSamplerInstrument({ ...(event.track && event.track.webSampler), gain: 0.7 })
  const src = context.createBufferSource()
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, startSec)
  gain.gain.linearRampToValueAtTime(patch.gain * event.velocity, startSec + Math.max(0.001, patch.attack))
  const end = startSec + Math.max(0.05, event.durationSec)
  gain.gain.setValueAtTime(patch.gain * event.velocity, Math.max(startSec, end - 0.02))
  gain.gain.linearRampToValueAtTime(0.0001, end + Math.max(0.001, patch.release))
  if (buffer) {
    src.buffer = buffer
    const root = patch.rootNote == null ? 60 : patch.rootNote
    src.playbackRate.value = patch.pitchTracking === false ? 1 : Math.pow(2, (event.pitch - root) / 12)
    src.connect(gain)
    gain.connect(dest)
    src.start(startSec)
    src.stop(end + patch.release)
    return
  }
  const osc = context.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(440 * Math.pow(2, (event.pitch - 69) / 12), startSec)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(startSec)
  osc.stop(end + patch.release)
}

export async function bounceSessionToWav (session, options = {}) {
  const { events, endBeat } = collectBounceEvents(session)
  if (!events.length) {
    throw new Error('Nothing to export — add M Orchestra or Web Sampler notes')
  }
  const bpm = session.bpm || 120
  const Offline = options.OfflineAudioContext || (typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null)
  if (!Offline) throw new Error('WAV bounce needs OfflineAudioContext')
  const sr = options.sampleRate || 44100
  const tail = 0.8
  const durationSec = Math.max(1, beatsToSec(endBeat, bpm) + tail)
  const frames = Math.ceil(durationSec * sr)
  const context = new Offline(2, frames, sr)
  const master = context.createGain()
  master.gain.value = session.masterGain != null ? session.masterGain : 0.8
  master.connect(context.destination)
  const samplerBuffers = options.samplerBuffers || new Map()
  const { renderNoteAt } = await import('./m-orchestra/engine.js')

  for (const event of events) {
    const startSec = beatsToSec(event.startBeat, bpm)
    const durationSecNote = beatsToSec(event.durationBeats, bpm)
    if (event.kind === 'm-orchestra') {
      await renderNoteAt(context, master, event.track, event.pitch, event.velocity, startSec, durationSecNote)
    } else {
      const buffer = samplerBuffers.get(event.track.id)
      scheduleSampler(context, master, { ...event, durationSec: durationSecNote }, startSec, buffer)
    }
  }

  const rendered = await context.startRendering()
  const wav = encodeWav(rendered)
  if (options.download !== false && typeof document !== 'undefined') {
    downloadBlob((session.projectName || 'project') + '.wav', new Blob([wav], { type: 'audio/wav' }))
  }
  return wav
}
