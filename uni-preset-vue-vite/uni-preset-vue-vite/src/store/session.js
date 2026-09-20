import { computed, reactive, watch } from 'vue'
import {
  connectEngine,
  disconnectEngine,
  engineLink,
  isEngineConnected,
  onEngineEvent,
  onEngineAudio,
  sendCommand,
  connectEngineAudio,
  getStoredEngineHost,
  setStoredEngineHost,
  mixedContentHint
} from '../bridge/engine.js'
import { canAddInsert, dbFromFader, dbToGain, CONTROL_HZ, defaultSends, normalizeSends, defaultTrackMix } from '../model/mixer-model.js'
import { defaultWebMixer, normalizeWebMixer, demoWebMixer, setLaneInserts, laneInserts, allTrackInserts, syncNativeInsertsToWebMixer, nameToPluginId, MIXER_INSERT_SLOTS, fxMeterLaneKey, reorderLaneInserts, trackLaneInserts, isBrowserOwnedTrack } from '../model/web-mixer.js'
import { createDemoProject } from '../model/demo-project.js'
import { parseRemoteAudioPacket, createAudioGraph, attachRemotePlayer, pushRemotePacket } from '../audio/graph.js'
import { attachMixerGraph, syncMixerGraph, getLaneAnalyser, ensureOutputRouting, trackInputNode, routingSnapshot, detachMixerGraph, mixerHasInserts, syncDirectLaneGains, setLaneMix, setMasterMix, setFxMeterDetail } from '../audio/mixer-graph.js'
import { invalidateFxWorklet, hasNativeAudioWorklet } from '../dsp/runtime.js'
import { serializeSession, migrateProject, mergeNativeExport } from '../lib/project-io.js'
import {
  putProject,
  getProject,
  listProjects,
  deleteProject,
  duplicateProject,
  renameProject,
  rememberRecent as rememberRecentEntry,
  readRecent,
  putAsset,
  getAsset,
  hashBlob,
  setActiveProject,
  getActiveProjectId,
  FALLBACK_KEYS
} from '../lib/project-db.js'
import { createWebSamplerInstrument, WebSamplerVoice, decodeSampleFile } from '../audio/web-sampler.js'
import { bounceSessionToWav } from '../audio/bounce.js'
import { publicAssetUrl } from '../lib/supabase.js'
import * as mOrchestraCloud from '../audio/m-orchestra/cloud.js'
import * as orchestraVCloud from '../audio/orchestra-v/cloud.js'
import { createInsert } from '../dsp/plugin.js'
import { plugins, listPlugins } from '../dsp/registry.js'
import { SNAP_OPTIONS as TIMELINE_SNAP, TICKS_PER_BEAT as PPQ, formatMusical, formatTime, interpolateBeats } from '../model/timeline.js'
import { isGroupTrack, isPlayableTrack, buildCollapsedGroupClip, invalidateClipPreview, clearClipPreviewCache } from '../model/playlist-model.js'
import { normalizeNote, engineNotePayload, defaultScore, normalizeMarker, expandRepeats } from '../model/note-model.js'
import { parseMidiBlob } from '../lib/midi-import.js'
import {
  INTERFACE_LITE,
  INTERFACE_PROFESSIONAL,
  readInterfaceMode,
  writeInterfaceMode,
  readLiteHintDismissed,
  writeLiteHintDismissed,
  isLiteMode
} from '../model/ui-mode.js'
import { ensureExpression, laneKey, paintPoint, eraseNear, sampleLane, sampleSustain, controllerIdForCc, addLanePoint, moveLanePoint, deleteLanePoint, addSustainBlock, moveSustainBlock, deleteSustainBlock } from '../model/expression-lane.js'
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
import {
  ORCHESTRA_V_PLUGIN_ID,
  ORCHESTRA_V_DEFAULT_ID,
  isOrchestraVTrack,
  isOrchestraVDefinition,
  orchestraVInstrument,
  orchestraVUsesPedal,
  techniquesFor,
  defaultTechniqueFor,
  defaultControllerValues
} from '../model/orchestra-v-ui.js'

/** Both browser samplers expose the same note/controller surface, so the transport,
 * preview and preload paths only need to know which facade a track belongs to. */
function cloudSamplerFor (track) {
  if (isOrchestraVTrack(track)) return orchestraVCloud
  if (isMOrchestraTrack(track)) return mOrchestraCloud
  return null
}

function isCloudSamplerTrack (track) {
  return !!cloudSamplerFor(track)
}

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
  projectId: '',
  projectName: starterDemo.projectName,
  projectManagerOpen: false,
  audioBlocked: false,
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
  expressionLane: 'expression',
  expressionHeight: 140,
  scaleGuide: true,
  scaleSnap: true,
  scaleKey: 'C',
  scaleName: 'major',
  scaleMenuOpen: false,
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
    routingMode: 'direct',
    routingLanes: [],
    routingWarnings: [],
    routingMuted: false,
    bypassReason: '',
    lanePeaks: {},
    fxAttached: false,
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
  webMixer: starterDemo.webMixer || defaultWebMixer(),
  mixerLane: { type: 'remote' },
  mixerMode: 'compact',
  showSends: false,
  openPlugin: null,
  addInsertLane: null,
  fxMeters: {},
  virtualClip: null,
  lastNoteDurationTicks: PPQ,
  cloudBannerDismissed: false
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
  const id = track.trackId != null ? track.trackId : track.id
  const existing = session.tracks.find((item) => item.id === id) || {}
  return {
    id,
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
    source: track.source || track.instrumentSource || existing.source || 'empty',
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
  const data = migrateProject(project)
  if (data.id) session.projectId = data.id
  session.projectName = data.name || project.name || session.projectName
  if (project.userName) session.userName = project.userName
  session.bpm = data.tempo || project.bpm || session.bpm
  session.timeSigNum = data.timeSigNumerator || project.timeSigNumerator || session.timeSigNum
  session.timeSigDen = data.timeSigDenominator || project.timeSigDenominator || session.timeSigDen
  session.positionBeats = project.positionBeats != null ? project.positionBeats : session.positionBeats
  session.playing = !!project.playing
  session.looping = project.looping != null ? !!project.looping : session.looping
  session.loopStart = project.loopStart != null ? project.loopStart : session.loopStart
  session.loopEnd = project.loopEnd != null ? project.loopEnd : session.loopEnd
  session.metronome = project.metronome != null ? !!project.metronome : session.metronome
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
    session.tracks = data.tracks.map(mapTrack).map((track) => {
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
    session.clips = data.clips.map(mapClip)
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
  if (data.webMixer) {
    applyWebMixer(data.webMixer)
  }
  if (project.pixelsPerBeat) session.pixelsPerBeat = project.pixelsPerBeat
  if (project.trackHeight) session.trackHeight = project.trackHeight
  syncNativeInsertsToWebMixer(session.webMixer, session.tracks)
  refreshMixerGraph()
  maybeStartRemoteAudio()
}

function mixerGraphOptions () {
  return { localPlayback: !session.remoteAudioOn }
}

function refreshMixerGraph (extra = {}) {
  if (audioGraph) {
    syncMixerGraph(audioGraph, session.webMixer, session.tracks, { ...mixerGraphOptions(), ...extra })
    if (!audioGraph.mixerNodes) {
      ensureOutputRouting(audioGraph, session.webMixer, session.tracks, mixerGraphOptions())
    }
  }
  if (!extra.mixOnly) publishRoutingDiagnostics(audioGraph)
}

/**
 * Surface where each strip is processed. Inserts on a track with no reachable
 * audio stem would otherwise look active while doing nothing.
 */
function readableFxError (raw) {
  const text = String(raw || '')
  if (/class statement must have a name/i.test(text) || /must have a name/i.test(text)) {
    return 'FX processor failed to load in this browser build'
  }
  if (/AudioWorklet unavailable/i.test(text)) {
    return 'AudioWorklet unavailable — use HTTPS or localhost, or tap to retry'
  }
  return text
}

function publishRoutingDiagnostics (graph) {
  const snap = routingSnapshot(graph)
  const diag = session.diagnostics
  diag.routingMode = snap.mode
  diag.routingLanes = snap.lanes
  diag.fxAttached = !!snap.fxAttached
  diag.routingMuted = !!snap.muted
  diag.bypassReason = snap.bypassReason || ''
  const peaks = {}
  Object.keys(session.fxMeters || {}).forEach((key) => {
    const meters = session.fxMeters[key] || {}
    peaks[key] = { inPeak: meters.inPeak || 0, outPeak: meters.outPeak || 0 }
  })
  diag.lanePeaks = peaks
  const warnings = []
  if (snap.error) warnings.push('Routing: ' + readableFxError(snap.error))
  if (snap.muted) warnings.push('Mixer muted: inserts are offline')
  const localPlayback = !session.remoteAudioOn
  session.tracks.forEach((track) => {
    if (!track || track.type === 'master' || track.type === 'group') return
    const filled = trackLaneInserts(session.webMixer, track).filter((item) => item && item.enabled !== false)
    if (!filled.length) return
    if (isBrowserOwnedTrack(track, { localPlayback })) return
    if (session.remoteAudioOn) return
    warnings.push((track.name || 'Track ' + track.id) + ': inserts need the PC engine (no browser stem)')
  })
  diag.routingWarnings = warnings
}

/** Where a browser voice for this track must connect. */
export function trackAudioInput (trackId) {
  return trackInputNode(audioGraph, trackId)
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

function incomingProjectName (project) {
  if (!project) return ''
  return String(project.name || project.projectName || '')
}

function shouldKeepWebReTimeOverNative (project) {
  if (session.projectName === 'Re-Time' && incomingProjectName(project) === 'Untitled Orchestra')
    return true

  const webRemote = session.tracks.some((track) => (
    track && track.type === 'midi'
    && (track.source === 'remote-vst' || needsPcEngine(track.definitionId || track.instrumentId))
  ))
  const nativeName = incomingProjectName(project)
  return webRemote && nativeName === 'Untitled Orchestra'
}

let pushingSessionToEngine = false

async function pushSessionProjectToEngine (projectData) {
  if (!isEngineConnected() || !projectData || pushingSessionToEngine) return
  const migrated = migrateProject(projectData)
  pushingSessionToEngine = true
  try {
    await sendCommand('project.import', { json: JSON.stringify(migrated) }, 60000)
  } catch (err) {
    showToast(err.message || 'Engine project import failed')
  } finally {
    pushingSessionToEngine = false
  }
}

function applySession (payload) {
  if (!payload) return
  if (payload.sessionId) engineLink.sessionId = payload.sessionId
  if (payload.schemaVersion) engineLink.schemaVersion = payload.schemaVersion
  const project = payload.project || payload
  if (shouldKeepWebReTimeOverNative(project)) {
    pushSessionProjectToEngine(serializeSession(session)).catch(() => {})
    if (payload.mixer && payload.mixer.webMixer) applyWebMixer(payload.mixer.webMixer)
    ensureMixerAttached().catch(() => {})
    return
  }
  applyProject(project)
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
  if (message.type === 'event.state') {
    if (!shouldKeepWebReTimeOverNative(message.project)) applyProject(message.project)
    return
  }
  if (message.type === 'event.notes') applyNotesState(message.notes)
  if (message.type === 'event.noteDelta') applyNoteDelta(message.delta)
  if (message.type === 'event.clock') applyClock(message)
  if (message.type === 'session.state') applySession(message)
  if (message.ok && message.project) {
    if (!shouldKeepWebReTimeOverNative(message.project)) applyProject(message.project)
  }
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

watch(() => engineLink.connected, (connected) => {
  if (connected) maybeStartRemoteAudio()
  else remoteAudioAttempted = false
})

export function stopEngineBridge () {
  stopRemoteAudio()
  disconnectEngine()
}

export function setBpm (value) {
  session.bpm = Math.min(300, Math.max(20, Math.round(value)))
  fire('transport.setBpm', { bpm: session.bpm })
}

function stampClock () {
  session.clockStamp = {
    positionBeats: session.positionBeats,
    playing: session.playing,
    bpm: session.bpm,
    receivedAt: typeof performance !== 'undefined' ? performance.now() : Date.now()
  }
}

export function setPositionBeats (beats) {
  session.positionBeats = Math.max(0, beats)
  clockBeats = session.positionBeats
  lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
  lastPositionPush = lastTime
  stampClock()
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
  const masterTrack = session.tracks[0]
  const muted = !!(masterTrack && masterTrack.mute) || !!(session.webMixer && session.webMixer.master && session.webMixer.master.mute)
  if (!audioGraph || !setMasterMix(audioGraph, muted ? 0 : dbToGain(dbFromFader(session.masterGain)))) {
    refreshMixerGraph()
  }
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
    const muted = !!track.mute || !!(session.webMixer.master && session.webMixer.master.mute)
    if (!audioGraph || !setMasterMix(audioGraph, muted ? 0 : dbToGain(dbFromFader(value)))) {
      refreshMixerGraph()
    }
    return
  }
  const payload = { trackId: track.id, parameter, value }
  if (parameter === 'volume') {
    payload.volumeDb = dbFromFader(value)
    track.volumeDb = payload.volumeDb
  }
  syncTrackMixLane(track)
  queueMixCommand('track.setParameter', payload)
  if (parameter === 'mute' || parameter === 'solo') {
    flushTrackMix()
    refreshMixerGraph({ mixOnly: true })
    return
  }
  if (parameter === 'volume' || parameter === 'pan') {
    if (!audioGraph || !setLaneMix(audioGraph, track, session.tracks)) {
      refreshMixerGraph({ mixOnly: true })
    }
  }
}

export function setPixelsPerBeat (ppb) {
  session.pixelsPerBeat = Math.min(280, Math.max(8, ppb))
}

let rafId = 0
let lastTime = 0

/*  The transport used to advance session.positionBeats every frame, which
    invalidated every component reading the store 60 times a second. The frame
    accurate value now lives here; the store only gets it at readout rate, and
    canvases interpolate from session.clockStamp instead.
*/
let clockBeats = 0
let lastPositionPush = 0
const POSITION_PUSH_MS = 1000 / 15

function publishClockBeats (now) {
  lastPositionPush = now
  session.positionBeats = clockBeats
}

function loop (now) {
  if (!session.playing) return
  if (typeof document !== 'undefined' && document.hidden) {
    rafId = 0
    return
  }
  const dt = Math.min(0.1, (now - lastTime) / 1000)
  lastTime = now
  const remoteClock = isEngineConnected() && session.remoteAudioOn
  if (!remoteClock) {
    clockBeats += dt * session.bpm / 60
    if (session.looping && clockBeats >= session.loopEnd) {
      const length = Math.max(0.25, session.loopEnd - session.loopStart)
      clockBeats = session.loopStart + ((clockBeats - session.loopStart) % length)
      publishClockBeats(now)
      stampClock()
      allLocalNotesOff()
    } else if (now - lastPositionPush >= POSITION_PUSH_MS) {
      publishClockBeats(now)
    }
    tickLocalMetronome(clockBeats)
  } else {
    clockBeats = session.positionBeats
  }
  tickLocalNotes(clockBeats)
  tickExpressionPlayback(now)
  rafId = requestAnimationFrame(loop)
}

/** Copy the frame clock back into the store before anything reads the position. */
function flushLocalClock () {
  if (session.playing && !(isEngineConnected() && session.remoteAudioOn)) {
    session.positionBeats = Math.max(0, clockBeats)
  }
}

function stopLocalClock () {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

/*  Warming every M Orchestra track on the page decoded one sample per
    articulation per track before a note had been played. Only the selected
    track is warmed now; play() prefetches the upcoming window per note.
*/
function preloadSelectedOrchestra (graph) {
  if (!graph) return
  const track = session.tracks[session.selectedTrack]
  if (!track || !track.definitionId) return
  const cloud = cloudSamplerFor(track)
  if (cloud) cloud.preloadInstrument(graph, track.definitionId).catch(() => {})
}

async function prefetchOrchestraWindow (graph, fromBeat, windowBeats = 2) {
  if (!graph) return
  const jobs = new Map()
  session.clips.forEach((clip) => {
    if (!clip || clip.midi === false) return
    const track = session.tracks[clip.trackIndex]
    if (!track || !isCloudSamplerTrack(track)) return
    const pitches = jobs.get(track) || []
    ;(clip.notes || []).forEach((note) => {
      if (!note || note.muted) return
      expandRepeats(note).forEach((slice) => {
        const start = (clip.startBeat || 0) + (slice.start != null ? slice.start : (slice.startTick || 0) / TICKS_PER_BEAT)
        if (start >= fromBeat - 0.05 && start < fromBeat + windowBeats) pitches.push(slice.pitch)
      })
    })
    if (pitches.length) jobs.set(track, pitches)
  })
  await Promise.all([...jobs].map(([track, pitches]) => (
    cloudSamplerFor(track).preloadNotes(graph, track, pitches).catch(() => {})
  )))
}

export async function play () {
  if (session.playing) return
  session.playing = true
  const graph = await unlockAudioForUser()
  if (graph) {
    await Promise.race([
      prefetchOrchestraWindow(graph, session.positionBeats),
      new Promise((resolve) => setTimeout(resolve, 120))
    ])
  }
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
  clockBeats = session.positionBeats
  lastPositionPush = lastTime
  session.clockStamp = {
    positionBeats: session.positionBeats,
    playing: true,
    bpm: session.bpm,
    receivedAt: lastTime
  }
  if (!rafId) rafId = requestAnimationFrame(loop)
}

export function pause () {
  flushLocalClock()
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
  maybeStopBrowserMeters()
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
  clockBeats = session.positionBeats
  lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
  lastPositionPush = lastTime
  stampClock()
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
  openPluginPicker(trackIndex)
}

export function openNewTrackPicker () {
  session.instrumentPickerMode = 'new-track'
  session.instrumentPickerTrack = -2
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
  if (isCloudSamplerTrack(track)) return true
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
  if (isOrchestraVTrack(track)) session.editorTab = 'orchestra-v'
  else if (isMOrchestraTrack(track)) session.editorTab = 'm-orchestra'
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
    if (!isEngineConnected()) {
      // Leaving the track empty was a dead end in the browser, so fall back to
      // the cloud library and say why.
      showToast('Orchestra Sampler needs the PC engine — loaded M Orchestra instead')
      loadCloudOrchestra(track, M_ORCHESTRA_DEFAULT_ID)
      closeInstrumentPicker()
      if (index < 0) return
      session.selectedTrack = index
      if (isLite()) openLiteSheet({ kind: 'track', tab: 'sampler', trackIndex: index })
      return
    }
    loadInstrument(track, defaultOrchestraSamplerPatch())
    closeInstrumentPicker()
    if (index < 0) return
    session.selectedTrack = index
    if (isLite()) {
      openLiteSheet({ kind: 'track', tab: 'sampler', trackIndex: index })
      return
    }
    session.editorVisible = true
    session.workspaceView = 'sampler'
    session.editorTab = 'sampler'
    return
  }
  if (pluginId === ORCHESTRA_V_PLUGIN_ID) {
    loadOrchestraV(track, ORCHESTRA_V_DEFAULT_ID)
  } else if (pluginId === M_ORCHESTRA_PLUGIN_ID) {
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
  if (pluginId === ORCHESTRA_V_PLUGIN_ID) session.editorTab = 'orchestra-v'
  else if (pluginId === M_ORCHESTRA_PLUGIN_ID) session.editorTab = 'm-orchestra'
  else if (pluginId === TEST_SYNTH_PLUGIN_ID) session.editorTab = 'info'
  else session.editorTab = 'sampler'
}

export function listInsertablePlugins () {
  return insertablePlugins({ includeWebSampler: true, engineConnected: isEngineConnected() })
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
  const created = session.tracks[session.tracks.length - 1]
  // Offline, Test Synth is the least interesting thing the browser can do, so
  // new instrument tracks start on the cloud library instead.
  if (type === 'midi') loadCloudOrchestra(created, M_ORCHESTRA_DEFAULT_ID)
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
  session.projectId = ''
  session.projectName = 'New Project'
  session.selectedTrack = 0
  session.selectedClip = -1
  session.markers = []
  session.selectedClipIds = []
  setActiveProject('').catch(() => {})
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
  const demo = migrateProject(createDemoProject())
  if (isEngineConnected()) {
    await pushSessionProjectToEngine(demo)
  }
  applyProject(demo)
  persistWebMixer()
  session.selectedTrack = 1
  session.selectedClip = session.clips.length ? 0 : -1
  session.positionBeats = 0
  session.unsaved = false
  maybeStartRemoteAudio()
  if (!isEngineConnected()) {
    showToast('BBCSO / Synchron need the DawWeb engine on the PC')
  }
}

export function isSupportedFile (name = '') {
  const lower = name.toLowerCase()
  return SUPPORT_EXTS.some((ext) => lower.endsWith(ext))
}

export async function addClipFromFile (file, trackIndex, startBeat) {
  const name = file && file.name ? file.name.replace(/\.[^.]+$/, '') : 'Clip'
  const midi = /\.mid(i)?$/i.test(file && file.name ? file.name : '')
  let parsed = null
  if (midi) {
    if (!file || typeof file.arrayBuffer !== 'function') {
      showToast('Invalid MIDI file')
      return
    }
    try {
      parsed = await parseMidiBlob(file)
    } catch (err) {
      console.warn('MIDI import failed', err)
      showToast('MIDI parse failed: ' + (err.message || 'invalid file'))
      return
    }
    if (!parsed.notes.length) {
      showToast('No notes found in MIDI file')
      return
    }
  }
  const lengthBeats = parsed && parsed.notes.length
    ? Math.max(1, Math.ceil(parsed.lengthBeats * 4) / 4)
    : (midi ? 8 : 4)

  let track = session.tracks[trackIndex]
  let trackId = track && track.id
  const needsNew = trackIndex <= 0 || !track || track.type === 'master' || track.type === 'group'
    || (midi && track.type !== 'midi')

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

  const start = snapBeat(startBeat)

  if (isEngineConnected()) {
    const reply = await fire('clip.create', {
      trackId,
      trackIndex,
      start,
      length: lengthBeats,
      name,
      sketch: false
    })
    if (parsed && parsed.notes.length && reply && reply.clipId) {
      await fire('notes.createBatch', {
        clipId: reply.clipId,
        notes: parsed.notes.map((item) => engineNotePayload(normalizeNote(item)))
      })
    }
    return
  }

  const clip = {
    id: nextId(session.clips),
    trackIndex,
    startBeat: start,
    lengthBeats,
    name,
    colour: session.tracks[trackIndex].colour,
    midi,
    notes: []
  }
  session.clips.push(clip)
  if (parsed && parsed.notes.length) createNotes(clip, parsed.notes)
  markDirty()
  const clipIndex = session.clips.indexOf(clip)
  if (clipIndex >= 0) selectClip(clipIndex)
}

function importTargetTrackIndex () {
  const selected = session.tracks[session.selectedTrack]
  if (selected && selected.type === 'midi') return session.selectedTrack
  const firstMidi = session.tracks.findIndex((track, index) => index > 0 && track.type === 'midi')
  return firstMidi > 0 ? firstMidi : Math.max(1, session.selectedTrack || 1)
}

/** Open file picker to import .mid clips at the playhead. */
export function openMidiFilePicker () {
  if (typeof document === 'undefined') return Promise.resolve(0)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mid,.midi,audio/midi,audio/x-midi'
    input.multiple = true
    input.onchange = async () => {
      const files = input.files ? Array.from(input.files) : []
      const trackIndex = importTargetTrackIndex()
      const beat = snapBeat(session.positionBeats)
      let imported = 0
      for (const file of files) {
        if (!/\.mid(i)?$/i.test(file.name || '')) continue
        try {
          await addClipFromFile(file, trackIndex, beat)
          imported += 1
        } catch (err) {
          console.warn('MIDI import failed', err)
        }
      }
      if (imported) showToast('Imported ' + imported + ' MIDI clip' + (imported > 1 ? 's' : ''))
      else if (files.length) showToast('Could not import MIDI file')
      resolve(imported)
    }
    input.click()
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
    startBrowserMeterLoop()
    syncFxMeterDetail()
  } else {
    maybeStopBrowserMeters()
    syncFxMeterDetail()
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
  const connected = isEngineConnected()
  return catalogueByCategory()
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const id = String(item.id || '')
        const plugin = String(item.sourcePlugin || '')
        return id !== WEB_SAMPLER_PLUGIN_ID
          && id !== TEST_SYNTH_PLUGIN_ID
          && id !== ORCHESTRA_V_PLUGIN_ID
          && plugin !== M_ORCHESTRA_PLUGIN_ID
          && plugin !== ORCHESTRA_V_PLUGIN_ID
          && plugin !== TEST_SYNTH_PLUGIN_ID
          && !id.startsWith('m_orch_')
          && !isOrchestraVDefinition(id)
      }).map((item) => {
        const id = String(item.id || '')
        const plugin = String(item.sourcePlugin || '')
        const vst = needsPcEngine(id) || /bbcso|synchron|orchestra sampler/i.test(plugin + ' ' + (item.displayName || ''))
        if (!vst) return { ...item, requiresEngine: false }
        return {
          ...item,
          available: connected,
          requiresEngine: true,
          sourcePlugin: connected ? (item.sourcePlugin || '') : '需要电脑上的 DawWeb 引擎'
        }
      })
    }))
    .filter((group) => group.items.length && group.category !== 'Browser' && group.category !== 'M Orchestra' && group.category !== 'Internal')
}

export function needsPcEngine (definitionId) {
  if (!definitionId) return false
  if (definitionId === 'web_sampler') return false
  if (String(definitionId).startsWith('m_orch_') || definitionId === M_ORCHESTRA_PLUGIN_ID) return false
  if (isOrchestraVDefinition(definitionId) || definitionId === ORCHESTRA_V_PLUGIN_ID) return false
  return true
}

function trackWantsRemoteVst (track) {
  if (!track || track.type === 'master' || track.type === 'group') return false
  if (track.source === 'web-sampler' || isCloudSamplerTrack(track)) return false
  return track.source === 'remote-vst' || needsPcEngine(track.definitionId)
}

function defaultOrchestraSamplerPatch () {
  const found = (session.catalogue.instruments || []).find((item) => {
    const id = String(item.id || '')
    return id && needsPcEngine(id)
  })
  return (found && found.id) || 'bbcso_violin_1'
}

let remoteAudioAttempted = false

function maybeStartRemoteAudio () {
  if (!isEngineConnected()) {
    remoteAudioAttempted = false
    return
  }
  if (session.remoteAudioOn || remoteAudioAttempted) return
  if (!session.tracks.some(trackWantsRemoteVst)) return
  remoteAudioAttempted = true
  startRemoteAudio().catch((err) => {
    remoteAudioAttempted = false
    showToast(err.message || mixedContentHint() || 'Remote audio failed')
  })
}

// Synchron Player loads are serialized on the engine side and can take a few
// seconds each, so ignore repeat taps on a track that is still initializing.
const engineLoadsInFlight = new Set()

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
  if (isOrchestraVDefinition(definitionId) || definitionId === ORCHESTRA_V_PLUGIN_ID) {
    loadOrchestraV(track, definitionId === ORCHESTRA_V_PLUGIN_ID ? ORCHESTRA_V_DEFAULT_ID : definitionId)
    return
  }
  if (!isEngineConnected()) {
    showToast('BBCSO / Synchron need the DawWeb engine on the PC')
    track.source = 'remote-vst'
    track.definitionId = definitionId
    track.loadMessage = 'Requires PC engine'
    track.instrumentLoadMessage = 'Requires PC engine'
    return
  }
  if (engineLoadsInFlight.has(track.id)) {
    showToast('Still initializing on the PC — one instrument at a time')
    return
  }
  track.source = 'remote-vst'
  track.definitionId = definitionId
  track.loadState = 'loading'
  track.instrumentLoadState = 'loading'
  const waitMessage = needsPcEngine(definitionId)
    ? 'Initializing on PC — waiting for the plugin window'
    : 'Initializing...'
  track.loadMessage = waitMessage
  track.instrumentLoadMessage = waitMessage
  engineLoadsInFlight.add(track.id)
  const settle = () => { engineLoadsInFlight.delete(track.id) }
  fire('instrument.load', { trackId: track.id, definitionId }).then((reply) => {
    settle()
    if (!reply) {
      showToast('Instrument load failed — is the PC engine connected?')
      return
    }
    if (reply.status) {
      track.loadState = reply.status
      track.instrumentLoadState = reply.status
    }
    if (reply.message) {
      track.loadMessage = reply.message
      track.instrumentLoadMessage = reply.message
    }
    startRemoteAudio().catch((err) => {
      showToast(err.message || 'Remote audio failed after instrument load')
    })
  }, (err) => {
    settle()
    showToast((err && err.message) || 'Instrument load failed')
  })
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

export function loadOrchestraV (track, definitionId) {
  if (!track || track.type === 'master') return
  const id = definitionId || ORCHESTRA_V_DEFAULT_ID
  const item = orchestraVInstrument(id)
  if (item && !item.available) {
    showToast((item.name || 'That instrument') + ' has no samples in the cloud library yet')
    return
  }
  track.source = 'orchestra-v'
  track.definitionId = id
  track.instrument = (item && item.name) || 'Orchestra V'
  // Keep the current technique when the new instrument can play it; a flute has no
  // pizzicato, so switching from the violins must not leave the track silent.
  const keep = techniquesFor(id).find((entry) => entry.id === track.techniqueId && entry.available)
  track.techniqueId = keep ? keep.id : defaultTechniqueFor(id)
  track.controllerValues = { ...defaultControllerValues(), ...(track.controllerValues || {}) }
  // Only instruments that damp on pedal release get the sustain lane in the piano roll.
  track.pedal = orchestraVUsesPedal(id) ? { mapped: true } : null
  track.loadState = 'Ready'
  track.loadMessage = 'Orchestra V'
  track.instrumentLoadState = 'ready'
  track.instrumentLoadMessage = 'SFZ region map'
  orchestraVCloud.loadInstrument(id).catch((err) => {
    console.warn('[orchestra-v] compile failed', err)
  })
  unlockAudio().then((graph) => {
    if (!graph) return
    return orchestraVCloud.preloadInstrument(graph, id)
  }).catch((err) => {
    console.warn('[orchestra-v] preload failed', err)
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
  if (isCloudSamplerTrack(track)) return
  fire('instrument.setTechnique', { trackId: track.id, techniqueId })
}

export function setController (track, controllerId, value) {
  if (!track) return
  if (!track.controllerValues) track.controllerValues = {}
  track.controllerValues[controllerId] = value
  const cloud = cloudSamplerFor(track)
  if (cloud) {
    cloud.applyControllers(track)
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
    if (isCloudSamplerTrack(track)) {
      previewCloudSampler(track, pitch, velocity)
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
  const cloud = cloudSamplerFor(track)
  if (cloud) {
    const previewId = 'preview-' + track.id + '-' + pitch
    cloud.cancelPending(previewId, track.id)
    cloud.noteOff(previewId, track.id)
    maybeStopBrowserMeters()
    return
  }
  if (track.source === 'web-sampler') {
    releaseWebSampler(pitch)
    maybeStopBrowserMeters()
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
      || session.editorTab === 'orchestra-v'
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
  if (cc === 1 || cc === 11) {
    session.expressionCc = cc
    session.expressionLane = cc === 11 ? 'expression' : 'dynamics'
  }
}

export function setExpressionLane (lane) {
  session.expressionLane = lane || 'expression'
  session.expressionOpen = true
  if (lane === 'expression') session.expressionCc = 11
  else if (lane === 'dynamics') session.expressionCc = 1
}

export function setExpressionHeight (height) {
  session.expressionHeight = Math.min(280, Math.max(72, Math.round(height)))
}

export function toggleScaleSnap () {
  session.scaleSnap = !session.scaleSnap
  session.scaleGuide = true
}

export function setScaleKeyName (key, name) {
  if (key) session.scaleKey = key
  if (name) session.scaleName = name
  session.score.key = session.scaleKey
  session.score.scale = session.scaleName
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

export function addClipExpressionPoint (clip, cc, t, v) {
  if (!clip) return
  const expr = ensureExpression(clip)
  expr[laneKey(cc)] = addLanePoint(expr[laneKey(cc)], Math.max(0, t), v)
  markDirty()
}

export function moveClipExpressionPoint (clip, cc, index, t, v) {
  if (!clip) return
  const expr = ensureExpression(clip)
  expr[laneKey(cc)] = moveLanePoint(expr[laneKey(cc)], index, Math.max(0, t), v)
  markDirty()
}

export function deleteClipExpressionPoint (clip, cc, index) {
  if (!clip) return
  const expr = ensureExpression(clip)
  expr[laneKey(cc)] = deleteLanePoint(expr[laneKey(cc)], index)
  markDirty()
}

export function addClipSustain (clip, startTick, endTick) {
  if (!clip) return
  const expr = ensureExpression(clip)
  expr.cc64 = addSustainBlock(expr.cc64, startTick, endTick)
  markDirty()
}

export function moveClipSustain (clip, index, startTick, endTick) {
  if (!clip) return
  const expr = ensureExpression(clip)
  expr.cc64 = moveSustainBlock(expr.cc64, index, startTick, endTick)
  markDirty()
}

export function deleteClipSustain (clip, index) {
  if (!clip) return
  const expr = ensureExpression(clip)
  expr.cc64 = deleteSustainBlock(expr.cc64, index)
  markDirty()
}

export function toggleInsertEnabled (lane, index) {
  const list = laneInserts(session.webMixer, lane).slice()
  const insert = list[index]
  if (!insert) return
  insert.enabled = insert.enabled === false
  setLaneInserts(session.webMixer, lane, list)
  syncTrackInsertMeta(lane)
  persistWebMixer()
}

let expressionRunning = false
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
    if (expr.cc64 && expr.cc64.length) {
      const value = sampleSustain(expr.cc64, t) / 127
      const key = track.id + ':pedal'
      const prev = lastExpressionSent.get(key)
      if (prev == null || Math.abs(prev - value) >= 0.02) {
        lastExpressionSent.set(key, value)
        setController(track, 'pedal', value)
      }
    }
  })
}

/*  Driven from the transport loop rather than its own requestAnimationFrame:
    two independent 60 Hz loops walking every clip was the second biggest cost
    during playback after the reactive playhead.
*/
function tickExpressionPlayback (now) {
  if (!expressionRunning || !session.playing) return
  if (!lastExpressionAt || now - lastExpressionAt >= 50) {
    lastExpressionAt = now
    applyExpressionAtPlayhead(now)
  }
}

function startExpressionPlayback () {
  lastExpressionSent.clear()
  lastExpressionAt = 0
  expressionRunning = true
}

function stopExpressionPlayback () {
  expressionRunning = false
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
      maybeStopBrowserMeters()
      syncFxMeterDetail()
      return
    }
    session.workspaceView = 'mixer'
    session.mixerVisible = true
    unlockAudio().catch(() => {})
    ensureMixerAttached().catch((err) => {
      showToast(err.message || 'Browser FX audio failed to start')
    })
    startBrowserMeterLoop()
    syncFxMeterDetail()
    return
  }
  session.workspaceView = 'arrangement'
  closeEditor()
  if (typeof window !== 'undefined' && window.innerWidth < 720) {
    session.mixerVisible = false
    maybeStopBrowserMeters()
    syncFxMeterDetail()
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

export function assignTrackToGroup (trackId, groupId) {
  const track = session.tracks.find((item) => item.id === trackId)
  const group = session.tracks.find((item) => item.id === groupId)
  if (!track || !group || track.type === 'master' || !isGroupTrack(group)) return
  if (track.id === group.id) return
  beginEdit('Assign to group')
  track.parentId = group.id
  markDirty()
  endEdit()
}

export function ungroupTrack (track) {
  if (!track || !track.parentId) return
  beginEdit('Ungroup track')
  track.parentId = 0
  markDirty()
  endEdit()
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
  if (state === 'error') return engineLink.lastError || 'Error'
  if (mixedContentHint()) return 'Offline — open DawWeb’s LAN HTTP page, or enter a Cloudflare Tunnel hostname'
  return engineLink.lastError || 'Offline'
}

// Cloud mode keeps the same DAW but re-skins it, rather than desaturating
// everything, so browser-only work still looks like a first-class mode.
export function isCloudMode () {
  return !isEngineConnected()
}

export function engineModeClass () {
  return isEngineConnected() ? 'daw-local' : 'daw-cloud'
}

export function cloudBannerVisible () {
  return isCloudMode() && !session.cloudBannerDismissed
}

export function dismissCloudBanner () {
  session.cloudBannerDismissed = true
}

export function engineHostValue () {
  return getStoredEngineHost()
}

export function setEngineHost (value) {
  setStoredEngineHost(value)
  disconnectEngine()
  return connectEngine()
}

async function autosaveProject () {
  try {
    await saveCurrentProject()
  } catch (err) {
    session.saveStatus = ''
  }
}

export { isGroupTrack, isPlayableTrack }

function loadRecentProjects () {
  session.recentProjects = readRecent()
}

export function rememberRecentProject () {
  const entry = {
    id: session.projectId || '',
    name: session.projectName || 'Untitled',
    at: Date.now()
  }
  session.recentProjects = rememberRecentEntry(entry)
}

export function restoreAutosave () {
  if (typeof localStorage === 'undefined') {
    showToast('No autosave')
    return
  }
  const json = localStorage.getItem(FALLBACK_KEYS.LS_AUTOSAVE)
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
  const data = serializeSession(session)
  session.projectId = data.id
  return data
}

async function persistSamplerAssets (project) {
  for (const track of session.tracks || []) {
    if (!track || track.source !== 'web-sampler' || !track.webSampler) continue
    const sampler = track.webSampler
    const url = sampler.sampleUrl
    if (!url || !(url.startsWith('blob:') || url.startsWith('data:'))) continue
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const hash = await hashBlob(blob)
      await putAsset(hash, blob, { name: sampler.sampleName || 'sample', bytes: blob.size })
      sampler.assetHash = hash
      const dest = (project.tracks || []).find((item) => String(item.id) === String(track.id))
      if (dest && dest.webSampler) {
        dest.webSampler.assetHash = hash
        dest.webSampler.sampleUrl = ''
      }
    } catch (err) {
      console.warn('[project] sampler asset persist failed', err)
    }
  }
}

async function restoreSamplerAssets (project) {
  for (const track of session.tracks || []) {
    const hash = track.webSampler && track.webSampler.assetHash
    if (!hash) continue
    const asset = await getAsset(hash)
    if (!asset || !asset.blob) continue
    try {
      const url = URL.createObjectURL(asset.blob)
      track.webSampler.sampleUrl = url
      const graph = ensureGraph()
      if (graph) {
        const buffer = await decodeSampleFile(graph.context, asset.blob)
        samplerBuffers.set(track.id, buffer)
      }
    } catch (err) {
      console.warn('[project] sampler asset restore failed', err)
    }
  }
}

async function buildSavePayload () {
  let data = serializeProject()
  if (isEngineConnected()) {
    const reply = await fire('project.export')
    if (reply && reply.json) data = mergeNativeExport(data, reply.json)
  }
  await persistSamplerAssets(data)
  return serializeSession({ ...session, projectId: data.id, webMixer: data.webMixer, tracks: data.tracks })
}

function markSaved () {
  session.unsaved = false
  session.saveStatus = 'Saved'
  rememberRecentProject()
  setActiveProject(session.projectId).catch(() => {})
  setTimeout(() => {
    if (session.saveStatus === 'Saved') session.saveStatus = ''
  }, 1400)
}

export async function saveCurrentProject () {
  session.saveStatus = 'Saving…'
  try {
    const data = await buildSavePayload()
    const saved = await putProject(data)
    session.projectId = saved.id
    markSaved()
    showToast('Project saved')
    return saved
  } catch (err) {
    session.saveStatus = ''
    showToast(err.message || 'Save failed')
    return null
  }
}

export async function saveProjectAs (name) {
  const nextName = (name || '').trim()
  if (nextName) session.projectName = nextName
  session.projectId = ''
  return saveCurrentProject()
}

export async function saveProjectLocal () {
  return saveCurrentProject()
}

export async function shareProjectFile () {
  session.saveStatus = 'Saving…'
  try {
    const data = await buildSavePayload()
    downloadText((session.projectName || 'project') + '.dawweb', JSON.stringify(data, null, 2))
    markSaved()
    showToast('Project file downloaded')
  } catch (err) {
    session.saveStatus = ''
    showToast(err.message || 'Share failed')
  }
}

export async function exportProjectWav () {
  session.saveStatus = 'Exporting…'
  showToast('Bouncing WAV…')
  try {
    await bounceSessionToWav(session, { samplerBuffers })
    session.saveStatus = ''
    showToast('WAV exported')
  } catch (err) {
    session.saveStatus = ''
    showToast(err.message || 'Export failed')
  }
}

export async function exportProject () {
  if (isLite()) return exportProjectWav()
  return shareProjectFile()
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
  const migrated = migrateProject(data)
  if (isEngineConnected()) {
    await fire('project.import', { json: JSON.stringify(migrated) })
  }
  applyProject(migrated)
  await restoreSamplerAssets(migrated)
  session.unsaved = false
  rememberRecentProject()
  setActiveProject(session.projectId).catch(() => {})
  showToast('Project loaded')
}

export async function openStoredProject (id) {
  const row = await getProject(id)
  if (!row) {
    showToast('Project not found')
    return
  }
  await importProjectJson(row)
}

export async function listStoredProjects () {
  return listProjects()
}

export async function deleteStoredProject (id) {
  await deleteProject(id)
  session.recentProjects = readRecent()
}

export async function duplicateStoredProject (id) {
  const copy = await duplicateProject(id)
  session.recentProjects = readRecent()
  return copy
}

export async function renameStoredProject (id, name) {
  const row = await renameProject(id, name)
  if (row && row.id === session.projectId) session.projectName = row.name
  session.recentProjects = readRecent()
  return row
}

export function openProjectManager () {
  session.projectManagerOpen = true
  session.openMenu = ''
}

export const openProjects = openProjectManager

export function closeProjectManager () {
  session.projectManagerOpen = false
}

getActiveProjectId().then((id) => {
  if (id && !session.projectId) session.projectId = id
}).catch(() => {})

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

/** Dedicated click bus. Default bypasses master FX; set graph.clickThroughMaster
 *  to route the click through the master chain on purpose. */
function clickBus (graph) {
  if (!graph) return null
  if (!graph.clickBus) {
    const bus = graph.context.createGain()
    bus.gain.value = 0.9
    bus.connect(graph.clickThroughMaster ? graph.master : graph.context.destination)
    graph.clickBus = bus
  }
  return graph.clickBus
}

function tickLocalMetronome (positionBeats) {
  if (!session.metronome || !audioGraph || !clickBuffer) return
  const beat = Math.floor(positionBeats)
  if (beat === lastMetroBeat) return
  lastMetroBeat = beat
  const src = audioGraph.context.createBufferSource()
  src.buffer = clickBuffer
  const dest = clickBus(audioGraph) || audioGraph.context.destination
  src.connect(dest)
  try { src.start() } catch (err) { /* already started */ }
}

function audioContextCtor () {
  if (typeof AudioContext !== 'undefined') return AudioContext
  if (typeof webkitAudioContext !== 'undefined') return webkitAudioContext
  return null
}

function ensureGraph () {
  if (audioGraph) return audioGraph
  const Ctor = audioContextCtor()
  if (!Ctor) return audioGraph
  const context = new Ctor()
  audioGraph = createAudioGraph(context)
  return audioGraph
}

export async function rebuildAudioGraph () {
  const old = audioGraph
  if (old) {
    detachMixerGraph(old)
    try { await old.context.close() } catch (err) { /* already closed */ }
  }
  audioGraph = null
  mixerAttachPromise = null
  clickBuffer = null
  clickLoadPromise = null
  lastMetroBeat = -1
  return unlockAudio()
}

export function audioContextState () {
  return audioGraph && audioGraph.context ? audioGraph.context.state : ''
}

function recreateGraphInsideGesture () {
  const old = audioGraph
  if (old) {
    detachMixerGraph(old)
    try { old.context.close() } catch (err) { /* already closed */ }
  }
  audioGraph = null
  mixerAttachPromise = null
  clickBuffer = null
  clickLoadPromise = null
  lastMetroBeat = -1
  return ensureGraph()
}

export async function unlockAudioForUser () {
  let graph = ensureGraph()
  if (!graph) return null
  try {
    if (graph.context.state === 'suspended' || graph.context.state === 'interrupted') {
      await graph.context.resume()
    }
    // iOS often omits audioWorklet until AudioContext is created in a gesture.
    if (!hasNativeAudioWorklet(graph.context)) {
      graph = recreateGraphInsideGesture()
      if (graph && (graph.context.state === 'suspended' || graph.context.state === 'interrupted')) {
        await graph.context.resume()
      }
    }
    session.audioBlocked = !graph || graph.context.state !== 'running'
  } catch (err) {
    session.audioBlocked = true
    showToast('Tap again to enable sound')
  }
  return unlockAudio()
}

if (typeof import.meta !== 'undefined' && import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (audioGraph) {
      detachMixerGraph(audioGraph)
      audioGraph.context.close().catch(() => {})
      audioGraph = null
    }
  })
}

async function unlockAudio () {
  const graph = ensureGraph()
  if (!graph) return null
  if (graph.context.state === 'suspended' || graph.context.state === 'interrupted') {
    try { await graph.context.resume() } catch (err) { /* autoplay policy */ }
  }
  session.audioBlocked = graph.context.state !== 'running'
  ensureClickBuffer()
  try {
    await ensureMixerAttached()
    ensureOutputRouting(graph, session.webMixer, session.tracks, mixerGraphOptions())
    refreshMixerGraph()
    preloadSelectedOrchestra(graph)
  } catch (err) {
    ensureOutputRouting(graph, session.webMixer)
    showToast(err.message || 'Browser audio failed to start')
  }
  return graph
}

let dryMixToast = false
let mixerAttachPromise = null
let fxGestureArmed = false

function armFxAttachOnGesture () {
  if (typeof window === 'undefined' || fxGestureArmed) return
  fxGestureArmed = true
  const once = () => {
    window.removeEventListener('pointerdown', once, true)
    window.removeEventListener('keydown', once, true)
    fxGestureArmed = false
    unlockAudioForUser().catch(() => {})
  }
  window.addEventListener('pointerdown', once, true)
  window.addEventListener('keydown', once, true)
}

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
  if (graph.context.state === 'suspended' || graph.context.state === 'interrupted') {
    try { await graph.context.resume() } catch (err) { /* autoplay policy */ }
  }
  try {
    await attachMixerGraph(graph, session.webMixer, (lane, meters) => {
      session.fxMeters[lane] = {
        inPeak: meters.inPeak || 0,
        outPeak: meters.outPeak || 0,
        inPeakL: meters.inPeakL || 0,
        inPeakR: meters.inPeakR || 0,
        outPeakL: meters.outPeakL || 0,
        outPeakR: meters.outPeakR || 0,
        wetPeak: meters.wetPeak || 0,
        gr: meters.gr || 0,
        cpuMs: meters.cpuMs,
        active: meters.active
      }
      if (meters.spectrum || meters.eqById || meters.plugins) {
        fxMeterDetail[lane] = meters
      }
      if (meters.cpuMs != null) session.diagnostics.browserCpuMs = meters.cpuMs
      if (lane === 'master' && session.webMixer.master && meters.outPeak != null) {
        session.webMixer.master.peak = meters.outPeak
        session.webMixer.master.clip = meters.outPeak >= 1
      }
    }, session.tracks, mixerGraphOptions())
    session.diagnostics.browserFxAttached = !!graph.mixerNodes
    session.diagnostics.browserFxError = ''
    dryMixToast = false
    syncFxMeterDetail()
    if (metersWanted()) startBrowserMeterLoop()
  } catch (err) {
    console.error('[mixer] browser FX attach failed:', err)
    graph.mixerNodes = null
    invalidateFxWorklet(graph.context)
    session.diagnostics.browserFxAttached = false
    session.diagnostics.browserFxError = readableFxError(err.message || String(err))
    ensureOutputRouting(graph, session.webMixer)
    armFxAttachOnGesture()
    if (!dryMixToast) {
      dryMixToast = true
      const muted = mixerHasInserts(session.webMixer)
      showToast(muted
        ? 'Mixer FX failed to load — inserts are offline. Remove them to restore sound.'
        : 'Mixer FX failed to load')
    }
  }
  publishRoutingDiagnostics(graph)
  preloadSelectedOrchestra(graph)
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
    session.remoteAudioOn = true
    soundingNotes.forEach((voiceKey) => {
      releaseWebSampler(voiceKey)
      mOrchestraCloud.noteOff(voiceKey)
      orchestraVCloud.noteOff(voiceKey)
    })
    soundingNotes.clear()
    refreshMixerGraph()
    startBrowserMeterLoop()
    try {
      const reply = await sendCommand('audio.subscribe', {}, 20000)
      if (reply && reply.ok === false) throw new Error(reply.error || 'audio.subscribe failed')
    } catch {
      // Audio WS already streams once /audio is open; keep remoteAudioOn.
    }
  } catch (err) {
    session.remoteAudioOn = false
    const hint = mixedContentHint()
    const message = String((err && err.message) || err || 'Remote audio failed')
    session.diagnosticsLog = hint && !message.includes(hint) ? `${message} — ${hint}` : message
    throw new Error(session.diagnosticsLog)
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
    const browserOwned = track.source === 'web-sampler' || isCloudSamplerTrack(track)
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
          const voiceKey = isCloudSamplerTrack(track)
            ? previewCloudSampler(track, slice.pitch, noteVelocity(slice), key)
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
    const cloud = track && cloudSamplerFor(track)
    if (cloud) {
      cloud.cancelPending(voiceKey, track.id)
      cloud.noteOff(voiceKey, track.id)
    } else {
      mOrchestraCloud.noteOff(voiceKey)
      orchestraVCloud.noteOff(voiceKey)
    }
    soundingNotes.delete(key)
  })
}

function allLocalNotesOff () {
  soundingNotes.forEach((voiceKey) => {
    releaseWebSampler(voiceKey)
    mOrchestraCloud.noteOff(voiceKey)
    orchestraVCloud.noteOff(voiceKey)
  })
  mOrchestraCloud.allNotesOff()
  orchestraVCloud.allNotesOff()
  soundingNotes.clear()
}

function previewCloudSampler (track, pitch, velocity, id) {
  const logicalId = id || ('preview-' + track.id + '-' + pitch)
  const cloud = cloudSamplerFor(track)
  if (!cloud) return logicalId
  ensureMixerAttached().then(async (graph) => {
    if (!graph) return
    await graph.context.resume()
    const engineKey = await cloud.noteOn(graph, track, pitch, velocity, logicalId)
    if (engineKey && !graph.mixerNodes) refreshMixerGraph()
  }).catch((err) => {
    console.warn('[cloud-sampler] preview failed:', err)
  })
  return logicalId
}

function previewWebSampler (track, pitch, velocity, id) {
  const key = id || ('p' + pitch + '-' + Math.random().toString(36).slice(2, 7))
  ensureMixerAttached().then((graph) => {
    if (!graph) return
    graph.context.resume()
    // Level belongs to the track strip now; baking it in here would double-apply.
    const patch = createWebSamplerInstrument({
      ...(track && track.webSampler),
      name: track && track.name,
      gain: 0.7
    })
    const voice = new WebSamplerVoice(graph.context, trackInputNode(graph, track && track.id))
    const buffer = track ? samplerBuffers.get(track.id) : null
    voice.noteOn(pitch, velocity, patch, buffer || null)
    samplerVoices.set(key, voice)
    if (!graph.mixerNodes) refreshMixerGraph()
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
  refreshMixerGraph()
  ensureMixerAttached().then((graph) => {
    if (!graph) return
    if (graph.mixerNodes) syncMixerGraph(graph, session.webMixer, session.tracks, opts)
    else {
      ensureOutputRouting(graph, session.webMixer, session.tracks, opts)
      if (!mixerHasInserts(session.webMixer)) {
        syncDirectLaneGains(graph, session.tracks, { ...opts, webMixer: session.webMixer })
      }
    }
  }).catch(() => {
    if (audioGraph) ensureOutputRouting(audioGraph, session.webMixer, session.tracks, opts)
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

const analyserScratch = new WeakMap()
const fxMeterDetail = Object.create(null)
const METER_HZ = 20

export function getFxMeterPayload (laneKey) {
  return fxMeterDetail[laneKey] || session.fxMeters[laneKey] || {}
}

function peakFromAnalyser (analyser) {
  if (!analyser) return 0
  let data = analyserScratch.get(analyser)
  const bins = analyser.frequencyBinCount || 128
  if (!data || data.length !== bins) {
    data = new Uint8Array(bins)
    analyserScratch.set(analyser, data)
  }
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

function metersWanted () {
  if (session.playing) return true
  if (session.mixerVisible) return true
  if (session.workspaceView === 'mixer') return true
  if (session.openPlugin) return true
  if (soundingNotes && soundingNotes.size) return true
  return false
}

function syncFxMeterDetail () {
  const on = !!(session.openPlugin || session.mixerVisible || session.workspaceView === 'mixer')
  setFxMeterDetail(audioGraph, on)
  if (!on) {
    Object.keys(fxMeterDetail).forEach((key) => { delete fxMeterDetail[key] })
  }
}

let browserMeterRaf = 0
let lastMeterAt = 0

function tickBrowserMeters (now) {
  browserMeterRaf = 0
  if (!metersWanted()) return
  const graph = audioGraph
  const nodes = graph && graph.mixerNodes
  if (!nodes) {
    browserMeterRaf = requestAnimationFrame(tickBrowserMeters)
    return
  }
  if (now - lastMeterAt < 1000 / METER_HZ) {
    browserMeterRaf = requestAnimationFrame(tickBrowserMeters)
    return
  }
  lastMeterAt = now

  const local = !session.remoteAudioOn
  const samplerPeak = Math.max(fxLanePeak('sampler'), peakFromAnalyser(nodes.sampler && nodes.sampler.analyser))
  const remotePeak = Math.max(fxLanePeak('remote'), peakFromAnalyser(nodes.remote && nodes.remote.analyser))
  const masterPeak = Math.max(fxLanePeak('master'), peakFromAnalyser(nodes.analyserMaster))

  session.tracks.forEach((track) => {
    if (track.type === 'master') {
      if (local || masterPeak > 0) track.meterLevel = masterPeak
      return
    }
    const laneKey = 'track:' + String(track.id)
    const lane = graph.trackLanes && graph.trackLanes.get(String(track.id))
    if (lane) {
      track.meterLevel = Math.max(fxLanePeak(laneKey), peakFromAnalyser(lane.analyser))
      return
    }
    if (local) {
      track.meterLevel = samplerPeak
      return
    }
    if (remotePeak > 0) track.meterLevel = remotePeak
  })

  if (graph.mixerNodes && metersWanted()) {
    browserMeterRaf = requestAnimationFrame(tickBrowserMeters)
  }
}

function startBrowserMeterLoop () {
  if (browserMeterRaf) return
  if (typeof requestAnimationFrame === 'undefined') return
  if (typeof document !== 'undefined' && document.hidden) return
  if (!metersWanted()) return
  browserMeterRaf = requestAnimationFrame(tickBrowserMeters)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopBrowserMeterLoop()
      stopLocalClock()
      return
    }
    if (metersWanted() && audioGraph && audioGraph.mixerNodes) startBrowserMeterLoop()
    // The transport loop bails out while hidden, so pick it up again.
    if (session.playing && !rafId) {
      lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
      lastPositionPush = lastTime
      rafId = requestAnimationFrame(loop)
    }
  })
}

function stopBrowserMeterLoop () {
  if (browserMeterRaf) {
    cancelAnimationFrame(browserMeterRaf)
    browserMeterRaf = 0
  }
}

function maybeStopBrowserMeters () {
  if (!metersWanted()) stopBrowserMeterLoop()
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
  syncFxMeterDetail()
  startBrowserMeterLoop()
  ensureMixerAttached().catch((err) => {
    showToast(err.message || 'Browser FX audio failed to start')
  })
}

export function closePlugin () {
  session.openPlugin = null
  syncFxMeterDetail()
  maybeStopBrowserMeters()
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
  if (!mixerHasInserts(session.webMixer) && audioGraph) {
    ensureOutputRouting(audioGraph, session.webMixer, session.tracks, mixerGraphOptions())
    syncDirectLaneGains(audioGraph, session.tracks, { ...mixerGraphOptions(), webMixer: session.webMixer })
    mixerAttachPromise = null
    ensureMixerAttached().catch(() => {})
  }
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
