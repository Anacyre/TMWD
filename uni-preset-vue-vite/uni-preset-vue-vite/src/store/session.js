import { computed, reactive } from 'vue'

export const TRACK_HEIGHT = 56
export const RULER_HEIGHT = 32
export const HEADER_HEIGHT = 56
export const TICKS_PER_BEAT = 480

const PALETTE = ['#4a90d9', '#d98b4a', '#6dbf8a', '#c46bb3', '#d4c05a', '#5bb8c4', '#d96a6a']

const SUPPORT_EXTS = ['.mp3', '.mp4', '.wav', '.aac', '.ogg', '.flac', '.mid', '.midi', '.aif', '.aiff', '.m4a']

function nextId (list, key = 'id') {
  return list.reduce((max, item) => Math.max(max, item[key] || 0), 0) + 1
}

export const session = reactive({
  projectName: 'New Project',
  userName: 'xiaofish',
  playing: false,
  recording: false,
  looping: false,
  metronome: false,
  snap: true,
  bpm: 120,
  positionBeats: 0,
  loopStart: 0,
  loopEnd: 16,
  pixelsPerBeat: 40,
  masterGain: 0.85,
  timeSigNum: 4,
  timeSigDen: 4,
  colourIndex: 0,
  openMenu: '',
  toast: '',
  tracks: [
    {
      id: 1,
      name: 'Master',
      type: 'master',
      colour: '#8a8a8a',
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      recordArm: false
    }
  ],
  clips: []
})

export const positionText = computed(() => {
  const beatsPerBar = session.timeSigNum
  const total = Math.max(0, session.positionBeats)
  const bar = Math.floor(total / beatsPerBar) + 1
  const beatInBar = total - (bar - 1) * beatsPerBar
  const beat = Math.floor(beatInBar) + 1
  const tick = Math.floor((beatInBar % 1) * TICKS_PER_BEAT) + 1
  return `${bar} / ${beat} / ${tick}`
})

export function snapBeat (beat) {
  if (!session.snap) return Math.max(0, beat)
  return Math.max(0, Math.round(beat / 0.25) * 0.25)
}

export function setBpm (value) {
  session.bpm = Math.min(400, Math.max(20, Math.round(value)))
}

export function setPositionBeats (beats) {
  session.positionBeats = Math.max(0, beats)
}

export function setMasterGain (gain) {
  session.masterGain = Math.min(1, Math.max(0, gain))
  if (session.tracks[0] && session.tracks[0].type === 'master') {
    session.tracks[0].volume = session.masterGain
  }
}

export function setPixelsPerBeat (ppb) {
  session.pixelsPerBeat = Math.min(180, Math.max(12, ppb))
}

let rafId = 0
let lastTime = 0

function loop (now) {
  if (!session.playing) return
  const dt = Math.min(0.1, (now - lastTime) / 1000)
  lastTime = now
  session.positionBeats += dt * session.bpm / 60
  if (session.looping && session.positionBeats >= session.loopEnd) {
    const length = Math.max(0.25, session.loopEnd - session.loopStart)
    session.positionBeats = session.loopStart + ((session.positionBeats - session.loopStart) % length)
  }
  rafId = requestAnimationFrame(loop)
}

export function play () {
  if (session.playing) return
  session.playing = true
  if (typeof requestAnimationFrame === 'undefined') return
  lastTime = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  rafId = requestAnimationFrame(loop)
}

export function pause () {
  session.playing = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

export function togglePlay () {
  session.playing ? pause() : play()
}

export function stop () {
  const wasPlaying = session.playing
  pause()
  session.recording = false
  if (!wasPlaying) {
    session.positionBeats = session.looping ? session.loopStart : 0
  }
}

export function returnToStart () {
  session.positionBeats = session.looping ? session.loopStart : 0
}

export function toggleRecord () {
  session.recording = !session.recording
  if (session.recording && !session.playing) play()
}

export function toggleLoop () {
  session.looping = !session.looping
}

export function toggleMetronome () {
  session.metronome = !session.metronome
}

export function toggleSnap () {
  session.snap = !session.snap
}

export function addTrack (type = 'audio') {
  const colour = PALETTE[session.colourIndex % PALETTE.length]
  session.colourIndex += 1
  const name = (type === 'midi' ? 'MIDI ' : 'Audio ') + session.tracks.length
  session.tracks.push({
    id: nextId(session.tracks),
    name,
    type,
    colour,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    recordArm: false
  })
  return session.tracks.length - 1
}

export function removeTrack (index) {
  if (index <= 0 || index >= session.tracks.length) return
  session.tracks.splice(index, 1)
  session.clips = session.clips.filter((clip) => clip.trackIndex !== index)
  session.clips.forEach((clip) => {
    if (clip.trackIndex > index) clip.trackIndex -= 1
  })
}

export function isSupportedFile (name = '') {
  const lower = name.toLowerCase()
  return SUPPORT_EXTS.some((ext) => lower.endsWith(ext))
}

export function addClipFromFile (file, trackIndex, startBeat) {
  const name = file && file.name ? file.name.replace(/\.[^.]+$/, '') : 'Clip'
  const midi = /\.mid(i)?$/i.test(file && file.name ? file.name : '')
  if (trackIndex <= 0 || trackIndex >= session.tracks.length) {
    trackIndex = addTrack(midi ? 'midi' : 'audio')
  } else if (midi && session.tracks[trackIndex].type !== 'midi') {
    trackIndex = addTrack('midi')
  } else if (!midi && session.tracks[trackIndex].type === 'master') {
    trackIndex = addTrack('audio')
  }

  session.clips.push({
    id: nextId(session.clips),
    trackIndex,
    startBeat: snapBeat(startBeat),
    lengthBeats: midi ? 8 : 4,
    name,
    colour: session.tracks[trackIndex].colour
  })
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
