import { computed, reactive } from 'vue'
import {
  connectEngine,
  disconnectEngine,
  engineLink,
  isEngineConnected,
  onEngineEvent,
  sendCommand
} from '../bridge/engine.js'

export const TRACK_HEIGHT = 50
export const RULER_HEIGHT = 32
export const HEADER_HEIGHT = 44
export const TRANSPORT_HEIGHT = 44
export const TICKS_PER_BEAT = 960
export const STATUS_HEIGHT = 24
export const TRANSPORT_KEYS = { editor: 'E', mixer: 'M', inspector: 'I' }
export const SNAP_OPTIONS = [
  { name: 'Off', beats: 0 },
  { name: '1/1', beats: 4 },
  { name: '1/2', beats: 2 },
  { name: '1/4', beats: 1 },
  { name: '1/8', beats: 0.5 },
  { name: '1/16', beats: 0.25 },
  { name: '1/32', beats: 0.125 }
]
export const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '12/8']
export const TRACK_HEIGHTS = [
  { name: 'Compact', value: 38 },
  { name: 'Normal', value: 50 },
  { name: 'Large', value: 84 }
]

const PALETTE = ['#4a90d9', '#d98b4a', '#6dbf8a', '#c46bb3', '#d4c05a', '#5bb8c4', '#d96a6a']

const SUPPORT_EXTS = ['.mp3', '.mp4', '.wav', '.aac', '.ogg', '.flac', '.mid', '.midi', '.aif', '.aiff', '.m4a']

function nextId (list, key = 'id') {
  return list.reduce((max, item) => Math.max(max, item[key] || 0), 0) + 1
}

function fire (type, payload) {
  if (!isEngineConnected()) return Promise.resolve(null)
  return sendCommand(type, payload).catch((err) => {
    showToast(err.message || 'Engine command failed')
    return null
  })
}

export const session = reactive({
  projectName: 'Untitled Orchestra',
  userName: 'xiaofish',
  playing: false,
  recording: false,
  looping: false,
  metronome: true,
  snap: true,
  snapGridBeats: 0.25,
  bpm: 96,
  positionBeats: 0,
  loopStart: 0,
  loopEnd: 32,
  pixelsPerBeat: 21,
  masterGain: 0.8,
  timeSigNum: 4,
  timeSigDen: 4,
  colourIndex: 0,
  openMenu: '',
  toast: '',
  engineStatus: '',
  selectedTrack: 1,
  selectedClip: 0,
  editorVisible: true,
  mixerVisible: false,
  inspectorVisible: true,
  editorTab: 'piano',
  trackHeight: 50,
  instrumentPickerTrack: -1,
  catalogue: {
    instruments: [],
    techniques: [],
    controllers: [],
    plugins: [],
    libraries: [],
    warnings: [],
    startupStatus: '',
    maxHostedInstances: 64
  },
  tracks: [
    {
      id: 1,
      name: 'Master',
      type: 'master',
      colour: '#8a8a8a',
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      recordArm: false,
      instrument: '',
      definitionId: '',
      techniqueId: '',
      section: '',
      controllerValues: {},
      inserts: [],
      meterLevel: 0
    }
  ],
  clips: []
})

export { engineLink }

export const positionText = computed(() => {
  const beatsPerBar = session.timeSigNum
  const total = Math.max(0, session.positionBeats)
  const bar = Math.floor(total / beatsPerBar) + 1
  const beatInBar = total - (bar - 1) * beatsPerBar
  const beat = Math.floor(beatInBar) + 1
  const tick = Math.floor((beatInBar % 1) * TICKS_PER_BEAT) + 1
  return `${bar} / ${beat} / ${tick}`
})

export const secondsText = computed(() => {
  const seconds = session.positionBeats * 60 / Math.max(1, session.bpm)
  const mins = Math.floor(seconds / 60)
  const secs = seconds - mins * 60
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
})

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
    colour: track.colour || '#4a90d9',
    volume: track.volume,
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
    midiChannel: track.midiChannel || 1,
    controllerValues: track.controllerValues || {},
    inserts: track.inserts || [],
    meterLevel: existing.meterLevel || 0
  }
}

function mapClip (clip) {
  return {
    id: clip.clipId,
    trackIndex: clip.trackIndex,
    startBeat: clip.start,
    lengthBeats: clip.length,
    name: clip.name,
    colour: clip.colour || (session.tracks[clip.trackIndex] && session.tracks[clip.trackIndex].colour) || '#4a90d9',
    midi: clip.midi !== false,
    notes: (clip.notes || []).map((note) => ({
      id: note.noteId,
      pitch: note.pitch,
      start: note.start,
      duration: note.duration,
      velocity: note.velocity
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
  if (project.tracks) {
    const selectedId = (session.tracks[session.selectedTrack] || {}).id
    session.tracks = project.tracks.map(mapTrack)
    const master = session.tracks.find((track) => track.type === 'master')
    if (master) session.masterGain = master.volume
    const nextSelected = session.tracks.findIndex((track) => track.id === selectedId)
    session.selectedTrack = nextSelected >= 0 ? nextSelected : Math.min(session.selectedTrack, session.tracks.length - 1)
  }
  if (project.clips) {
    const selectedClipId = (session.clips[session.selectedClip] || {}).id
    session.clips = project.clips.map(mapClip)
    const nextClip = session.clips.findIndex((clip) => clip.id === selectedClipId)
    session.selectedClip = nextClip >= 0 ? nextClip : (session.clips.length ? 0 : -1)
  }
}

function applyClock (clock) {
  if (!clock) return
  if (clock.positionBeats != null) session.positionBeats = clock.positionBeats
  if (clock.playing != null) session.playing = !!clock.playing
  if (clock.looping != null) session.looping = !!clock.looping
  if (clock.bpm != null) session.bpm = clock.bpm
  if (clock.engineStatus) session.engineStatus = clock.engineStatus
  if (clock.masterLevel != null && session.tracks[0]) session.tracks[0].meterLevel = clock.masterLevel
  if (Array.isArray(clock.levels)) {
    clock.levels.forEach((level, index) => {
      if (session.tracks[index]) session.tracks[index].meterLevel = level
    })
  }
}

onEngineEvent((message) => {
  if (!message) return
  if (message.type === 'event.state') applyProject(message.project)
  if (message.type === 'event.clock') applyClock(message)
  if (message.ok && message.project) applyProject(message.project)
  if (message.ok && message.catalogue) applyCatalogue(message.catalogue)
})

export function applyCatalogue (catalogue) {
  if (!catalogue) return
  session.catalogue.instruments = catalogue.instruments || []
  session.catalogue.techniques = catalogue.techniques || []
  session.catalogue.controllers = catalogue.controllers || []
  session.catalogue.plugins = catalogue.plugins || []
  session.catalogue.libraries = catalogue.libraries || []
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
  disconnectEngine()
}

export function setBpm (value) {
  session.bpm = Math.min(400, Math.max(20, Math.round(value)))
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
  }
  fire('mixer.setMasterVolume', { value: session.masterGain })
}

export function setTrackParameter (track, parameter, value) {
  if (!track) return
  track[parameter] = value
  if (track.type === 'master' && parameter === 'volume') {
    session.masterGain = value
    fire('mixer.setMasterVolume', { value })
    return
  }
  fire('track.setParameter', { trackId: track.id, parameter, value })
}

export function setPixelsPerBeat (ppb) {
  session.pixelsPerBeat = Math.min(180, Math.max(12, ppb))
}

let rafId = 0
let lastTime = 0

function loop (now) {
  if (!session.playing || isEngineConnected()) return
  const dt = Math.min(0.1, (now - lastTime) / 1000)
  lastTime = now
  session.positionBeats += dt * session.bpm / 60
  if (session.looping && session.positionBeats >= session.loopEnd) {
    const length = Math.max(0.25, session.loopEnd - session.loopStart)
    session.positionBeats = session.loopStart + ((session.positionBeats - session.loopStart) % length)
  }
  rafId = requestAnimationFrame(loop)
}

function stopLocalClock () {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

export function play () {
  if (session.playing) return
  session.playing = true
  if (isEngineConnected()) {
    stopLocalClock()
    fire('transport.play')
    return
  }
  if (typeof requestAnimationFrame === 'undefined') return
  lastTime = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  rafId = requestAnimationFrame(loop)
}

export function pause () {
  session.playing = false
  stopLocalClock()
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
  session.trackHeight = value
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
  const track = session.tracks[trackIndex]
  if (!track || track.type === 'master') return
  session.selectedTrack = trackIndex
  session.instrumentPickerTrack = trackIndex
}

export function closeInstrumentPicker () {
  session.instrumentPickerTrack = -1
}

export async function addTrack (type = 'audio') {
  const name = (type === 'midi' ? 'MIDI ' : 'Audio ') + session.tracks.length
  if (isEngineConnected()) {
    const reply = await fire('track.create', { name, trackType: type })
    return reply && reply.index != null ? reply.index : -1
  }
  const colour = PALETTE[session.colourIndex % PALETTE.length]
  session.colourIndex += 1
  session.tracks.push({
    id: nextId(session.tracks),
    name,
    type,
    colour,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    recordArm: false,
    instrument: type === 'midi' ? 'Test Synth' : '',
    definitionId: type === 'midi' ? 'test_synth' : '',
    techniqueId: '',
    section: '',
    controllerValues: {},
    inserts: [],
    meterLevel: 0
  })
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
  if (!track || track.type === 'master') return
  fire('clip.create', {
    trackId: track.id,
    trackIndex,
    start: snapBeat(startBeat),
    length: lengthBeats,
    name: track.name,
    sketch: track.type === 'midi'
  })
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
  if (isEngineConnected()) {
    fire('project.new')
    return
  }
  session.clips = []
  session.tracks = session.tracks.filter((track) => track.type === 'master')
  returnToStart()
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
  const anySolo = session.tracks.some((item) => item.solo && item.type !== 'master')
  if (anySolo && !track.solo && track.type !== 'master') return false
  return true
}

export function selectTrack (index) {
  if (index < 0 || index >= session.tracks.length) return
  session.selectedTrack = index
  const clipIndex = session.clips.findIndex((clip) => clip.trackIndex === index)
  if (clipIndex >= 0) session.selectedClip = clipIndex
}

export function selectClip (index) {
  if (index < 0 || index >= session.clips.length) return
  session.selectedClip = index
  session.selectedTrack = session.clips[index].trackIndex
}

export function getSelectedTrack () {
  return session.tracks[session.selectedTrack] || null
}

export function getSelectedClip () {
  return session.clips[session.selectedClip] || null
}

export function toggleEditor () {
  session.editorVisible = !session.editorVisible
}

export function toggleMixer () {
  session.mixerVisible = !session.mixerVisible
}

export function toggleInspector () {
  session.inspectorVisible = !session.inspectorVisible
}

export function setEditorVisible (visible) {
  session.editorVisible = !!visible
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
  const groups = []
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

export function loadInstrument (track, definitionId) {
  if (!track || track.type === 'master' || !definitionId) return
  fire('instrument.load', { trackId: track.id, definitionId })
}

export function unloadInstrument (track) {
  if (!track || track.type === 'master') return
  fire('instrument.unload', { trackId: track.id })
}

export function setTechnique (track, techniqueId) {
  if (!track) return
  fire('instrument.setTechnique', { trackId: track.id, techniqueId })
}

export function setController (track, controllerId, value) {
  if (!track) return
  if (!track.controllerValues) track.controllerValues = {}
  track.controllerValues[controllerId] = value
  fire('instrument.setController', { trackId: track.id, controllerId, value })
}

export function previewNoteOn (track, pitch, velocity = 0.8) {
  if (!track) return
  fire('preview.noteOn', { trackId: track.id, pitch, velocity })
}

export function previewNoteOff (track, pitch) {
  if (!track) return
  fire('preview.noteOff', { trackId: track.id, pitch })
}

export function createNote (clip, pitch, start, duration = 0.25, velocity = 100) {
  if (!clip) return
  fire('note.create', {
    clipId: clip.id,
    pitch,
    start,
    duration,
    velocity
  })
}

export function deleteNote (clip, note) {
  if (!clip || !note) return
  fire('note.delete', { clipId: clip.id, noteId: note.id })
}

export function setNote (clip, note, patch) {
  if (!clip || !note) return
  fire('note.set', { clipId: clip.id, noteId: note.id, ...patch })
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

export async function exportProject () {
  if (isEngineConnected()) {
    const reply = await fire('project.export')
    if (reply && reply.json) {
      downloadText((reply.name || session.projectName || 'project') + '.dawweb', reply.json)
      showToast('Project exported')
      return
    }
  }
  showToast('Connect the engine to export a project')
}

export async function importProjectJson (json) {
  if (!json) return
  if (isEngineConnected()) {
    const reply = await fire('project.import', { json })
    if (reply) showToast('Project loaded')
    return
  }
  showToast('Connect the engine to open a project')
}
