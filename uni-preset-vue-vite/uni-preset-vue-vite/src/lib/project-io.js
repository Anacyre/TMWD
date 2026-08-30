/** Shared .dawweb contract. Native ProjectFile.cpp is the authority; this
 *  module migrates every browser snapshot onto schema v6 before save or load. */

export const SCHEMA_VERSION = 6

const RUNTIME_TRACK = [
  'meterLevel', 'loadState', 'loadMessage',
  'instrumentLoadState', 'instrumentLoadMessage'
]
const RUNTIME_SAMPLER = ['sampleUrl']

function uid () {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function isBlobUrl (value) {
  return typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:'))
}

function trackIdOf (track) {
  if (!track) return 0
  if (track.id != null && track.id !== '') return Number(track.id) || track.id
  if (track.trackId != null && track.trackId !== '') return Number(track.trackId) || track.trackId
  return 0
}

function clipIdOf (clip) {
  if (!clip) return 0
  if (clip.id != null && clip.id !== '') return clip.id
  if (clip.clipId != null && clip.clipId !== '') return clip.clipId
  return 0
}

function inferSource (track) {
  if (!track) return 'empty'
  if (track.source) return track.source
  const def = track.definitionId || track.instrumentId || ''
  if (String(def).startsWith('m_orch_')) return 'm-orchestra'
  if (track.webSampler && (track.webSampler.sampleName || track.webSampler.assetHash)) return 'web-sampler'
  if (def) return 'remote-vst'
  return 'empty'
}

function stripSampler (sampler) {
  if (!sampler || typeof sampler !== 'object') return sampler
  const next = { ...sampler }
  RUNTIME_SAMPLER.forEach((key) => {
    if (isBlobUrl(next[key])) next[key] = ''
  })
  if (Array.isArray(next.zones)) {
    next.zones = next.zones.map((zone) => {
      const copy = { ...zone }
      if (isBlobUrl(copy.sampleUrl)) copy.sampleUrl = ''
      return copy
    })
  }
  return next
}

function migrateTrack (track) {
  const id = trackIdOf(track)
  const next = {
    ...track,
    id,
    trackId: id,
    parentId: track.parentId || 0,
    type: track.type || 'midi',
    name: track.name || 'Track',
    source: inferSource(track),
    instrumentId: track.instrumentId || track.definitionId || '',
    definitionId: track.definitionId || track.instrumentId || '',
    volume: track.volume != null ? track.volume : 0.8,
    volumeDb: track.volumeDb,
    pan: track.pan || 0,
    mute: !!track.mute,
    solo: !!track.solo,
    inserts: Array.isArray(track.inserts) ? track.inserts.slice(0, 5) : [],
    sends: Array.isArray(track.sends) ? track.sends : []
  }
  RUNTIME_TRACK.forEach((key) => { delete next[key] })
  if (next.webSampler) next.webSampler = stripSampler(next.webSampler)
  return next
}

function migrateClip (clip) {
  const id = clipIdOf(clip)
  return {
    ...clip,
    id,
    clipId: id,
    trackIndex: clip.trackIndex != null ? clip.trackIndex : 0,
    startBeat: clip.startBeat != null ? clip.startBeat : (clip.start != null ? clip.start : 0),
    lengthBeats: clip.lengthBeats != null ? clip.lengthBeats : (clip.length != null ? clip.length : 4),
    kind: clip.kind || (clip.midi === false ? 'audio' : 'midi'),
    midi: clip.midi !== false && clip.kind !== 'audio' && clip.kind !== 'sampler',
    notes: Array.isArray(clip.notes) ? clip.notes : [],
    muted: !!clip.muted,
    loopCount: clip.loopCount || 1,
    loopLengthBeats: clip.loopLengthBeats || 0,
    sourceId: clip.sourceId || '',
    audioOffsetBeats: clip.audioOffsetBeats || 0
  }
}

/**
 * Lift any historical browser snapshot (version:1, bpm, trackId) onto the
 * native schema v6 shape (schemaVersion, tempo, id).
 */
export function migrateProject (raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const schemaVersion = Number(src.schemaVersion || src.projectVersion || src.version || 1)
  const tempo = src.tempo != null ? Number(src.tempo) : Number(src.bpm != null ? src.bpm : 120)
  const tracks = Array.isArray(src.tracks) ? src.tracks.map(migrateTrack) : []
  const clips = Array.isArray(src.clips) ? src.clips.map(migrateClip) : []
  return {
    schemaVersion: SCHEMA_VERSION,
    projectVersion: SCHEMA_VERSION,
    migratedFrom: schemaVersion,
    id: src.id || src.projectId || '',
    name: src.name || src.projectName || 'Untitled',
    tempo,
    bpm: tempo,
    timeSigNumerator: src.timeSigNumerator || 4,
    timeSigDenominator: src.timeSigDenominator || 4,
    masterGain: src.masterGain != null ? src.masterGain : 0.8,
    positionBeats: src.positionBeats || 0,
    looping: !!src.looping,
    loopStart: src.loopStart != null ? src.loopStart : 0,
    loopEnd: src.loopEnd != null ? src.loopEnd : 16,
    metronome: !!src.metronome,
    tracks,
    clips,
    markers: Array.isArray(src.markers) ? src.markers : [],
    timeSignatures: Array.isArray(src.timeSignatures) ? src.timeSignatures : [],
    score: src.score || null,
    webMixer: src.webMixer || null,
    pixelsPerBeat: src.pixelsPerBeat || 21,
    trackHeight: src.trackHeight || 50,
    updatedAt: src.updatedAt || Date.now()
  }
}

export function serializeSession (session) {
  const master = (session.tracks || []).find((track) => track.type === 'master')
  return migrateProject({
    id: session.projectId || uid(),
    name: session.projectName,
    tempo: session.bpm,
    bpm: session.bpm,
    timeSigNumerator: session.timeSigNum,
    timeSigDenominator: session.timeSigDen,
    masterGain: session.masterGain != null
      ? session.masterGain
      : (master ? master.volume : 0.8),
    positionBeats: session.positionBeats,
    looping: session.looping,
    loopStart: session.loopStart,
    loopEnd: session.loopEnd,
    metronome: session.metronome,
    tracks: session.tracks,
    clips: session.clips,
    markers: session.markers,
    timeSignatures: session.timeSignatures,
    score: session.score,
    webMixer: session.webMixer,
    pixelsPerBeat: session.pixelsPerBeat,
    trackHeight: session.trackHeight
  })
}

export function stripRuntime (project) {
  return migrateProject(project)
}

export function collectAssetRefs (project) {
  const refs = []
  ;(project.tracks || []).forEach((track) => {
    const sampler = track.webSampler
    if (!sampler) return
    if (sampler.assetHash) refs.push({ trackId: track.id, hash: sampler.assetHash, name: sampler.sampleName || '' })
  })
  return refs
}

export function mergeNativeExport (browserProject, nativeJson) {
  let native = nativeJson
  if (typeof nativeJson === 'string') {
    try { native = JSON.parse(nativeJson) } catch (err) { native = null }
  }
  if (!native || typeof native !== 'object') return browserProject
  const merged = migrateProject({
    ...browserProject,
    ...native,
    webMixer: browserProject.webMixer || native.webMixer,
    id: browserProject.id,
    pixelsPerBeat: browserProject.pixelsPerBeat,
    trackHeight: browserProject.trackHeight
  })
  const byId = new Map((browserProject.tracks || []).map((track) => [String(trackIdOf(track)), track]))
  merged.tracks = merged.tracks.map((track) => {
    const local = byId.get(String(trackIdOf(track)))
    if (!local) return track
    return {
      ...track,
      source: local.source || track.source,
      webSampler: local.webSampler || track.webSampler,
      definitionId: local.definitionId || track.definitionId
    }
  })
  return merged
}
