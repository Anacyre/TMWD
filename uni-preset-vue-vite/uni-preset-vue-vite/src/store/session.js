import { computed, reactive } from 'vue'
import {
  connectEngine,
  disconnectEngine,
  engineLink,
  isEngineConnected,
  onEngineEvent,
  onEngineAudio,
  sendCommand,
  connectEngineAudio
} from '../bridge/engine.js'
import { canAddInsert, dbFromFader, CONTROL_HZ, defaultSends, normalizeSends, defaultTrackMix } from '../model/mixer-model.js'
import { defaultWebMixer, normalizeWebMixer, demoWebMixer, setLaneInserts, laneInserts, allTrackInserts, syncNativeInsertsToWebMixer, nameToPluginId, MIXER_INSERT_SLOTS, fxMeterLaneKey, reorderLaneInserts } from '../model/web-mixer.js'
import { createDemoProject } from '../model/demo-project.js'
import { parseRemoteAudioPacket, createAudioGraph, attachRemotePlayer, pushRemotePacket } from '../audio/graph.js'
import { attachMixerGraph, syncMixerGraph, getLaneAnalyser, ensureOutputRouting } from '../audio/mixer-graph.js'
import { createWebSamplerInstrument, WebSamplerVoice, decodeSampleFile } from '../audio/web-sampler.js'
import { publicAssetUrl } from '../lib/supabase.js'
import * as mOrchestraCloud from '../audio/m-orchestra/engine.js'
import { createInsert } from '../dsp/plugin.js'
import { plugins, listPlugins } from '../dsp/registry.js'
import { SNAP_OPTIONS as TIMELINE_SNAP, TICKS_PER_BEAT as PPQ, formatMusical, formatTime, interpolateBeats } from '../model/timeline.js'
import { isGroupTrack, isPlayableTrack, buildCollapsedGroupClip, invalidateClipPreview, clearClipPreviewCache } from '../model/playlist-model.js'
import { normalizeNote, engineNotePayload, defaultScore, normalizeMarker, expandRepeats } from '../model/note-model.js'
import {
  INTERFACE_LITE,
  INTERFACE_PROFESSIONAL,
  readInterfaceMode,
  writeInterfaceMode,
  readLiteHintDismissed,
  writeLiteHintDismissed,
  isLiteMode
} from '../model/ui-mode.js'
import { ensureExpression, laneKey, paintPoint, eraseNear, sampleLane, controllerIdForCc } from '../model/expression-lane.js'
import {
  M_ORCHESTRA_PLUGIN_ID,
  M_ORCHESTRA_DEFAULT_ID,
  ORCHESTRA_SAMPLER_PLUGIN_ID,
  TEST_SYNTH_PLUGIN_ID,
  WEB_SAMPLER_PLUGIN_ID,
  isMOrchestraTrack,
  insertablePlugins,
  mOrchestraInstrument
} from '../model/m-orchestra-ui.js'

export const TRACK_HEIGHT = 50
export const RULER_HEIGHT = 36
export const HEADER_HEIGHT = 48
export const TRANSPORT_HEIGHT = 0
export const TICKS_PER_BEAT = PPQ
export const STATUS_HEIGHT = 24
export const TRANSPORT_KEYS = { editor: 'E', mixer: 'M', inspector: 'I' }
export const SNAP_OPTIONS = TIMELINE_SNAP
export const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '12/8']
export const TRACK_HEIGHTS = [
  { name: 'Compact', value: 44 },
  { name: 'Normal', value: 56 },
  { name: 'Large', value: 84 }
]

const PALETTE = ['#4a90d9', '#d98b4a', '#6dbf8a', '#c46bb3', '#d4c05a', '#5bb8c4', '#d96a6a']
const starterDemo = createDemoProject()

const SUPPORT_EXTS = ['.mp3', '.mp4', '.wav', '.aac', '.ogg', '.flac', '.mid', '.midi', '.aif', '.aiff', '.m4a']

let persistTimer = 0

function nextId (list, key = 'id') {
  return list.reduce((max, item) => Math.max(max, item[key] || 0), 0) + 1
}

function syncSelectionIds () {
  const track = session.tracks[session.selectedTrack]
  const clip = session.clips[session.selectedClip]
  session.activeTrackId = track ? track.id : 0
  session.activeClipId = clip ? clip.id : 0
  if (track && !session.selectedTrackIds.length) session.selectedTrackIds = [track.id]
  if (clip && !session.selectedClipIds.length) session.selectedClipIds = [clip.id]
}

function markDirty () {
  session.unsaved = true
  scheduleAutosave()
}

let autosaveTimer = 0
function scheduleAutosave () {
  if (autosaveTimer) return
  autosaveTimer = setTimeout(() => {
    autosaveTimer = 0
    autosaveProject()
  }, 8000)
}

function fire (type, payload) {
  if (!isEngineConnected()) return Promise.resolve(null)
  return sendCommand(type, payload).catch((err) => {
    showToast(err.message || 'Engine command failed')
    return null
  })
}

export function sendCommandSafe (type, payload) {
  return fire(type, payload)
}

export const session = reactive({
  projectName: starterDemo.projectName,
  userName: 'xiaofish',
  unsaved: false,
  playing: false,
  recording: false,
  looping: false,
  metronome: false,
  snap: true,
  snapGridBeats: 0.25,
  bpm: starterDemo.bpm,
  positionBeats: 0,
  loopStart: starterDemo.loopStart,
  loopEnd: starterDemo.loopEnd,
  pixelsPerBeat: 21,
  masterGain: starterDemo.masterGain,
  timeSigNum: 4,
  timeSigDen: 4,
  colourIndex: 0,
  openMenu: '',
  toast: '',
  engineStatus: '',
  selectedTrack: 1,
  selectedClip: 0,
  activeTrackId: 0,
  activeClipId: 0,
  selectedClipIds: [],
  selectedTrackIds: [],
  markers: starterDemo.markers || [],
  timeSignatures: [{ timeTick: 0, numerator: starterDemo.timeSigNum || 4, denominator: starterDemo.timeSigDen || 4 }],
  score: defaultScore({
    markers: starterDemo.markers || [],
    timeSignatures: [{ timeTick: 0, numerator: starterDemo.timeSigNum || 4, denominator: starterDemo.timeSigDen || 4 }]
  }),
  pianoRollFocus: false,
  workspaceView: 'arrangement',
  interfaceMode: readInterfaceMode(),
  liteHintDismissed: readLiteHintDismissed(),
  liteSheet: null,
  settingsOpen: false,
  expressionOpen: false,
  expressionCc: 1,
  positionFormat: 'musical',
  saveStatus: '',
  typing: false,
  scrollRequest: 0,
  canUndo: false,
  canRedo: false,
  recentProjects: [],
  editorVisible: false,
  mixerVisible: false,
  inspectorVisible: false,
  editorTab: 'piano',
  trackHeight: 50,
  instrumentPickerTrack: -1,
  instrumentPickerMode: 'plugin',
  diagnosticsVisible: false,
  remoteAudioOn: false,
  diagnosticsLog: 'Run Measure after connecting. LAN and mobile results must be captured on those devices.',
  diagnostics: {
    controlRttMs: null,
    renderLatencyMs: null,
    audioPathMs: null,
    midiToAudibleMs: null,
    jitterMs: null,
    underruns: 0,
    cpuPercent: null,
    audioCpuPercent: null,
    workingSetMb: null,
    pluginCount: 0,
    bufferDepthMs: 0,
    browserCpuMs: 0,
    browserPlugins: 0,
    browserFxAttached: false,
    browserFxError: '',
    limiterNsPerSample: null,
    mOrchestra: null
  },
  catalogue: {
    instruments: [],
    techniques: [],
    controllers: [],
    plugins: [],
    libraries: [],
    presets: [],
    warnings: [],
    startupStatus: '',
    maxHostedInstances: 64
  },
  tracks: starterDemo.tracks,
  clips: starterDemo.clips.map(normalizeClipNotes),
  clipPreviewRevision: 0,
  clockStamp: { positionBeats: 0, playing: false, bpm: starterDemo.bpm, receivedAt: 0 },
  clipboard: null,
  webMixer: defaultWebMixer(),
  mixerLane: { type: 'remote' },
  mixerMode: 'compact',
  showSends: false,
  openPlugin: null,
  addInsertLane: null,
  fxMeters: {},
  virtualClip: null,
  lastNoteDurationTicks: PPQ
})

export { engineLink }

export const positionText = computed(() => formatMusical(session.positionBeats, session.timeSigNum))

export const secondsText = computed(() => formatTime(session.positionBeats, session.bpm))

export function snapBeat (beat) {
  if (!session.snap || session.snapGridBeats <= 0) return Math.max(0, beat)
  const grid = session.snapGridBeats
  return Math.max(0, Math.round(beat / grid) * grid)
}

function mapTrack (track) {
  const existing = session.tracks.find((item) => item.id === track.trackId) || {}
  return {
    id: track.trackId,
    name: track.name,
    type: track.type,
    parentId: track.parentId || 0,
    collapsed: !!track.collapsed,
    colour: track.colour || '#4a90d9',
    volume: track.volume,
    volumeDb: track.volumeDb != null ? track.volumeDb : dbFromFader(track.volume),
    pan: track.pan,
    mute: !!track.mute,
    solo: !!track.solo,
    recordArm: !!track.recordArm,
    instrument: track.instrument || '',
    instrumentId: track.instrumentId || '',
    definitionId: track.definitionId || '',
    presetId: track.presetId || '',
    techniqueId: track.techniqueId || '',
    section: track.section || '',
    loadState: track.loadState || '',
    loadMessage: track.loadMessage || '',
    instrumentLoadState: track.loadState || '',
    instrumentLoadMessage: track.loadMessage || '',
    midiChannel: track.midiChannel || 1,
    controllerValues: track.controllerValues || {},
    inserts: Array.from({ length: MIXER_INSERT_SLOTS }, (_, i) => {
      const slot = (track.inserts || [])[i] || { name: '', bypassed: false }
      return {
        ...slot,
        instrumentId: slot.instrumentId || slot.pluginId || '',
        pluginId: slot.pluginId || slot.instrumentId || nameToPluginId(slot.name)
      }
    }),
    sends: normalizeSends(track.sends),
    source: track.source || existing.source || 'empty',
    legato: !!track.legato,
    meterLevel: existing.meterLevel || 0,
    webSampler: existing.webSampler || createWebSamplerInstrument({ name: track.instrument || 'Web Sampler' })
  }
}

function mapClip (clip) {
  const existing = session.clips.find((item) => item.id === (clip.clipId != null ? clip.clipId : clip.id)) || {}
  const mapped = {
    id: clip.clipId != null ? clip.clipId : clip.id,
    trackIndex: clip.trackIndex,
    startBeat: clip.start != null ? clip.start : clip.startBeat,
    lengthBeats: clip.length != null ? clip.length : clip.lengthBeats,
    name: clip.name,
    colour: clip.colour || (session.tracks[clip.trackIndex] && session.tracks[clip.trackIndex].colour) || '#4a90d9',
    midi: clip.midi !== false && clip.kind !== 'audio' && clip.kind !== 'sampler',
    kind: clip.kind || (clip.midi === false ? 'audio' : 'midi'),
    muted: !!clip.muted,
    loopCount: clip.loopCount || 1,
    loopLengthBeats: clip.loopLengthBeats || 0,
    sourceId: clip.sourceId || '',
    audioOffsetBeats: clip.audioOffsetBeats || 0,
    notes: (clip.notes || []).map((note) => normalizeNote({
      ...note,
      id: note.noteId != null ? note.noteId : note.id
    }))
  }
  mapped.expression = clip.expression || existing.expression || { cc1: [], cc11: [] }
  return mapped
}

function normalizeClipNotes (clip) {
  if (!clip) return clip
  return {
    ...clip,
    notes: (clip.notes || []).map((note) => normalizeNote({
      ...note,
      id: note.noteId != null ? note.noteId : note.id
    }))
  }
}

function applyProject (project) {
  if (!project) return
  session.projectName = project.name || session.projectName
  if (project.userName) session.userName = project.userName
  session.bpm = project.bpm || session.bpm
  session.timeSigNum = project.timeSigNumerator || session.timeSigNum
  session.timeSigDen = project.timeSigDenominator || session.timeSigDen
  session.positionBeats = project.positionBeats != null ? project.positionBeats : session.positionBeats
  session.playing = !!project.playing
  session.looping = !!project.looping
  session.loopStart = project.loopStart != null ? project.loopStart : session.loopStart
  session.loopEnd = project.loopEnd != null ? project.loopEnd : session.loopEnd
  session.metronome = !!project.metronome
  if (project.masterGain != null) {
    session.masterGain = project.masterGain
    if (session.tracks[0] && session.tracks[0].type === 'master') session.tracks[0].volume = project.masterGain
  }
  session.engineStatus = project.engineStatus || session.engineStatus
  if (project.canUndo != null) session.canUndo = !!project.canUndo
  if (project.canRedo != null) session.canRedo = !!project.canRedo
  if (project.tracks) {
    const selectedId = (session.tracks[session.selectedTrack] || {}).id
    const prevById = new Map(session.tracks.map((track) => [track.id, track]))
    session.tracks = project.tracks.map(mapTrack).map((track) => {
      const locks = mixDragLocks.get(track.id)
      if (!locks || !locks.size) return track
      const prev = prevById.get(track.id)
      if (!prev) return track
      if (locks.has('volume')) {
        track.volume = prev.volume
        track.volumeDb = prev.volumeDb
      }
      if (locks.has('pan')) track.pan = prev.pan
      return track
    })
    const master = session.tracks.find((track) => track.type === 'master')
    if (master) session.masterGain = master.volume
    const nextSelected = session.tracks.findIndex((track) => track.id === selectedId)
    session.selectedTrack = nextSelected >= 0 ? nextSelected : Math.min(session.selectedTrack, session.tracks.length - 1)
    session.tracks.forEach((track) => syncTrackMixLane(track))
  }
  if (project.clips) {
    const selectedClipId = (session.clips[session.selectedClip] || {}).id
    clearClipPreviewCache()
    session.clips = project.clips.map(mapClip)
    session.clipPreviewRevision++
    const nextClip = session.clips.findIndex((clip) => clip.id === selectedClipId)
    session.selectedClip = nextClip >= 0 ? nextClip : (session.clips.length ? 0 : -1)
    syncSelectionIds()
  }
  if (project.markers) {
    session.markers = project.markers.map(normalizeMarker)
  }
  if (project.timeSignatures) {
    session.timeSignatures = project.timeSignatures
  } else if (project.score && project.score.timeSignatures) {
    session.timeSignatures = project.score.timeSignatures
  }
  session.score = defaultScore({
    ...(project.score || {}),
    markers: session.markers,
    timeSignatures: session.timeSignatures,
    key: (project.score && project.score.key) || session.score.key,
    scale: (project.score && project.score.scale) || session.score.scale
  })
  if (project.webMixer) {
    applyWebMixer(project.webMixer)
  }
  if (project.pixelsPerBeat) session.pixelsPerBeat = project.pixelsPerBeat
  if (project.trackHeight) session.trackHeight = project.trackHeight
  syncNativeInsertsToWebMixer(session.webMixer, session.tracks)
  refreshMixerGraph()
}

function mixerGraphOptions () {
  return { localPlayback: !session.remoteAudioOn }
}

function refreshMixerGraph () {
  if (audioGraph) syncMixerGraph(audioGraph, session.webMixer, session.tracks, mixerGraphOptions())
}

function applyWebMixer (raw) {
  if (!raw) return
  if (!persistTimer) {
    session.webMixer = normalizeWebMixer(raw)
    if (session.webMixer.loadError) showToast(session.webMixer.loadError)
  }
  refreshMixerGraph()
}

function syncTrackMixLane (track) {
  if (!track || track.type === 'master') return
  const key = String(track.id)
  if (!session.webMixer.tracks[key]) session.webMixer.tracks[key] = defaultTrackMix(track)
  const lane = session.webMixer.tracks[key]
  lane.volumeDb = track.volumeDb != null ? track.volumeDb : dbFromFader(track.volume)
  lane.pan = track.pan == null ? 0 : track.pan
  lane.mute = !!track.mute
  lane.solo = !!track.solo
  lane.sends = normalizeSends(track.sends || lane.sends)
}

let pianoDragClipId = 0
let clipPreviewBumpTimer = 0

function bumpClipPreview (clipId) {
  if (clipId != null) invalidateClipPreview(clipId)
  if (clipPreviewBumpTimer) return
  clipPreviewBumpTimer = setTimeout(() => {
    clipPreviewBumpTimer = 0
    session.clipPreviewRevision++
  }, 16)
}

function applyNoteDelta (delta) {
  if (!delta || (pianoDragClipId && delta.clipId === pianoDragClipId)) return
  const clip = session.clips.find((item) => item.id === delta.clipId)
  if (!clip) return
  if (!clip.notes) clip.notes = []
  ;(delta.created || []).forEach((raw) => {
    const note = normalizeNote(raw)
    const existing = clip.notes.find((item) => item.id === note.id)
      || clip.notes.find((item) => item.pitch === note.pitch && item.startTick === note.startTick)
    if (existing) Object.assign(existing, note)
    else clip.notes.push(note)
  })
  ;(delta.updated || []).forEach((raw) => {
    const next = normalizeNote(raw)
    const index = clip.notes.findIndex((item) => item.id === next.id)
    if (index >= 0) clip.notes[index] = Object.assign(clip.notes[index], next)
    else clip.notes.push(next)
  })
  if (delta.deleted && delta.deleted.length) {
    const ids = new Set(delta.deleted.map((id) => Number(id)))
    clip.notes = clip.notes.filter((note) => !ids.has(note.id))
  }
  bumpClipPreview(clip.id)
}

function applyNotesState (payload) {
  if (!payload || !payload.clips) return
  payload.clips.forEach((entry) => {
    const clip = session.clips.find((item) => item.id === entry.clipId)
    if (!clip) return
    if (pianoDragClipId && clip.id === pianoDragClipId) return
    clip.notes = (entry.notes || []).map((note) => normalizeNote(note))
    bumpClipPreview(clip.id)
  })
}

function applyClock (clock) {
  if (!clock) return
  if (clock.positionBeats != null) session.positionBeats = clock.positionBeats
  if (clock.playing != null) session.playing = !!clock.playing
  if (clock.looping != null) session.looping = !!clock.looping
  if (clock.bpm != null) session.bpm = clock.bpm
  if (clock.engineStatus) session.engineStatus = clock.engineStatus
  session.clockStamp = {
    positionBeats: session.positionBeats,
    playing: session.playing,
    bpm: session.bpm,
    receivedAt: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    hostTimeMs: clock.hostTimeMs
  }
  if (clock.masterLevel != null && session.tracks[0]) session.tracks[0].meterLevel = clock.masterLevel
  if (session.webMixer && session.webMixer.master) {
    if (clock.masterClip != null) session.webMixer.master.clip = !!clock.masterClip
    if (clock.masterRms != null) session.webMixer.master.rms = clock.masterRms
  }
  if (Array.isArray(clock.levels)) {
    clock.levels.forEach((level, index) => {
      if (session.tracks[index]) session.tracks[index].meterLevel = level
    })
  }
}

function applySession (payload) {
  if (!payload) return
  if (payload.sessionId) engineLink.sessionId = payload.sessionId
  if (payload.schemaVersion) engineLink.schemaVersion = payload.schemaVersion
  applyProject(payload.project || payload)
  if (payload.mixer && payload.mixer.webMixer) applyWebMixer(payload.mixer.webMixer)
  ensureMixerAttached().catch(() => {})
  if (payload.audio && payload.audio.renderLatencyMs != null) {
    session.diagnostics.renderLatencyMs = payload.audio.renderLatencyMs
  }
  if (payload.diagnostics) {
    session.diagnostics.cpuPercent = payload.diagnostics.cpuPercent
    session.diagnostics.audioCpuPercent = payload.diagnostics.audioCpuPercent
    session.diagnostics.workingSetMb = payload.diagnostics.workingSetMb
    session.diagnostics.pluginCount = payload.diagnostics.pluginCount
    if (payload.diagnostics.limiterNsPerSample != null) {
      session.diagnostics.limiterNsPerSample = payload.diagnostics.limiterNsPerSample
    }
    if (payload.diagnostics.mOrchestra) {
      session.diagnostics.mOrchestra = payload.diagnostics.mOrchestra
    }
  }
}

onEngineEvent((message) => {
  if (!message) return
  if (message.type === 'event.state') applyProject(message.project)
  if (message.type === 'event.notes') applyNotesState(message.notes)
  if (message.type === 'event.noteDelta') applyNoteDelta(message.delta)
  if (message.type === 'event.clock') applyClock(message)
  if (message.type === 'session.state') applySession(message)
  if (message.ok && message.project) applyProject(message.project)
  if (message.ok && message.catalogue) applyCatalogue(message.catalogue)
  if (message.ok && message.type === 'audio.status' && message.renderLatencyMs != null) {
    session.diagnostics.renderLatencyMs = message.renderLatencyMs
  }
})

export function applyCatalogue (catalogue) {
  if (!catalogue) return
  session.catalogue.instruments = catalogue.instruments || []
  session.catalogue.techniques = catalogue.techniques || []
  session.catalogue.controllers = catalogue.controllers || []
  session.catalogue.plugins = catalogue.plugins || []
  session.catalogue.libraries = catalogue.libraries || []
  session.catalogue.presets = catalogue.presets || []
  session.catalogue.warnings = catalogue.warnings || []
  session.catalogue.startupStatus = catalogue.startupStatus || ''
  session.catalogue.maxHostedInstances = catalogue.maxHostedInstances || 64
}

export async function refreshCatalogue () {
  const reply = await fire('instrument.getCatalogue')
  if (reply && reply.catalogue) applyCatalogue(reply.catalogue)
}

export function startEngineBridge () {
  return connectEngine()
}

export function stopEngineBridge () {
  stopRemoteAudio()
  disconnectEngine()
}

export function setBpm (value) {
  session.bpm = Math.min(300, Math.max(20, Math.round(value)))
  fire('transport.setBpm', { bpm: session.bpm })
}

export function setPositionBeats (beats) {
  session.positionBeats = Math.max(0, beats)
  fire('transport.seek', { beats: session.positionBeats })
}

export function setMasterGain (gain) {
  session.masterGain = Math.min(1, Math.max(0, gain))
  if (session.tracks[0] && session.tracks[0].type === 'master') {
    session.tracks[0].volume = session.masterGain
    session.tracks[0].volumeDb = dbFromFader(session.masterGain)
  }
  if (session.webMixer && session.webMixer.master) {
    session.webMixer.master.volumeDb = dbFromFader(session.masterGain)
  }
  queueMixCommand('mixer.setMasterVolume', { value: session.masterGain, volumeDb: dbFromFader(session.masterGain) })
  refreshMixerGraph()
}

const mixQueue = new Map()
let mixFlushTimer = 0
const mixDragLocks = new Map()

export function beginMixDrag (track, parameter) {
  if (!track || !parameter) return
  const set = mixDragLocks.get(track.id) || new Set()
  set.add(parameter)
  mixDragLocks.set(track.id, set)
}

export function endMixDrag (track, parameter) {
  if (!track || !parameter) return
  const set = mixDragLocks.get(track.id)
  if (!set) return
  set.delete(parameter)
  if (!set.size) mixDragLocks.delete(track.id)
  flushTrackMix()
}

function queueMixCommand (type, payload) {
  mixQueue.set(type + JSON.stringify(payload.trackId || '') + (payload.parameter || ''), { type, payload })
  if (!mixFlushTimer) mixFlushTimer = setTimeout(flushTrackMix, Math.round(1000 / CONTROL_HZ))
}

export function flushTrackMix () {
  if (mixFlushTimer) {
    clearTimeout(mixFlushTimer)
    mixFlushTimer = 0
  }
  mixQueue.forEach((item) => fire(item.type, item.payload))
  mixQueue.clear()
}

export function setTrackParameter (track, parameter, value) {
  if (!track) return
  track[parameter] = value
  if (track.type === 'master' && parameter === 'volume') {
    session.masterGain = value
    session.webMixer.master.volumeDb = dbFromFader(value)
    queueMixCommand('mixer.setMasterVolume', { value, volumeDb: dbFromFader(value) })
    refreshMixerGraph()
    return
  }
  const payload = { trackId: track.id, parameter, value }
  if (parameter === 'volume') {
    payload.volumeDb = dbFromFader(value)
    track.volumeDb = payload.volumeDb
  }
  syncTrackMixLane(track)
  queueMixCommand('track.setParameter', payload)
  if (parameter === 'mute' || parameter === 'solo') flushTrackMix()
  if (parameter === 'volume' || parameter === 'pan' || parameter === 'mute' || parameter === 'solo') {
    refreshMixerGraph()
  }
}

export function setPixelsPerBeat (ppb) {
  session.pixelsPerBeat = Math.min(280, Math.max(8, ppb))
}

let rafId = 0
let lastTime = 0

function loop (now) {
  if (!session.playing) return
  const dt = Math.min(0.1, (now - lastTime) / 1000)
  lastTime = now
  const remoteClock = isEngineConnected() && session.remoteAudioOn
  if (!remoteClock) {
    session.positionBeats += dt * session.bpm / 60
    if (session.looping && session.positionBeats >= session.loopEnd) {
      const length = Math.max(0.25, session.loopEnd - session.loopStart)
      session.positionBeats = session.loopStart + ((session.positionBeats - session.loopStart) % length)
      allLocalNotesOff()
    }
    tickLocalMetronome(session.positionBeats)
  }
  tickLocalNotes(session.positionBeats)
  rafId = requestAnimationFrame(loop)
}

function stopLocalClock () {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

export async function play () {
  if (session.playing) return
  session.playing = true
  await unlockAudio()
  startBrowserMeterLoop()
  startExpressionPlayback()
  if (isEngineConnected()) {
    fire('transport.play')
    try {
      await startRemoteAudio()
    } catch (err) {
      showToast(err.message || 'Browser audio fallback')
    }
  }
  startLocalClock()
}

function startLocalClock () {
  if (typeof requestAnimationFrame === 'undefined') return
  lastMetroBeat = Math.floor(session.positionBeats) - 1
  ensureClickBuffer()
  lastTime = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  session.clockStamp = {
    positionBeats: session.positionBeats,
    playing: true,
    bpm: session.bpm,
    receivedAt: lastTime
  }
  if (!rafId) rafId = requestAnimationFrame(loop)
}

export function pause () {
  session.playing = false
  session.clockStamp = {
    positionBeats: session.positionBeats,
    playing: false,
    bpm: session.bpm,
    receivedAt: typeof performance !== 'undefined' ? performance.now() : Date.now()
  }
  stopLocalClock()
  stopExpressionPlayback()
  allLocalNotesOff()
  fire('transport.pause')
}

export function togglePlay () {
  session.playing ? pause() : play()
}

export function stop () {
  const wasPlaying = session.playing
  pause()
  session.recording = false
  fire('transport.stop')
  if (!wasPlaying) {
    session.positionBeats = session.looping ? session.loopStart : 0
    fire('transport.seek', { beats: session.positionBeats })
  }
}

export function returnToStart () {
  session.positionBeats = session.looping ? session.loopStart : 0
  fire('transport.seek', { beats: session.positionBeats })
}

export function toggleRecord () {
  session.recording = !session.recording
  if (session.recording && !session.playing) play()
}

export function toggleLoop () {
  session.looping = !session.looping
  fire('transport.setLoop', {
    enabled: session.looping,
    startBeats: session.loopStart,
    endBeats: session.loopEnd
  })
}

export function toggleMetronome () {
  session.metronome = !session.metronome
  fire('transport.setMetronome', { enabled: session.metronome })
}

export function toggleSnap () {
  session.snap = !session.snap
}

export function setSnapGrid (beats) {
  if (beats <= 0) {
    session.snap = false
    return
  }
  session.snap = true
  session.snapGridBeats = beats
}

export function setTimeSignature (numerator, denominator) {
  session.timeSigNum = numerator
  session.timeSigDen = denominator
  fire('transport.setTimeSignature', { numerator, denominator })
}

export function setLoopRange (startBeats, endBeats) {
  const start = Math.max(0, Math.min(startBeats, endBeats))
  const end = Math.max(start + 0.25, Math.max(startBeats, endBeats))
  session.loopStart = start
  session.loopEnd = end
  session.looping = true
  fire('transport.setLoop', { enabled: true, startBeats: start, endBeats: end })
}

export function setTrackHeight (value) {
  session.trackHeight = Math.min(160, Math.max(36, value))
}

export function setEditorTab (tab) {
  session.editorTab = tab
  session.editorVisible = true
}

export function setProjectName (name) {
  if (!name) return
  session.projectName = name
  fire('project.setName', { name })
}

export function openInstrumentPicker (trackIndex) {
  openPluginPicker (trackIndex)
}

export function openPluginPicker (trackOrIndex) {
  const trackIndex = typeof trackOrIndex === 'number'
    ? trackOrIndex
    : session.tracks.indexOf(trackOrIndex)
  const track = session.tracks[trackIndex]
  if (!track || track.type === 'master') return
  session.selectedTrack = trackIndex
  session.instrumentPickerMode = 'plugin'
  session.instrumentPickerTrack = trackIndex
}

export function openOrchestraPatchPicker (trackIndex) {
  const track = session.tracks[trackIndex]
  if (!track || track.type === 'master') return
  session.selectedTrack = trackIndex
  session.instrumentPickerMode = 'orchestra-patch'
  session.instrumentPickerTrack = trackIndex
}

export function closeInstrumentPicker () {
  session.instrumentPickerTrack = -1
}

export function onTrackInstrumentClick (trackIndex) {
  const track = session.tracks[trackIndex]
  if (!track || track.type === 'master' || isGroupTrack(track)) return
  session.selectedTrack = trackIndex
  if (trackHasInstrument(track)) {
    openPluginUI(trackIndex)
    return
  }
  openPluginPicker(trackIndex)
}

function trackHasInstrument (track) {
  if (!track) return false
  if (isMOrchestraTrack(track)) return true
  if (track.source === 'web-sampler' || track.definitionId === WEB_SAMPLER_PLUGIN_ID) return true
  if (track.definitionId) return true
  return false
}

export function openPluginUI (trackIndex) {
  const track = session.tracks[trackIndex]
  if (!track || track.type === 'master') return
  session.selectedTrack = trackIndex
  if (isLite()) {
    openLiteSheet({ kind: 'track', tab: 'sampler', trackIndex })
    return
  }
  session.editorVisible = true
  session.workspaceView = 'sampler'
  if (isMOrchestraTrack(track)) session.editorTab = 'm-orchestra'
  else if (track.source === 'web-sampler' || track.definitionId === WEB_SAMPLER_PLUGIN_ID) session.editorTab = 'info'
  else if (track.definitionId && track.definitionId !== TEST_SYNTH_PLUGIN_ID) session.editorTab = 'sampler'
  else session.editorTab = 'info'
}

export function insertPlugin (track, pluginId) {
  if (!track || track.type === 'master' || !pluginId) return
  const index = session.tracks.indexOf(track)
  if (pluginId === WEB_SAMPLER_PLUGIN_ID) {
    loadWebSampler(track)
    closeInstrumentPicker()
    if (index >= 0) openPluginUI(index)
    return
  }
  if (pluginId === ORCHESTRA_SAMPLER_PLUGIN_ID) {
    openOrchestraPatchPicker(index >= 0 ? index : session.selectedTrack)
    return
  }
  if (pluginId === M_ORCHESTRA_PLUGIN_ID) {
    loadCloudOrchestra(track, M_ORCHESTRA_DEFAULT_ID)
  } else if (pluginId === TEST_SYNTH_PLUGIN_ID) {
    track.definitionId = TEST_SYNTH_PLUGIN_ID
    track.instrument = 'Test Synth'
    if (isEngineConnected()) fire('plugin.insert', { trackId: track.id, pluginId })
    else loadInstrument(track, TEST_SYNTH_PLUGIN_ID)
  } else {
    loadInstrument(track, pluginId)
  }
  closeInstrumentPicker()
  if (index < 0) return
  session.selectedTrack = index
  if (isLite()) {
    openLiteSheet({ kind: 'track', tab: 'sampler', trackIndex: index })
    return
  }
  session.editorVisible = true
  session.workspaceView = 'sampler'
  if (pluginId === M_ORCHESTRA_PLUGIN_ID) session.editorTab = 'm-orchestra'
  else if (pluginId === TEST_SYNTH_PLUGIN_ID) session.editorTab = 'info'
  else session.editorTab = 'sampler'
}

export function listInsertablePlugins () {
  return insertablePlugins({ includeWebSampler: true })
}

export async function addTrack (type = 'audio', customName = '') {
  const name = customName || (type === 'group' ? 'Group' : (type === 'midi' ? 'Instrument ' : type === 'web-sampler' ? 'Web Sampler ' : 'Audio ') + session.tracks.length)
  if (isEngineConnected()) {
    const reply = await fire('track.create', {
      name,
      trackType: type === 'web-sampler' ? 'midi' : type
    })
    if (type === 'web-sampler' && reply && reply.trackId != null) {
      const track = session.tracks.find((item) => item.id === reply.trackId)
      if (track) loadWebSampler(track)
    }
    return reply && reply.index != null ? reply.index : -1
  }
  const colour = PALETTE[session.colourIndex % PALETTE.length]
  session.colourIndex += 1
  session.tracks.push({
    id: nextId(session.tracks),
    name,
    type: type === 'web-sampler' ? 'midi' : type,
    parentId: 0,
    collapsed: false,
    colour,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    recordArm: false,
    instrument: type === 'midi' ? 'Test Synth' : (type === 'web-sampler' ? 'Web Sampler' : ''),
    definitionId: type === 'midi' ? 'test_synth' : (type === 'web-sampler' ? 'web_sampler' : ''),
    techniqueId: '',
    section: type === 'group' ? name : '',
    controllerValues: {},
    inserts: [],
    sends: defaultSends(),
    source: type === 'web-sampler' ? 'web-sampler' : 'empty',
    legato: false,
    meterLevel: 0
  })
  markDirty()
  return session.tracks.length - 1
}

export function removeTrack (index) {
  if (index <= 0 || index >= session.tracks.length) return
  const track = session.tracks[index]
  if (isEngineConnected()) {
    fire('track.delete', { trackId: track.id })
    return
  }
  session.tracks.splice(index, 1)
  session.clips = session.clips.filter((clip) => clip.trackIndex !== index)
  session.clips.forEach((clip) => {
    if (clip.trackIndex > index) clip.trackIndex -= 1
  })
}

export function duplicateTrack (index) {
  const track = session.tracks[index]
  if (!track || track.type === 'master') return
  fire('track.duplicate', { trackId: track.id })
}

export function moveTrack (index, toIndex) {
  const track = session.tracks[index]
  if (!track || track.type === 'master') return
  fire('track.move', { trackId: track.id, toIndex })
}

export function addMidiClip (trackIndex, startBeat = session.positionBeats, lengthBeats = 8) {
  const track = session.tracks[trackIndex]
  if (!track || track.type === 'master' || track.type === 'group') return
  const start = snapBeat(startBeat)
  if (isEngineConnected()) {
    fire('clip.create', {
      trackId: track.id,
      trackIndex,
      start,
      length: lengthBeats,
      name: track.name,
      sketch: track.type === 'midi'
    })
    return
  }
  beginEdit('Create pattern')
  const clip = {
    id: nextId(session.clips),
    trackIndex,
    startBeat: start,
    lengthBeats,
    name: track.name,
    colour: track.colour,
    midi: track.type !== 'audio',
    notes: [],
    expression: { cc1: [], cc11: [] }
  }
  session.clips.push(clip)
  bumpClipPreview(clip.id)
  selectClip(session.clips.length - 1)
  endEdit()
  markDirty()
  return clip
}

export function deleteClip (clip) {
  if (!clip) return
  fire('clip.delete', { clipId: clip.id })
}

export function duplicateClip (clip) {
  if (!clip) return
  fire('clip.duplicate', { clipId: clip.id })
}

export function resizeClip (clip, startBeat, lengthBeats) {
  if (!clip) return
  clip.startBeat = Math.max(0, startBeat)
  clip.lengthBeats = Math.max(0.25, lengthBeats)
  bumpClipPreview(clip.id)
  fire('clip.move', {
    clipId: clip.id,
    start: clip.startBeat,
    length: clip.lengthBeats,
    trackIndex: clip.trackIndex
  })
}

export function renameTrack (index, name) {
  const track = session.tracks[index]
  if (!track || !name) return
  setTrackParameter(track, 'name', name)
}

export function moveClip (clip, startBeat, trackIndex) {
  if (!clip) return
  clip.startBeat = Math.max(0, startBeat)
  if (trackIndex != null) clip.trackIndex = trackIndex
  fire('clip.move', {
    clipId: clip.id,
    start: clip.startBeat,
    trackIndex: clip.trackIndex
  })
}

export function newProject () {
  stop()
  session.projectName = 'New Project'
  session.selectedTrack = 0
  session.selectedClip = -1
  session.markers = []
  session.selectedClipIds = []
  if (isEngineConnected()) {
    fire('project.new')
    return
  }
  session.clips = []
  session.tracks = session.tracks.filter((track) => track.type === 'master')
  returnToStart()
  markDirty()
}

export async function loadDemoProject () {
  stop()
  if (isEngineConnected()) {
    await fire('project.loadDemo')
    session.selectedTrack = session.tracks.length > 1 ? 1 : 0
    session.selectedClip = session.clips.length ? 0 : -1
    return
  }
  const demo = createDemoProject()
  session.projectName = demo.projectName
  session.bpm = demo.bpm
  session.timeSigNum = demo.timeSigNum
  session.timeSigDen = demo.timeSigDen
  session.loopStart = demo.loopStart
  session.loopEnd = demo.loopEnd
  session.masterGain = demo.masterGain
  session.tracks = demo.tracks
  session.clips = demo.clips.map(normalizeClipNotes)
  session.selectedTrack = 1
  session.selectedClip = 0
  session.positionBeats = 0
  demo.tracks.forEach((track) => {
    if (track.source === 'm-orchestra') loadCloudOrchestra(track, track.definitionId)
  })
}

export function isSupportedFile (name = '') {
  const lower = name.toLowerCase()
  return SUPPORT_EXTS.some((ext) => lower.endsWith(ext))
}

export async function addClipFromFile (file, trackIndex, startBeat) {
  const name = file && file.name ? file.name.replace(/\.[^.]+$/, '') : 'Clip'
  const midi = /\.mid(i)?$/i.test(file && file.name ? file.name : '')
  let track = session.tracks[trackIndex]
  let trackId = track && track.id
  const needsNew = trackIndex <= 0 || !track || track.type === 'master' || (midi && track.type !== 'midi')

  if (needsNew) {
    if (isEngineConnected()) {
      const reply = await fire('track.create', {
        name: midi ? 'MIDI' : 'Audio',
        trackType: midi ? 'midi' : 'audio'
      })
      if (reply && reply.index != null) trackIndex = reply.index
      if (reply && reply.trackId != null) trackId = reply.trackId
    } else {
      trackIndex = await addTrack(midi ? 'midi' : 'audio')
      trackId = session.tracks[trackIndex] && session.tracks[trackIndex].id
    }
  }

  if (isEngineConnected()) {
    await fire('clip.create', {
      trackId,
      trackIndex,
      start: snapBeat(startBeat),
      length: midi ? 8 : 4,
      name,
      sketch: midi
    })
    return
  }

  session.clips.push({
    id: nextId(session.clips),
    trackIndex,
    startBeat: snapBeat(startBeat),
    lengthBeats: midi ? 8 : 4,
    name,
    colour: session.tracks[trackIndex].colour,
    midi,
    notes: []
  })
}

export function isTrackAudible (index) {
  const track = session.tracks[index]
  if (!track) return false
  if (track.mute) return false
  const parent = session.tracks.find((item) => item.id === track.parentId)
  if (parent && parent.mute) return false
  if (track.type === 'master') return true
  const anySolo = session.tracks.some((item) => item.solo && item.type !== 'master')
  if (!anySolo) return true
  if (track.solo) return true
  if (parent && parent.solo) return true
  return false
}

export function selectTrack (index) {
  if (index < 0 || index >= session.tracks.length) return
  session.selectedTrack = index
  const track = session.tracks[index]
  session.activeTrackId = track ? track.id : 0
  session.selectedTrackIds = track ? [track.id] : []
  const clipIndex = session.clips.findIndex((clip) => clip.trackIndex === index)
  if (clipIndex >= 0) selectClip(clipIndex, false)
  session.scrollRequest = Date.now()
}

export function selectClip (index, exclusive = true) {
  if (index < 0 || index >= session.clips.length) return
  session.virtualClip = null
  session.selectedClip = index
  session.selectedTrack = session.clips[index].trackIndex
  const clip = session.clips[index]
  session.activeClipId = clip ? clip.id : 0
  session.activeTrackId = (session.tracks[session.selectedTrack] || {}).id || 0
  if (exclusive) session.selectedClipIds = clip ? [clip.id] : []
  else if (clip && !session.selectedClipIds.includes(clip.id)) session.selectedClipIds.push(clip.id)
}

export function getSelectedTrack () {
  return session.tracks[session.selectedTrack] || null
}

export function getSelectedClip () {
  if (session.virtualClip) return session.virtualClip
  return session.clips[session.selectedClip] || null
}

export function openVirtualClip (clip) {
  if (!clip) return
  session.virtualClip = clip
  session.selectedClip = -1
  session.selectedTrack = clip.trackIndex
  session.activeClipId = clip.id
  session.selectedClipIds = clip.sourceClipIds || []
}

function refreshVirtualClip () {
  if (!session.virtualClip || !session.virtualClip.virtual) return
  const built = buildCollapsedGroupClip(session.tracks, session.clips, session.virtualClip.groupId)
  if (built) {
    session.virtualClip = built
    bumpClipPreview(built.id)
  }
}

function sourceClipForVirtual (virtual, absBeat) {
  const ids = new Set(virtual.sourceClipIds || [])
  const hits = session.clips.filter((clip) => {
    if (!ids.has(clip.id)) return false
    const start = clip.startBeat || 0
    const end = start + (clip.lengthBeats || 0)
    return absBeat >= start && absBeat < end + 0.0001
  })
  return hits[0] || session.clips.find((clip) => ids.has(clip.id)) || null
}

export function closeEditor () {
  session.editorVisible = false
  session.pianoRollFocus = false
  if (session.workspaceView === 'piano' || session.workspaceView === 'sampler') {
    session.workspaceView = 'arrangement'
  }
}

export function toggleEditor () {
  if (session.editorVisible) closeEditor()
  else session.editorVisible = true
}

export function toggleMixer () {
  session.mixerVisible = !session.mixerVisible
  if (session.mixerVisible) {
    unlockAudio().catch(() => {})
    ensureMixerAttached().catch((err) => {
      showToast(err.message || 'Browser FX audio failed to start')
    })
  }
}

export function toggleInspector () {
  session.inspectorVisible = !session.inspectorVisible
}

export function setEditorVisible (visible) {
  if (visible) session.editorVisible = true
  else closeEditor()
}

export function definitionById (id) {
  return session.catalogue.instruments.find((item) => item.id === id) || null
}

export function techniqueById (id) {
  return session.catalogue.techniques.find((item) => item.id === id) || null
}

export function controllerById (id) {
  return session.catalogue.controllers.find((item) => item.id === id) || null
}

export function pluginById (id) {
  return session.catalogue.plugins.find((item) => item.id === id) || null
}

export function catalogueByCategory () {
  const groups = [{
    category: 'Browser',
    items: [{
      id: 'web_sampler',
      displayName: 'Web Sampler',
      available: true,
      sourcePlugin: 'browser',
      category: 'Browser'
    }]
  }]
  const seen = new Map()
  session.catalogue.instruments.forEach((item) => {
    const category = item.category || 'Other'
    if (!seen.has(category)) {
      seen.set(category, [])
      groups.push({ category, items: seen.get(category) })
    }
    seen.get(category).push(item)
  })
  return groups
}

export function orchestraPatchCatalogue () {
  return catalogueByCategory()
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const id = String(item.id || '')
        const plugin = String(item.sourcePlugin || '')
        return id !== WEB_SAMPLER_PLUGIN_ID
          && id !== TEST_SYNTH_PLUGIN_ID
          && plugin !== M_ORCHESTRA_PLUGIN_ID
          && plugin !== TEST_SYNTH_PLUGIN_ID
          && !id.startsWith('m_orch_')
      })
    }))
    .filter((group) => group.items.length && group.category !== 'Browser' && group.category !== 'M Orchestra' && group.category !== 'Internal')
}

export function loadInstrument (track, definitionId) {
  if (!track || track.type === 'master' || !definitionId) return
  if (definitionId === 'web_sampler') {
    loadWebSampler(track)
    return
  }
  if (String(definitionId).startsWith('m_orch_') || definitionId === M_ORCHESTRA_PLUGIN_ID) {
    loadCloudOrchestra(track, definitionId === M_ORCHESTRA_PLUGIN_ID ? M_ORCHESTRA_DEFAULT_ID : definitionId)
    return
  }
  fire('instrument.load', { trackId: track.id, definitionId })
}

export function loadCloudOrchestra (track, definitionId) {
  if (!track || track.type === 'master') return
  const id = definitionId || M_ORCHESTRA_DEFAULT_ID
  const item = mOrchestraInstrument(id)
  track.source = 'm-orchestra'
  track.definitionId = id
  track.instrument = (item && item.name) || 'M Orchestra'
  track.techniqueId = track.techniqueId || ((item && item.family === 'percussion') ? 'm_orch_hit' : 'm_orch_long')
  if (!track.controllerValues) track.controllerValues = { dynamics: 100, expression: 100, vibrato: 40 }
  track.loadState = 'Ready'
  track.loadMessage = 'Cloud M Orchestra'
  track.instrumentLoadState = 'ready'
  track.instrumentLoadMessage = 'Cloud library'
  unlockAudio().then((graph) => {
    if (!graph) return
    return mOrchestraCloud.preloadInstrument(graph, id)
  }).catch((err) => {
    console.warn('[m-orchestra] preload failed', err)
  })
}

export function loadWebSampler (track, patch = {}) {
  if (!track || track.type === 'master') return
  const next = createWebSamplerInstrument({
    ...(track.webSampler || {}),
    name: patch.name || track.instrument || 'Web Sampler',
    ...patch
  })
  track.webSampler = next
  track.source = 'web-sampler'
  track.instrument = next.name
  track.definitionId = 'web_sampler'
  track.loadState = 'Ready'
  track.loadMessage = next.sampleName ? ('WAV: ' + next.sampleName) : 'Web sampler (load a WAV)'
  track.instrumentLoadState = track.loadState
  track.instrumentLoadMessage = track.loadMessage
  fire('sampler.load', { trackId: track.id, name: next.name, instrumentId: 'web_sampler' })
}

export function unloadInstrument (track) {
  if (!track || track.type === 'master') return
  fire('instrument.unload', { trackId: track.id })
}

export function setTechnique (track, techniqueId) {
  if (!track) return
  track.techniqueId = techniqueId
  if (isMOrchestraTrack(track)) return
  fire('instrument.setTechnique', { trackId: track.id, techniqueId })
}

export function setController (track, controllerId, value) {
  if (!track) return
  if (!track.controllerValues) track.controllerValues = {}
  track.controllerValues[controllerId] = value
  if (isMOrchestraTrack(track)) {
    mOrchestraCloud.applyControllers(track)
    return
  }
  fire('instrument.setController', { trackId: track.id, controllerId, value })
}

export function setLegato (track, legato) {
  if (!track) return
  track.legato = !!legato
  fire('instrument.setLegato', { trackId: track.id, legato: !!legato })
}

export function previewNoteOn (track, pitch, velocity = 0.8) {
  if (!track) return
  unlockAudio().then(async () => {
    await ensureMixerAttached()
    refreshMixerGraph()
    if (isMOrchestraTrack(track)) {
      previewMOrchestra(track, pitch, velocity)
      startBrowserMeterLoop()
      return
    }
    if (isEngineConnected() && track.source !== 'web-sampler') {
      startRemoteAudio().catch(() => {})
      fire('preview.noteOn', { trackId: track.id, pitch, velocity })
      return
    }
    previewWebSampler(track, pitch, velocity)
    startBrowserMeterLoop()
  }).catch((err) => {
    showToast(err.message || 'Audio preview failed')
  })
}

export function previewNoteOff (track, pitch) {
  if (!track) return
  if (isMOrchestraTrack(track)) {
    const previewId = 'preview-' + track.id + '-' + pitch
    mOrchestraCloud.cancelPending(previewId, track.id)
    mOrchestraCloud.noteOff(previewId, track.id)
    return
  }
  if (track.source === 'web-sampler') {
    releaseWebSampler(pitch)
    return
  }
  fire('preview.noteOff', { trackId: track.id, pitch })
}

export function createNote (clip, pitch, start, duration = 0.25, velocity = 100, extra = {}) {
  if (!clip) return null
  session.lastNoteDurationTicks = Math.max(1, Math.round((duration || 0.25) * PPQ))
  if (clip.virtual) {
    const absBeat = (clip.startBeat || 0) + start
    const src = sourceClipForVirtual(clip, absBeat)
    if (!src) return null
    const note = createNote(src, pitch, absBeat - (src.startBeat || 0), duration, velocity, extra)
    refreshVirtualClip()
    return note
  }
  if (!clip.notes) clip.notes = []
  const note = normalizeNote({
    id: extra.id || nextId(clip.notes),
    pitch,
    start,
    duration,
    velocity,
    ...extra
  })
  clip.notes.push(note)
  bumpClipPreview(clip.id)
  if (isEngineConnected()) {
    fire('note.create', { clipId: clip.id, ...engineNotePayload(note) }).then((reply) => {
      if (reply && reply.noteId) note.id = reply.noteId
    })
  }
  return note
}

export function createNotes (clip, notes) {
  if (!clip || !notes || !notes.length) return []
  if (!clip.notes) clip.notes = []
  const created = notes.map((item) => {
    const note = normalizeNote({ ...item, id: item.id || nextId(clip.notes) })
    clip.notes.push(note)
    return note
  })
  if (isEngineConnected()) {
    fire('notes.createBatch', { clipId: clip.id, notes: created.map(engineNotePayload) }).then((reply) => {
      const ids = (reply && reply.noteIds) || []
      created.forEach((note, index) => {
        if (ids[index]) note.id = ids[index]
      })
    })
  }
  bumpClipPreview(clip.id)
  return created
}

export function deleteNote (clip, note) {
  if (!clip || !note) return
  clip.notes = (clip.notes || []).filter((item) => item.id !== note.id)
  bumpClipPreview(clip.id)
  fire('note.delete', { clipId: clip.id, noteId: note.id })
}

export function deleteNotes (clip, notes) {
  if (!clip || !notes || !notes.length) return
  if (clip.virtual) {
    const groups = new Map()
    notes.forEach((note) => {
      if (!note.sourceClipId) return
      if (!groups.has(note.sourceClipId)) groups.set(note.sourceClipId, [])
      groups.get(note.sourceClipId).push({ id: note.sourceNoteId })
    })
    groups.forEach((list, clipId) => {
      const src = session.clips.find((item) => item.id === clipId)
      if (src) deleteNotes(src, list)
    })
    refreshVirtualClip()
    return
  }
  const ids = new Set(notes.map((note) => note.id))
  clip.notes = (clip.notes || []).filter((item) => !ids.has(item.id))
  bumpClipPreview(clip.id)
  fire('notes.deleteBatch', { clipId: clip.id, noteIds: Array.from(ids) })
}

export function setNote (clip, note, patch) {
  if (!clip || !note) return
  if (patch && patch.durationTick != null) session.lastNoteDurationTicks = patch.durationTick
  if (clip.virtual) {
    const src = session.clips.find((item) => item.id === note.sourceClipId)
    if (!src) return
    const live = (src.notes || []).find((item) => item.id === note.sourceNoteId)
    if (!live) return
    const origin = (src.startBeat || 0) - (clip.startBeat || 0)
    const next = { ...patch }
    if (next.startTick != null) next.startTick = next.startTick - Math.round(origin * PPQ)
    if (next.start != null) next.start = next.start - origin
    setNote(src, live, next)
    refreshVirtualClip()
    return
  }
  const live = (clip.notes || []).find((item) => item.id === note.id) || note
  Object.assign(live, normalizeNote({ ...live, ...patch, id: live.id }))
  bumpClipPreview(clip.id)
  queueNotePatch(clip, live)
}

const notePatchQueue = new Map()
let notePatchTimer = 0

function queueNotePatch (clip, note) {
  if (!clip || !note) return
  notePatchQueue.set(clip.id + ':' + note.id, { clipId: clip.id, note })
  if (!notePatchTimer) notePatchTimer = setTimeout(flushNotePatches, 24)
}

export function flushNotePatches () {
  if (notePatchTimer) {
    clearTimeout(notePatchTimer)
    notePatchTimer = 0
  }
  if (!notePatchQueue.size) return
  const byClip = new Map()
  notePatchQueue.forEach((item) => {
    if (!byClip.has(item.clipId)) byClip.set(item.clipId, [])
    byClip.get(item.clipId).push(engineNotePayload(item.note))
  })
  notePatchQueue.clear()
  byClip.forEach((notes, clipId) => {
    bumpClipPreview(clipId)
    fire('notes.updateBatch', { clipId, notes })
  })
}

export function setPianoDragActive (clipId) {
  pianoDragClipId = clipId || 0
}

export function showToast (text) {
  session.toast = text
  setTimeout(() => {
    if (session.toast === text) session.toast = ''
  }, 1800)
}

export function closeMenus () {
  session.openMenu = ''
}

const localUndo = []
const localRedo = []
let editOpen = false
const clipMoveQueue = new Map()
let clipMoveTimer = 0

export function beginEdit (name = 'Edit') {
  if (editOpen) return
  editOpen = true
  if (isEngineConnected()) {
    fire('edit.begin', { name })
    return
  }
  localUndo.push(JSON.parse(JSON.stringify({
    tracks: session.tracks,
    clips: session.clips,
    markers: session.markers,
    selectedTrack: session.selectedTrack,
    selectedClip: session.selectedClip
  })))
  if (localUndo.length > 64) localUndo.shift()
  localRedo.length = 0
  session.canUndo = true
  session.canRedo = false
}

export function endEdit () {
  editOpen = false
  if (isEngineConnected()) fire('edit.end')
}

export async function undoEdit () {
  endEdit()
  if (isEngineConnected()) {
    await fire('edit.undo')
    return
  }
  if (!localUndo.length) return
  localRedo.push(JSON.parse(JSON.stringify({
    tracks: session.tracks,
    clips: session.clips,
    markers: session.markers,
    selectedTrack: session.selectedTrack,
    selectedClip: session.selectedClip
  })))
  const snap = localUndo.pop()
  session.tracks = snap.tracks
  session.clips = snap.clips
  session.markers = snap.markers
  session.selectedTrack = snap.selectedTrack
  session.selectedClip = snap.selectedClip
  syncSelectionIds()
  session.canUndo = localUndo.length > 0
  session.canRedo = localRedo.length > 0
}

export async function redoEdit () {
  endEdit()
  if (isEngineConnected()) {
    await fire('edit.redo')
    return
  }
  if (!localRedo.length) return
  localUndo.push(JSON.parse(JSON.stringify({
    tracks: session.tracks,
    clips: session.clips,
    markers: session.markers,
    selectedTrack: session.selectedTrack,
    selectedClip: session.selectedClip
  })))
  const snap = localRedo.pop()
  session.tracks = snap.tracks
  session.clips = snap.clips
  session.markers = snap.markers
  session.selectedTrack = snap.selectedTrack
  session.selectedClip = snap.selectedClip
  syncSelectionIds()
  session.canUndo = localUndo.length > 0
  session.canRedo = localRedo.length > 0
}

export function isLite () {
  return isLiteMode(session.interfaceMode)
}

export function setInterfaceMode (mode) {
  const next = mode === INTERFACE_PROFESSIONAL ? INTERFACE_PROFESSIONAL : INTERFACE_LITE
  if (session.interfaceMode === next) return
  session.interfaceMode = next
  writeInterfaceMode(next)
  session.settingsOpen = false
  session.liteSheet = null
  session.openMenu = ''
  if (next === INTERFACE_LITE) {
    session.inspectorVisible = false
    session.diagnosticsVisible = false
    const invalid = session.workspaceView === 'sampler'
      || session.editorTab === 'sampler'
      || session.editorTab === 'm-orchestra'
      || session.editorTab === 'info'
      || session.editorTab === 'automation'
    if (invalid || (session.workspaceView !== 'arrangement' && session.workspaceView !== 'piano' && session.workspaceView !== 'mixer')) {
      session.workspaceView = 'arrangement'
      session.editorVisible = false
      session.editorTab = 'piano'
    }
    if (session.trackHeight < 52) session.trackHeight = 56
  } else {
    if (session.workspaceView === 'piano') {
      session.editorVisible = true
      session.editorTab = 'piano'
    }
    if (session.workspaceView === 'mixer') session.mixerVisible = true
  }
}

export function openLiteSheet (sheet) {
  session.liteSheet = sheet || null
}

export function closeLiteSheet () {
  session.liteSheet = null
}

export function openSettings () {
  session.settingsOpen = true
  session.openMenu = ''
}

export function closeSettings () {
  session.settingsOpen = false
}

export function dismissLiteHint () {
  session.liteHintDismissed = true
  writeLiteHintDismissed()
}

export function setExpressionOpen (open, cc) {
  session.expressionOpen = !!open
  if (cc === 1 || cc === 11) session.expressionCc = cc
}

export function paintClipExpression (clip, cc, t, v) {
  if (!clip) return
  const expr = ensureExpression(clip)
  const key = laneKey(cc)
  expr[key] = paintPoint(expr[key], Math.max(0, t), v)
  markDirty()
}

export function eraseClipExpression (clip, cc, t) {
  if (!clip) return
  const expr = ensureExpression(clip)
  const key = laneKey(cc)
  expr[key] = eraseNear(expr[key], t)
  markDirty()
}

let expressionRaf = 0
let lastExpressionAt = 0
const lastExpressionSent = new Map()

function applyExpressionAtPlayhead (nowMs) {
  const beat = interpolateBeats(session.clockStamp || session, nowMs, session.bpm)
  session.tracks.forEach((track, index) => {
    if (!track || track.type === 'master' || track.type === 'group') return
    const clip = session.clips.find((item) => (
      item.trackIndex === index
      && item.midi
      && beat >= (item.startBeat || 0)
      && beat < (item.startBeat || 0) + (item.lengthBeats || 0)
    ))
    if (!clip || !clip.expression) return
    const t = beat - (clip.startBeat || 0)
    const expr = ensureExpression(clip)
    ;[1, 11].forEach((cc) => {
      const points = expr[laneKey(cc)]
      if (!points || !points.length) return
      const id = controllerIdForCc(session.catalogue.controllers, cc)
      const value = sampleLane(points, t) / 127
      const key = track.id + ':' + id
      const prev = lastExpressionSent.get(key)
      if (prev != null && Math.abs(prev - value) < 0.02) return
      lastExpressionSent.set(key, value)
      setController(track, id, value)
    })
  })
}

function tickExpressionPlayback (now) {
  expressionRaf = 0
  if (!session.playing) return
  if (!lastExpressionAt || now - lastExpressionAt >= 50) {
    lastExpressionAt = now
    applyExpressionAtPlayhead(now)
  }
  expressionRaf = requestAnimationFrame(tickExpressionPlayback)
}

function startExpressionPlayback () {
  if (typeof requestAnimationFrame === 'undefined') return
  lastExpressionSent.clear()
  if (expressionRaf) cancelAnimationFrame(expressionRaf)
  expressionRaf = requestAnimationFrame(tickExpressionPlayback)
}

function stopExpressionPlayback () {
  if (expressionRaf) cancelAnimationFrame(expressionRaf)
  expressionRaf = 0
  lastExpressionAt = 0
}

export function setWorkspaceView (view) {
  if (view === 'piano') {
    if (!isLite() && session.workspaceView === 'piano' && session.editorVisible) {
      closeEditor()
      return
    }
    session.workspaceView = 'piano'
    session.editorVisible = true
    session.editorTab = 'piano'
    return
  }
  if (view === 'sampler') {
    if (isLite()) {
      openLiteSheet({ kind: 'track', tab: 'sampler', trackIndex: session.selectedTrack })
      return
    }
    if (session.workspaceView === 'sampler' && session.editorVisible) {
      closeEditor()
      return
    }
    openPluginUI(session.selectedTrack)
    return
  }
  if (view === 'mixer') {
    if (!isLite() && session.workspaceView === 'mixer' && session.mixerVisible) {
      session.mixerVisible = false
      session.workspaceView = 'arrangement'
      return
    }
    session.workspaceView = 'mixer'
    session.mixerVisible = true
    unlockAudio().catch(() => {})
    ensureMixerAttached().catch((err) => {
      showToast(err.message || 'Browser FX audio failed to start')
    })
    return
  }
  session.workspaceView = 'arrangement'
  closeEditor()
  if (typeof window !== 'undefined' && window.innerWidth < 720) {
    session.mixerVisible = false
  }
}

export function setPositionFormat (format) {
  session.positionFormat = format === 'time' ? 'time' : 'musical'
}

export function setTyping (value) {
  session.typing = !!value
}

export function toggleClipSelection (clip, additive, range) {
  if (!clip) return
  const index = session.clips.findIndex((item) => item.id === clip.id)
  if (range && session.activeClipId) {
    const origin = session.clips.findIndex((item) => item.id === session.activeClipId)
    const from = Math.min(origin, index)
    const to = Math.max(origin, index)
    session.selectedClipIds = session.clips.slice(from, to + 1).map((item) => item.id)
    session.selectedClip = index
    session.activeClipId = clip.id
    return
  }
  if (additive) {
    if (session.selectedClipIds.includes(clip.id)) {
      session.selectedClipIds = session.selectedClipIds.filter((id) => id !== clip.id)
    } else {
      session.selectedClipIds = session.selectedClipIds.concat(clip.id)
    }
    session.selectedClip = index
    session.activeClipId = clip.id
    session.selectedTrack = clip.trackIndex
    return
  }
  selectClip(index, true)
}

export function selectedClips () {
  if (session.selectedClipIds && session.selectedClipIds.length) {
    return session.clips.filter((clip) => session.selectedClipIds.includes(clip.id))
  }
  const clip = getSelectedClip()
  return clip ? [clip] : []
}

export function queueClipMoves (clips) {
  clips.forEach((clip) => {
    clipMoveQueue.set(clip.id, {
      clipId: clip.id,
      start: clip.startBeat,
      length: clip.lengthBeats,
      trackIndex: clip.trackIndex
    })
  })
  if (!clipMoveTimer) clipMoveTimer = setTimeout(flushClipMoves, 32)
}

export function flushClipMoves () {
  if (clipMoveTimer) {
    clearTimeout(clipMoveTimer)
    clipMoveTimer = 0
  }
  if (!clipMoveQueue.size) return
  const clips = Array.from(clipMoveQueue.values())
  clipMoveQueue.clear()
  if (isEngineConnected()) fire('clip.moveBatch', { clips })
}

export function loopClip (clip) {
  if (!clip) return
  beginEdit('Loop clip')
  const source = clip.loopLengthBeats > 0.01 ? clip.loopLengthBeats : clip.lengthBeats
  clip.loopLengthBeats = source
  clip.loopCount = Math.max(2, clip.loopCount || 1)
  clip.lengthBeats = source * clip.loopCount
  fire('clip.update', {
    clipId: clip.id,
    loopCount: clip.loopCount,
    loopLengthBeats: clip.loopLengthBeats,
    length: clip.lengthBeats
  })
  endEdit()
  markDirty()
}

export function muteClips (clips, muted) {
  beginEdit('Mute clips')
  clips.forEach((clip) => {
    clip.muted = muted
    fire('clip.update', { clipId: clip.id, muted })
  })
  endEdit()
}

export function moveSelectedClips (startDelta, trackDelta) {
  const clips = selectedClips()
  if (!clips.length) return
  clips.forEach((clip) => {
    clip.startBeat = Math.max(0, snapBeat(clip.startBeat + startDelta))
    const nextTrack = Math.min(session.tracks.length - 1, Math.max(1, clip.trackIndex + trackDelta))
    const dest = session.tracks[nextTrack]
    if (dest && dest.type !== 'master' && dest.type !== 'group') clip.trackIndex = nextTrack
  })
  queueClipMoves(clips)
}

export function duplicateSelectedClips () {
  const clips = selectedClips()
  if (!clips.length) return
  beginEdit('Duplicate clips')
  clips.forEach((clip) => duplicateClip(clip))
  endEdit()
}

export function deleteSelectedClips () {
  const clips = selectedClips()
  if (!clips.length) return
  beginEdit('Delete clips')
  clips.forEach((clip) => deleteClip(clip))
  session.selectedClipIds = []
  endEdit()
}

export function copySelectedClips () {
  session.clipboard = selectedClips().map((clip) => ({
    startBeat: clip.startBeat,
    lengthBeats: clip.lengthBeats,
    trackIndex: clip.trackIndex,
    name: clip.name,
    midi: clip.midi,
    notes: (clip.notes || []).map((note) => ({ ...note })),
    expression: clip.expression ? JSON.parse(JSON.stringify(clip.expression)) : { cc1: [], cc11: [] }
  }))
}

export function pasteClips () {
  const items = session.clipboard
  if (!items || !items.length) return
  beginEdit('Paste clips')
  const origin = Math.min.apply(null, items.map((item) => item.startBeat))
  items.forEach((item) => {
    const trackIndex = session.selectedTrack > 0 ? session.selectedTrack : item.trackIndex
    addMidiClip(trackIndex, session.positionBeats + (item.startBeat - origin), item.lengthBeats)
  })
  endEdit()
}

export function quantizeSelectedClipStarts () {
  const clips = selectedClips()
  if (!clips.length) return
  beginEdit('Quantize clips')
  clips.forEach((clip) => {
    clip.startBeat = snapBeat(clip.startBeat)
  })
  flushClipMoves()
  queueClipMoves(clips)
  flushClipMoves()
  endEdit()
}

export function groupSelectedTracks () {
  const ids = session.selectedTrackIds.filter((id) => {
    const track = session.tracks.find((item) => item.id === id)
    return track && isPlayableTrack(track)
  })
  if (ids.length < 2) return
  beginEdit('Group tracks')
  if (isEngineConnected()) {
    fire('track.group', { trackIds: ids, name: 'Group' })
    endEdit()
    return
  }
  let insertAt = session.tracks.length
  ids.forEach((id) => {
    const index = session.tracks.findIndex((item) => item.id === id)
    if (index >= 0) insertAt = Math.min(insertAt, index)
  })
  const colour = PALETTE[session.colourIndex % PALETTE.length]
  session.colourIndex += 1
  const group = {
    id: nextId(session.tracks),
    name: 'Group',
    type: 'group',
    parentId: 0,
    collapsed: false,
    colour,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    recordArm: false,
    instrument: '',
    definitionId: '',
    techniqueId: '',
    section: 'Group',
    controllerValues: {},
    inserts: [],
    sends: defaultSends(),
    source: 'empty',
    legato: false,
    meterLevel: 0
  }
  session.tracks.splice(Math.max(1, insertAt), 0, group)
  session.tracks.forEach((track) => {
    if (ids.includes(track.id)) track.parentId = group.id
  })
  session.selectedTrack = session.tracks.indexOf(group)
  session.selectedTrackIds = [group.id]
  markDirty()
  endEdit()
}

export function ungroupSelectedTracks () {
  const selected = session.tracks.filter((track) => session.selectedTrackIds.includes(track.id))
  const group = selected.find((track) => isGroupTrack(track)) || session.tracks[session.selectedTrack]
  if (!group || !isGroupTrack(group)) return
  beginEdit('Ungroup tracks')
  if (isEngineConnected()) {
    fire('track.ungroup', { trackId: group.id })
    endEdit()
    return
  }
  session.tracks.forEach((track) => {
    if (track.parentId === group.id) track.parentId = 0
  })
  const index = session.tracks.indexOf(group)
  if (index >= 0) session.tracks.splice(index, 1)
  session.selectedTrackIds = []
  markDirty()
  endEdit()
}

export function toggleTrackInSelection (track) {
  if (!track || track.type === 'master') return
  const ids = session.selectedTrackIds.slice()
  const at = ids.indexOf(track.id)
  if (at >= 0) ids.splice(at, 1)
  else ids.push(track.id)
  session.selectedTrackIds = ids
  session.selectedTrack = session.tracks.indexOf(track)
  session.activeTrackId = track.id
}

export function setTrackCollapsed (track, collapsed) {
  if (!track) return
  track.collapsed = collapsed
  fire('track.setCollapsed', { trackId: track.id, collapsed })
}

export function addMarker (name, startBeat) {
  const marker = {
    id: nextId(session.markers),
    name: name || 'Marker',
    startBeat: snapBeat(startBeat != null ? startBeat : session.positionBeats),
    section: ''
  }
  if (isEngineConnected()) {
    fire('marker.create', { name: marker.name, startBeat: marker.startBeat })
    return
  }
  session.markers.push(marker)
  markDirty()
}

export function updateMarker (marker, patch) {
  if (!marker) return
  Object.assign(marker, patch)
  fire('marker.update', { markerId: marker.id, ...patch })
  markDirty()
}

export function deleteMarker (marker) {
  if (!marker) return
  fire('marker.delete', { markerId: marker.id })
  session.markers = session.markers.filter((item) => item.id !== marker.id)
  markDirty()
}

export function engineState () {
  if (engineLink.connecting) return 'loading'
  if (engineLink.connected) return 'connected'
  if (engineLink.lastError) return 'error'
  return 'offline'
}

export function engineStateLabel () {
  const state = engineState()
  if (state === 'connected') return 'Ready'
  if (state === 'loading') return 'Loading'
  if (state === 'error') return 'Error'
  return 'Offline'
}

async function autosaveProject () {
  if (typeof localStorage === 'undefined') return
  session.saveStatus = 'Saving…'
  try {
    if (isEngineConnected()) {
      const reply = await fire('project.export')
      if (reply && reply.json) localStorage.setItem('dawweb.autosave', reply.json)
    } else {
      localStorage.setItem('dawweb.autosave', JSON.stringify(serializeProject()))
    }
    session.unsaved = false
    session.saveStatus = 'Saved'
    rememberRecentProject()
    setTimeout(() => {
      if (session.saveStatus === 'Saved') session.saveStatus = ''
    }, 1400)
  } catch (err) {
    session.saveStatus = ''
  }
}

export { isGroupTrack, isPlayableTrack }

function loadRecentProjects () {
  if (typeof localStorage === 'undefined') return
  try {
    session.recentProjects = JSON.parse(localStorage.getItem('dawweb.recent') || '[]') || []
  } catch (err) {
    session.recentProjects = []
  }
}

export function rememberRecentProject () {
  if (typeof localStorage === 'undefined') return
  const entry = { name: session.projectName || 'Untitled', at: Date.now() }
  session.recentProjects = [entry].concat(
    (session.recentProjects || []).filter((item) => item.name !== entry.name)
  ).slice(0, 8)
  localStorage.setItem('dawweb.recent', JSON.stringify(session.recentProjects))
}

export function restoreAutosave () {
  if (typeof localStorage === 'undefined') {
    showToast('No autosave')
    return
  }
  const json = localStorage.getItem('dawweb.autosave')
  if (!json) {
    showToast('No autosave')
    return
  }
  importProjectJson(json)
}

loadRecentProjects()

function downloadText (filename, text) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function serializeProject () {
  return {
    version: 1,
    name: session.projectName,
    bpm: session.bpm,
    timeSigNumerator: session.timeSigNum,
    timeSigDenominator: session.timeSigDen,
    positionBeats: session.positionBeats,
    looping: session.looping,
    loopStart: session.loopStart,
    loopEnd: session.loopEnd,
    metronome: session.metronome,
    tracks: session.tracks,
    clips: session.clips,
    markers: session.markers,
    webMixer: session.webMixer,
    pixelsPerBeat: session.pixelsPerBeat,
    trackHeight: session.trackHeight
  }
}

export async function saveProjectLocal () {
  session.saveStatus = 'Saving…'
  try {
    const data = serializeProject()
    const json = JSON.stringify(data)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dawweb.autosave', json)
      localStorage.setItem('dawweb.project.last', json)
    }
    if (isEngineConnected()) {
      await fire('project.save', { json }).catch(() => {})
    }
    downloadText((session.projectName || 'project') + '.dawweb', json)
    session.unsaved = false
    session.saveStatus = 'Saved'
    rememberRecentProject()
    showToast('Project saved')
    setTimeout(() => {
      if (session.saveStatus === 'Saved') session.saveStatus = ''
    }, 1400)
  } catch (err) {
    session.saveStatus = ''
    showToast(err.message || 'Save failed')
  }
}

export async function exportProject () {
  await saveProjectLocal()
}

export async function importProjectJson (json) {
  if (!json) return
  let data = json
  if (typeof json === 'string') {
    try { data = JSON.parse(json) } catch (err) {
      showToast('Invalid project file')
      return
    }
  }
  if (isEngineConnected()) {
    const reply = await fire('project.import', { json: typeof json === 'string' ? json : JSON.stringify(data) })
    if (reply) showToast('Project loaded')
  }
  applyProject(data)
  if (data.webMixer) applyWebMixer(data.webMixer)
  session.unsaved = false
  showToast('Project loaded')
}

let audioGraph = null
let audioUnsub = null
let lastAudioSeq = 0
let lastHostMicros = 0
const jitterSamples = []
let pendingClick = null
let pendingNote = null
const samplerVoices = new Map()
const soundingNotes = new Map()
const samplerBuffers = new Map()
let clickBuffer = null
let clickLoadPromise = null
let lastMetroBeat = -1

async function ensureClickBuffer () {
  if (clickBuffer) return clickBuffer
  if (clickLoadPromise) return clickLoadPromise
  const graph = ensureGraph()
  if (!graph) return null
  clickLoadPromise = decodeSampleFile(graph.context, publicAssetUrl('click.wav'))
    .then((buffer) => {
      clickBuffer = buffer
      return buffer
    })
    .catch((err) => {
      console.warn('[metronome] failed to load click.wav from Supabase:', err)
      clickLoadPromise = null
      return null
    })
  return clickLoadPromise
}

function tickLocalMetronome (positionBeats) {
  if (!session.metronome || !audioGraph || !clickBuffer) return
  const beat = Math.floor(positionBeats)
  if (beat === lastMetroBeat) return
  lastMetroBeat = beat
  const src = audioGraph.context.createBufferSource()
  src.buffer = clickBuffer
  const dest = audioGraph.master || audioGraph.context.destination
  src.connect(dest)
  try { src.start() } catch (err) { /* already started */ }
}

function ensureGraph () {
  if (audioGraph || typeof AudioContext === 'undefined') return audioGraph
  const context = new AudioContext()
  audioGraph = createAudioGraph(context)
  return audioGraph
}

async function unlockAudio () {
  const graph = ensureGraph()
  if (!graph) return null
  if (graph.context.state === 'suspended') {
    try { await graph.context.resume() } catch (err) { /* autoplay policy */ }
  }
  ensureClickBuffer()
  try {
    await ensureMixerAttached()
    ensureOutputRouting(graph)
    refreshMixerGraph()
    session.tracks.forEach((track) => {
      if (track.source === 'm-orchestra' && track.definitionId) {
        mOrchestraCloud.preloadInstrument(graph, track.definitionId).catch(() => {})
      }
    })
  } catch (err) {
    ensureOutputRouting(graph)
    showToast(err.message || 'Browser audio failed to start')
  }
  return graph
}

let dryMixToast = false
let mixerAttachPromise = null

export async function ensureMixerAttached () {
  if (mixerAttachPromise) return mixerAttachPromise
  mixerAttachPromise = doEnsureMixerAttached()
  try {
    return await mixerAttachPromise
  } finally {
    mixerAttachPromise = null
  }
}

async function doEnsureMixerAttached () {
  const graph = ensureGraph()
  if (!graph) return null
  if (graph.context.state === 'suspended') await graph.context.resume()
  try {
    await attachMixerGraph(graph, session.webMixer, (lane, meters) => {
      session.fxMeters[lane] = meters
      if (meters.cpuMs != null) session.diagnostics.browserCpuMs = meters.cpuMs
      if (lane === 'master' && session.webMixer.master && meters.outPeak != null) {
        session.webMixer.master.peak = meters.outPeak
        session.webMixer.master.clip = meters.outPeak >= 1
      }
      const mixer = session.webMixer
      session.diagnostics.browserPlugins =
        (mixer.remote.inserts.filter((i) => i && i.enabled !== false).length) +
        (mixer.master.inserts.filter((i) => i && i.enabled !== false).length) +
        allTrackInserts(mixer, session.tracks).filter((i) => i && i.enabled !== false).length +
        mixer.buses.reduce((n, b) => n + (b.inserts || []).filter((i) => i && i.enabled !== false).length, 0)
    }, session.tracks, mixerGraphOptions())
    session.diagnostics.browserFxAttached = !!graph.mixerNodes
    session.diagnostics.browserFxError = ''
    dryMixToast = false
    startBrowserMeterLoop()
  } catch (err) {
    console.error('[mixer] browser FX attach failed:', err)
    graph.mixerNodes = null
    session.diagnostics.browserFxAttached = false
    session.diagnostics.browserFxError = err.message || String(err)
    try {
      graph.remoteGain.disconnect()
      graph.samplerGain.disconnect()
      graph.master.disconnect()
    } catch (disconnectErr) { /* already disconnected */ }
    graph.remoteGain.connect(graph.master)
    graph.samplerGain.connect(graph.master)
    graph.master.connect(graph.context.destination)
    ensureOutputRouting(graph)
    if (!dryMixToast) {
      dryMixToast = true
      showToast('Browser FX unavailable — dry mix')
    }
  }
  session.tracks.forEach((track) => {
    if (track.source === 'm-orchestra' && track.definitionId) {
      mOrchestraCloud.preloadInstrument(graph, track.definitionId).catch(() => {})
    }
  })
  return graph
}

async function ensureRemoteNode () {
  const graph = await ensureMixerAttached()
  if (!graph) return null
  if (!graph.remoteNode) {
    await attachRemotePlayer(graph, (status) => {
      if (status && status.type === 'underrun') {
        session.diagnostics.underruns = status.underruns
        session.diagnostics.bufferDepthMs = Math.round((status.depth || 0) / (graph.context.sampleRate / 1000))
      }
    })
  }
  return graph
}

function onRemotePacket (buffer) {
  const packet = parseRemoteAudioPacket(buffer)
  if (!packet || !audioGraph) return
  pushRemotePacket(audioGraph, packet)
  session.diagnostics.underruns = session.diagnostics.underruns || 0

  if (lastAudioSeq && packet.sequence > lastAudioSeq + 1) {
    session.diagnostics.underruns += packet.sequence - lastAudioSeq - 1
  }
  lastAudioSeq = packet.sequence

  if (lastHostMicros) {
    const deltaMs = (packet.hostTimeMicros - lastHostMicros) / 1000
    jitterSamples.push(deltaMs)
    if (jitterSamples.length > 40) jitterSamples.shift()
    const mean = jitterSamples.reduce((a, b) => a + b, 0) / jitterSamples.length
    const variance = jitterSamples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / jitterSamples.length
    session.diagnostics.jitterMs = Math.sqrt(variance)
  }
  lastHostMicros = packet.hostTimeMicros

  let peak = 0
  for (let i = 0; i < packet.samples.length; ++i) {
    const abs = Math.abs(packet.samples[i])
    if (abs > peak) peak = abs
  }

  if (pendingClick && (packet.click || peak > 0.2)) {
    session.diagnostics.audioPathMs = performance.now() - pendingClick.t0
    pendingClick = null
  }
  if (pendingNote && peak > 0.02) {
    session.diagnostics.midiToAudibleMs = performance.now() - pendingNote.t0
    pendingNote = null
  }
}

export async function startRemoteAudio () {
  try {
    await ensureRemoteNode()
    if (!audioUnsub) audioUnsub = onEngineAudio(onRemotePacket)
    await connectEngineAudio()
    const reply = await sendCommand('audio.subscribe')
    if (reply && reply.ok === false) throw new Error(reply.error || 'audio.subscribe failed')
    session.remoteAudioOn = true
    soundingNotes.forEach((voiceKey, key) => {
      releaseWebSampler(voiceKey)
      mOrchestraCloud.noteOff(voiceKey)
    })
    soundingNotes.clear()
    refreshMixerGraph()
    startBrowserMeterLoop()
  } catch (err) {
    session.remoteAudioOn = false
    session.diagnosticsLog = String(err.message || err)
    throw err
  }
}

export function stopRemoteAudio () {
  fire('audio.unsubscribe')
  if (audioUnsub) {
    audioUnsub()
    audioUnsub = null
  }
  session.remoteAudioOn = false
  refreshMixerGraph()
  startBrowserMeterLoop()
}

export async function toggleRemoteAudio () {
  if (session.remoteAudioOn) {
    stopRemoteAudio()
    return
  }
  try {
    await startRemoteAudio()
    showToast('Browser audio on')
  } catch (err) {
    showToast(err.message || 'Remote audio failed')
  }
}

export function toggleDiagnostics () {
  session.diagnosticsVisible = !session.diagnosticsVisible
}

function noteVelocity (note) {
  const value = Number(note && note.velocity)
  if (!Number.isFinite(value) || value <= 0) return 0.7
  return value > 1 ? Math.min(1, value / 127) : value
}

function tickLocalNotes (nowBeats) {
  const next = new Set()
  session.clips.forEach((clip) => {
    if (!clip || clip.midi === false) return
    const track = session.tracks[clip.trackIndex]
    if (!track || track.type === 'master' || !isTrackAudible(clip.trackIndex)) return
    const browserOwned = track.source === 'web-sampler' || isMOrchestraTrack(track)
    if (session.remoteAudioOn && !browserOwned) return
    ;(clip.notes || []).forEach((note) => {
      if (note.muted) return
      expandRepeats(note).forEach((slice) => {
        const start = (clip.startBeat || 0) + (slice.start != null ? slice.start : (slice.startTick || 0) / TICKS_PER_BEAT)
        const duration = slice.duration != null ? slice.duration : ((slice.durationTick || 240) / TICKS_PER_BEAT)
        if (nowBeats < start || nowBeats >= start + duration) return
        const key = (clip.id || 0) + ':' + (note.id || 0) + ':' + (slice.startTick || start) + ':' + slice.pitch
        next.add(key)
        if (!soundingNotes.has(key)) {
          const voiceKey = isMOrchestraTrack(track)
            ? previewMOrchestra(track, slice.pitch, noteVelocity(slice), key)
            : previewWebSampler(track, slice.pitch, noteVelocity(slice), key)
          soundingNotes.set(key, voiceKey)
        }
      })
    })
  })
  Array.from(soundingNotes.entries()).forEach(([key, voiceKey]) => {
    if (next.has(key)) return
    const clipKey = key.split(':')[0]
    const clip = session.clips.find((item) => String(item.id) === clipKey)
    const track = clip ? session.tracks[clip.trackIndex] : null
    releaseWebSampler(voiceKey)
    if (track && isMOrchestraTrack(track)) {
      mOrchestraCloud.cancelPending(voiceKey, track.id)
      mOrchestraCloud.noteOff(voiceKey, track.id)
    } else {
      mOrchestraCloud.noteOff(voiceKey)
    }
    soundingNotes.delete(key)
  })
}

function allLocalNotesOff () {
  soundingNotes.forEach((voiceKey) => {
    releaseWebSampler(voiceKey)
    mOrchestraCloud.noteOff(voiceKey)
  })
  mOrchestraCloud.allNotesOff()
  soundingNotes.clear()
}

function previewMOrchestra (track, pitch, velocity, id) {
  const logicalId = id || ('preview-' + track.id + '-' + pitch)
  ensureMixerAttached().then(async (graph) => {
    if (!graph) return
    await graph.context.resume()
    const engineKey = await mOrchestraCloud.noteOn(graph, track, pitch, velocity, logicalId)
    if (engineKey) refreshMixerGraph()
  }).catch((err) => {
    console.warn('[m-orchestra] preview failed:', err)
  })
  return logicalId
}

function previewWebSampler (track, pitch, velocity, id) {
  const key = id || ('p' + pitch + '-' + Math.random().toString(36).slice(2, 7))
  ensureMixerAttached().then((graph) => {
    if (!graph) return
    graph.context.resume()
    const patch = createWebSamplerInstrument({
      ...(track && track.webSampler),
      name: track && track.name,
      gain: track && track.volume != null ? 0.35 + track.volume * 0.45 : 0.7
    })
    const voice = new WebSamplerVoice(graph.context, graph.samplerGain)
    const buffer = track ? samplerBuffers.get(track.id) : null
    voice.noteOn(pitch, velocity, patch, buffer || null)
    samplerVoices.set(key, voice)
    refreshMixerGraph()
  }).catch((err) => {
    console.warn('[sampler] preview failed:', err)
  })
  return key
}

export async function loadSamplerWav (track, file) {
  if (!track || !file) return
  const graph = ensureGraph()
  if (!graph) return
  await graph.context.resume()
  const buffer = await decodeSampleFile(graph.context, file)
  samplerBuffers.set(track.id, buffer)
  const url = (typeof URL !== 'undefined' && file.name) ? URL.createObjectURL(file) : ''
  loadWebSampler(track, {
    name: 'Web Sampler',
    sampleName: file.name || 'sample.wav',
    sampleUrl: url,
    rootNote: (track.webSampler && track.webSampler.rootNote) || 60
  })
  showToast('Loaded ' + (file.name || 'WAV'))
}

function releaseWebSampler (pitchOrKey) {
  const voice = samplerVoices.get(pitchOrKey)
  if (!voice) return
  voice.noteOff()
  setTimeout(() => {
    voice.dispose()
    samplerVoices.delete(pitchOrKey)
  }, 400)
}

export async function runLatencyMeasure () {
  session.diagnosticsLog = 'Measuring…'
  await startRemoteAudio()

  const rtts = []
  for (let i = 0; i < 8; ++i) {
    const t0 = performance.now()
    const reply = await fire('diagnostics.ping', { tClient: t0 })
    if (reply) rtts.push(performance.now() - t0)
  }
  if (rtts.length) {
    session.diagnostics.controlRttMs = rtts.reduce((a, b) => a + b, 0) / rtts.length
  }

  const metrics = await fire('diagnostics.getMetrics')
  if (metrics) {
    session.diagnostics.cpuPercent = metrics.cpuPercent
    session.diagnostics.audioCpuPercent = metrics.audioCpuPercent
    session.diagnostics.workingSetMb = metrics.workingSetMb
    session.diagnostics.pluginCount = metrics.pluginCount
    if (metrics.limiterNsPerSample != null) {
      session.diagnostics.limiterNsPerSample = metrics.limiterNsPerSample
    }
    if (metrics.mOrchestra) {
      session.diagnostics.mOrchestra = metrics.mOrchestra
    }
    if (metrics.audio) {
      session.diagnostics.renderLatencyMs = metrics.audio.renderLatencyMs
      session.diagnostics.bufferDepthMs = metrics.audio.bufferDepthMs
    }
  }

  pendingClick = { t0: performance.now(), token: Date.now() }
  await fire('diagnostics.click', { token: pendingClick.token })

  const track = session.tracks.find((item) => item.type !== 'master' && item.source === 'remote-vst')
    || session.tracks.find((item) => item.type !== 'master')
  if (track) {
    pendingNote = { t0: performance.now() }
    fire('preview.noteOn', { trackId: track.id, pitch: 60, velocity: 0.9 })
    setTimeout(() => fire('preview.noteOff', { trackId: track.id, pitch: 60 }), 250)
  }

  setTimeout(() => {
    const lines = [
      'Device: ' + (typeof navigator !== 'undefined' && /iPad|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'same-PC/desktop'),
      'Host: ' + (engineLink.host || 'offline'),
      'Control RTT: ' + (session.diagnostics.controlRttMs == null ? 'unmeasured' : session.diagnostics.controlRttMs.toFixed(1) + ' ms'),
      'PC render: ' + (session.diagnostics.renderLatencyMs == null ? 'unmeasured' : Number(session.diagnostics.renderLatencyMs).toFixed(1) + ' ms'),
      'Audio path: ' + (session.diagnostics.audioPathMs == null ? 'unmeasured' : session.diagnostics.audioPathMs.toFixed(1) + ' ms'),
      'MIDI to audible: ' + (session.diagnostics.midiToAudibleMs == null ? 'unmeasured' : session.diagnostics.midiToAudibleMs.toFixed(1) + ' ms'),
      'Jitter: ' + (session.diagnostics.jitterMs == null ? 'unmeasured' : session.diagnostics.jitterMs.toFixed(1) + ' ms'),
      'Underruns: ' + session.diagnostics.underruns,
      'Browser FX CPU (worklet block): ' + (session.diagnostics.browserCpuMs == null ? 'unmeasured' : Number(session.diagnostics.browserCpuMs).toFixed(2) + ' ms'),
      'Browser plugins: ' + session.diagnostics.browserPlugins,
      'Limiter X (native bench): ' + (session.diagnostics.limiterNsPerSample == null ? 'unmeasured' : Number(session.diagnostics.limiterNsPerSample).toFixed(1) + ' ns/smp'),
      'M Orchestra CPU: ' + (session.diagnostics.mOrchestra && session.diagnostics.mOrchestra.cpuPercent != null ? Number(session.diagnostics.mOrchestra.cpuPercent).toFixed(1) + '%' : 'unmeasured'),
      'M Orchestra voices: ' + (session.diagnostics.mOrchestra ? session.diagnostics.mOrchestra.activeVoices : '—'),
      'M Orchestra cache: ' + (session.diagnostics.mOrchestra && session.diagnostics.mOrchestra.cacheMb != null ? Number(session.diagnostics.mOrchestra.cacheMb).toFixed(1) + ' MB' : '—'),
      'Compare A VST-only / B PC mixer / C browser mixer / D mixer+4 plugins.',
      'Limitation: one mixed stereo VST tap — browser FX cannot un-sum BBCSO/Synchron tracks.',
      'Not claimed real-time.'
    ]
    session.diagnosticsLog = lines.join('\n')
  }, 1200)
}

export function persistWebMixer () {
  const opts = mixerGraphOptions()
  if (audioGraph && audioGraph.mixerNodes) {
    syncMixerGraph(audioGraph, session.webMixer, session.tracks, opts)
  }
  ensureMixerAttached().then((graph) => {
    if (graph && graph.mixerNodes) syncMixerGraph(graph, session.webMixer, session.tracks, opts)
  })
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = 0
    fire('mixer.setWebMixer', { webMixer: session.webMixer })
  }, 180)
}

export function getAudioGraph () {
  return audioGraph
}

export function getFxAnalyser (laneKey) {
  return getLaneAnalyser(audioGraph, fxMeterLaneKey(laneKey, session.tracks, mixerGraphOptions()))
}

function peakFromAnalyser (analyser) {
  if (!analyser) return 0
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteTimeDomainData(data)
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] - 128) / 128
    if (v > peak) peak = v
  }
  return peak
}

function fxLanePeak (laneKey) {
  const posted = session.fxMeters[laneKey] || {}
  return posted.outPeak || posted.inPeak || 0
}

let browserMeterRaf = 0

function tickBrowserMeters () {
  browserMeterRaf = 0
  const graph = audioGraph
  const nodes = graph && graph.mixerNodes
  if (!nodes) {
    browserMeterRaf = requestAnimationFrame(tickBrowserMeters)
    return
  }

  const local = !session.remoteAudioOn
  const samplerPeak = Math.max(fxLanePeak('sampler'), peakFromAnalyser(nodes.analyserSampler))
  const remotePeak = Math.max(fxLanePeak('remote'), peakFromAnalyser(nodes.analyserRemote))
  const masterPeak = Math.max(fxLanePeak('master'), peakFromAnalyser(nodes.analyserMaster))

  session.tracks.forEach((track, index) => {
    if (track.type === 'master') {
      if (local || masterPeak > 0) track.meterLevel = masterPeak
      return
    }
    if (local) {
      track.meterLevel = samplerPeak
      return
    }
    if (track.source === 'web-sampler' || isMOrchestraTrack(track)) {
      track.meterLevel = samplerPeak
    } else if (remotePeak > 0) {
      track.meterLevel = remotePeak
    }
  })

  if (graph.mixerNodes) {
    browserMeterRaf = requestAnimationFrame(tickBrowserMeters)
  }
}

function startBrowserMeterLoop () {
  if (browserMeterRaf) return
  if (typeof requestAnimationFrame === 'undefined') return
  browserMeterRaf = requestAnimationFrame(tickBrowserMeters)
}

function stopBrowserMeterLoop () {
  if (browserMeterRaf) {
    cancelAnimationFrame(browserMeterRaf)
    browserMeterRaf = 0
  }
}

export function openPlugin (lane, index) {
  const list = laneInserts(session.webMixer, lane)
  const slot = list[index]
  session.openPlugin = {
    lane: { type: lane.type, id: lane.id },
    laneType: lane.type,
    laneId: lane.type === 'bus' ? (lane.id ?? 'bus_reverb') : lane.id,
    index,
    instanceId: slot ? slot.instanceId : null
  }
  ensureMixerAttached().catch((err) => {
    showToast(err.message || 'Browser FX audio failed to start')
  })
}

export function closePlugin () {
  session.openPlugin = null
}

export function setMixerLane (lane) {
  session.mixerLane = lane
}

function syncTrackInsertMeta (lane) {
  if (!lane || lane.type !== 'track') return
  const track = session.tracks.find((t) => String(t.id) === String(lane.id))
  if (!track) return
  const slots = laneInserts(session.webMixer, lane)
  track.inserts = slots.map((insert) => {
    if (!insert || !insert.pluginId) {
      return { name: '', bypassed: false, pluginId: '', instrumentId: '' }
    }
    const def = plugins[insert.pluginId]
    return {
      name: def ? def.name : insert.pluginId,
      pluginId: insert.pluginId,
      instrumentId: insert.pluginId,
      bypassed: insert.enabled === false
    }
  })
}

export function replaceInsert (lane, index, pluginId) {
  if (!pluginId) return
  const extra = {}
  if (pluginId === 'reverb-x' && lane.type === 'bus') extra.state = { returnOnly: true }
  const list = laneInserts(session.webMixer, lane).slice()
  while (list.length < MIXER_INSERT_SLOTS) list.push(null)
  list[index] = createInsert(pluginId, plugins, extra)
  setLaneInserts(session.webMixer, lane, list)
  syncTrackInsertMeta(lane)
  persistWebMixer()
  openPlugin(lane, index)
  unlockAudio().then(() => ensureMixerAttached()).then((graph) => {
    if (graph && graph.mixerNodes) refreshMixerGraph()
  }).catch((err) => {
    showToast(err.message || 'Browser FX audio failed to start')
  })
}

export function addInsert (lane, pluginId, slotIndex = 0) {
  const extra = {}
  if (pluginId === 'reverb-x' && lane.type === 'bus') extra.state = { returnOnly: true }
  const list = laneInserts(session.webMixer, lane).slice()
  const empty = list.findIndex((slot) => !slot)
  const target = slotIndex >= 0 && slotIndex < MIXER_INSERT_SLOTS && !list[slotIndex]
    ? slotIndex
    : empty
  if (target < 0 || !canAddInsert(list)) {
    showToast('Maximum 5 effects on this channel')
    return
  }
  list[target] = createInsert(pluginId, plugins, extra)
  setLaneInserts(session.webMixer, lane, list)
  syncTrackInsertMeta(lane)
  persistWebMixer()
  openPlugin(lane, target)
  unlockAudio().then(() => ensureMixerAttached()).then((graph) => {
    if (graph && graph.mixerNodes) refreshMixerGraph()
  }).catch((err) => {
    showToast(err.message || 'Browser FX audio failed to start')
  })
}

export function removeInsert (lane, index) {
  const list = laneInserts(session.webMixer, lane).slice()
  if (index >= 0 && index < list.length) list[index] = null
  setLaneInserts(session.webMixer, lane, list)
  syncTrackInsertMeta(lane)
  persistWebMixer()
  if (session.openPlugin && session.openPlugin.index === index) closePlugin()
}

export function loadDemoFxChain () {
  session.webMixer = demoWebMixer()
  setMixerLane({ type: 'remote' })
  persistWebMixer()
  openPlugin({ type: 'remote' }, 0)
  showToast('Demo: Mix EQ → Dynamic → Send A → Reverb · Master Boost')
}

export function reorderInserts (lane, fromIndex, toIndex) {
  reorderLaneInserts(session.webMixer, lane, fromIndex, toIndex)
  syncTrackInsertMeta(lane)
  persistWebMixer()
}

export { listPlugins }
