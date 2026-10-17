/** Audio-clip scheduling, peak previews, and bounce events. Browser-owned WAV/MP3/OGG
 * clips play through BufferSource nodes into the track strip. */

export const AUDIO_CLIP_KIND = 'audio'

const previewCache = new Map()
const liveSources = new Map()

export function isAudioClip (clip) {
  if (!clip) return false
  return clip.kind === AUDIO_CLIP_KIND || clip.midi === false
}

export function audioClipGain (clip) {
  const db = Number(clip && clip.gainDb)
  if (!Number.isFinite(db)) return 1
  return Math.pow(10, Math.max(-48, Math.min(24, db)) / 20)
}

export function beatsToSeconds (beats, bpm) {
  return (Number(beats) || 0) * 60 / Math.max(20, Number(bpm) || 120)
}

export function secondsToBeats (seconds, bpm) {
  return (Number(seconds) || 0) * Math.max(20, Number(bpm) || 120) / 60
}

export function audioBufferDurationBeats (buffer, bpm) {
  if (!buffer || !buffer.duration) return 4
  return Math.max(0.25, secondsToBeats(buffer.duration, bpm))
}

/** Peak bars for the arrange preview. Cached by hash + bin count. */
export function buildAudioPreview (buffer, bins = 180) {
  const hash = buffer && (buffer._previewKey || buffer.duration + ':' + buffer.length)
  const key = hash + ':' + bins
  const cached = previewCache.get(key)
  if (cached) return cached
  const count = Math.max(1, Math.min(1024, Math.round(bins) || 180))
  const peaks = new Float32Array(count)
  if (!buffer || !buffer.length) {
    const empty = { peaks, duration: 0 }
    previewCache.set(key, empty)
    return empty
  }
  const chans = []
  const nch = buffer.numberOfChannels || 1
  for (let c = 0; c < nch; c++) chans.push(buffer.getChannelData(c))
  const hop = buffer.length / count
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * hop)
    const end = Math.min(buffer.length, Math.floor((i + 1) * hop))
    let peak = 0
    for (let s = start; s < end; s++) {
      let v = 0
      for (let c = 0; c < chans.length; c++) v += Math.abs(chans[c][s] || 0)
      v /= chans.length
      if (v > peak) peak = v
    }
    peaks[i] = peak
  }
  const model = { peaks, duration: buffer.duration || 0 }
  if (previewCache.size > 80) previewCache.clear()
  previewCache.set(key, model)
  return model
}

export function peaksForClip (clip, bins) {
  if (!clip) return null
  if (clip.peaks && clip.peaks.length) return { peaks: clip.peaks, duration: clip.audioDuration || 0 }
  return null
}

export function sliceWindow (clip, bpm, buffer) {
  const durationBeats = Math.max(0.05, Number(clip.lengthBeats) || 4)
  const offsetBeats = Math.max(0, Number(clip.audioOffsetBeats) || 0)
  const offsetSec = beatsToSeconds(offsetBeats, bpm)
  const durationSec = beatsToSeconds(durationBeats, bpm)
  const total = buffer && buffer.duration ? buffer.duration : offsetSec + durationSec
  const startSec = Math.min(Math.max(0, offsetSec), Math.max(0, total - 0.01))
  const playSec = Math.max(0.02, Math.min(durationSec, total - startSec))
  return { offsetSec: startSec, durationSec: playSec, durationBeats }
}

export function collectAudioEvents (session) {
  const events = []
  let endBeat = 0
  const bpm = session && session.bpm
  ;(session && session.clips || []).forEach((clip) => {
    if (!isAudioClip(clip) || clip.muted) return
    const track = (session.tracks || [])[clip.trackIndex]
    if (!track || track.type === 'master' || track.mute) return
    const start = Number(clip.startBeat) || 0
    const length = Math.max(0.05, Number(clip.lengthBeats) || 4)
    endBeat = Math.max(endBeat, start + length)
    events.push({
      kind: AUDIO_CLIP_KIND,
      track,
      clip,
      startBeat: start,
      durationBeats: length,
      sourceId: clip.sourceId || '',
      gain: audioClipGain(clip),
      offsetBeats: Number(clip.audioOffsetBeats) || 0
    })
  })
  return { events, endBeat, bpm }
}

export function scheduleAudioClip (context, dest, buffer, clip, when, bpm) {
  if (!context || !buffer) return null
  const win = sliceWindow(clip, bpm, buffer)
  const src = context.createBufferSource()
  src.buffer = buffer
  const gain = context.createGain()
  gain.gain.value = audioClipGain(clip)
  src.connect(gain)
  gain.connect(dest)
  const startAt = when == null ? context.currentTime : Math.max(context.currentTime, when)
  try {
    src.start(startAt, win.offsetSec, win.durationSec)
  } catch (err) {
    src.start(startAt)
  }
  return { source: src, gain, startAt, durationSec: win.durationSec }
}

export function tickAudioClips (session, options = {}) {
  const nowBeats = Number(options.nowBeats)
  const ctx = options.context
  if (!ctx || !session) return
  const bpm = Math.max(20, Number(session.bpm) || 120)
  const lookSec = options.lookSec != null ? options.lookSec : Math.max(0.08, (60 / bpm) * 0.5)
  const lookBeats = lookSec * bpm / 60
  const buffers = options.buffers || new Map()
  const destFor = options.destFor || (() => ctx.destination)
  const audible = options.isAudible || (() => true)
  const next = new Set()

  ;(session.clips || []).forEach((clip) => {
    if (!isAudioClip(clip) || clip.muted) return
    const track = session.tracks[clip.trackIndex]
    if (!track || track.type === 'master' || !audible(clip.trackIndex)) return
    const start = Number(clip.startBeat) || 0
    const length = Math.max(0.05, Number(clip.lengthBeats) || 4)
    if (nowBeats + lookBeats < start || nowBeats >= start + length) return
    const key = 'a:' + (clip.id || 0) + ':' + start.toFixed(4)
    next.add(key)
    if (liveSources.has(key)) return
    const buffer = buffers.get(clip.sourceId)
    if (!buffer) return
    const when = ctx.currentTime + Math.max(0, (start - nowBeats) * 60 / bpm)
    const handle = scheduleAudioClip(ctx, destFor(track), buffer, clip, when, bpm)
    if (handle) liveSources.set(key, handle)
  })

  Array.from(liveSources.keys()).forEach((key) => {
    if (next.has(key)) return
    const handle = liveSources.get(key)
    liveSources.delete(key)
    try { handle.source.stop() } catch (err) { /* already stopped */ }
  })
}

export function allAudioClipsOff () {
  liveSources.forEach((handle) => {
    try { handle.source.stop() } catch (err) { /* already stopped */ }
  })
  liveSources.clear()
}

export function createAudioClip (fields = {}) {
  return {
    kind: AUDIO_CLIP_KIND,
    midi: false,
    sourceId: fields.sourceId || '',
    audioOffsetBeats: Number(fields.audioOffsetBeats) || 0,
    gainDb: Number(fields.gainDb) || 0,
    peaks: fields.peaks || null,
    audioDuration: Number(fields.audioDuration) || 0,
    name: fields.name || 'Audio',
    startBeat: Number(fields.startBeat) || 0,
    lengthBeats: Math.max(0.25, Number(fields.lengthBeats) || 4),
    notes: [],
    muted: false
  }
}
