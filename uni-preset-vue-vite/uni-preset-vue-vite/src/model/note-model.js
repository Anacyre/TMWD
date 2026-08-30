import { TICKS_PER_BEAT, beatsToTicks, ticksToBeats } from './timeline.js'

export { TICKS_PER_BEAT, beatsToTicks, ticksToBeats }

export const PPQ = TICKS_PER_BEAT
export const MIN_DURATION_TICKS = Math.max(1, Math.round(PPQ / 64))
export const MIN_PITCH = 0
export const MAX_PITCH = 127
export const MIN_VELOCITY = 1
export const MAX_VELOCITY = 127
export const CENTER_PAN = 64
export const DEFAULT_DURATION_TICKS = PPQ

export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const BLACK_KEYS = new Set([1, 3, 6, 8, 10])

export const SNAP_PRESETS = [
  { id: 'off', label: 'Off', ticks: 0 },
  { id: '1/4', label: '1/4', ticks: PPQ },
  { id: '1/8', label: '1/8', ticks: PPQ / 2 },
  { id: '1/16', label: '1/16', ticks: PPQ / 4 },
  { id: '1/32', label: '1/32', ticks: PPQ / 8 },
  { id: 'triplet', label: 'Triplet', ticks: PPQ / 3 },
  { id: 'bar', label: 'Bar', ticks: PPQ * 4 }
]

export const REPEAT_MODES = [
  { id: 0, label: 'Off', ticks: 0 },
  { id: 1, label: '1/4', ticks: PPQ },
  { id: 2, label: '1/8 dotted', ticks: PPQ * 0.75 },
  { id: 3, label: '1/4 triplet', ticks: (PPQ * 2) / 3 },
  { id: 4, label: '1/8', ticks: PPQ / 2 },
  { id: 5, label: '1/16 dotted', ticks: PPQ * 0.375 },
  { id: 6, label: '1/8 triplet', ticks: PPQ / 3 },
  { id: 7, label: '1/16', ticks: PPQ / 4 },
  { id: 8, label: '1/32 dotted', ticks: PPQ * 0.1875 },
  { id: 9, label: '1/16 triplet', ticks: PPQ / 6 },
  { id: 10, label: '1/32', ticks: PPQ / 8 },
  { id: 11, label: '1/64 dotted', ticks: PPQ * 0.09375 },
  { id: 12, label: '1/32 triplet', ticks: PPQ / 12 },
  { id: 13, label: '1/64', ticks: PPQ / 16 },
  { id: 14, label: '1/64 triplet', ticks: PPQ / 24 }
]

export const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
}

export const SCALE_NAMES = Object.keys(SCALE_INTERVALS)
export const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const NOTE_KEYS = [
  'id', 'pitch', 'startTick', 'durationTick', 'velocity', 'releaseVelocity',
  'pan', 'group', 'color', 'pitchOffset', 'muted', 'slide', 'porta',
  'repeatMode', 'modX', 'modY'
]

const MUTED_NOTE_KEYS = new Set(['selected', 'start', 'duration', 'lengthBeats', 'startBeat'])

export function isBlackKey (pitch) {
  return BLACK_KEYS.has(((pitch % 12) + 12) % 12)
}

export function pitchName (pitch, { octaveOnlyC = true } = {}) {
  const pc = ((pitch % 12) + 12) % 12
  const octave = Math.floor(pitch / 12) - 1
  if (octaveOnlyC && pc !== 0) return ''
  return PITCH_NAMES[pc] + octave
}

export function pitchNameFull (pitch) {
  const pc = ((pitch % 12) + 12) % 12
  return PITCH_NAMES[pc] + (Math.floor(pitch / 12) - 1)
}

export function clampInt (value, min, max, fallback = min) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function midiVelocity (value, fallback = 100) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  if (n > 1 || Number.isInteger(n)) return clampInt(n, MIN_VELOCITY, MAX_VELOCITY, fallback)
  return clampInt(n * 127, MIN_VELOCITY, MAX_VELOCITY, fallback)
}

export function velocityNorm (value) {
  return midiVelocity(value) / 127
}

export function snapTick (tick, gridTicks, free = false) {
  const t = Math.max(0, Math.round(tick || 0))
  if (free || !gridTicks || gridTicks <= 0) return t
  return Math.max(0, Math.round(t / gridTicks) * gridTicks)
}

export function quantizeTick (oldTick, gridTicks, strength = 1) {
  const amount = Math.min(1, Math.max(0, strength))
  const grid = snapTick(oldTick, gridTicks)
  return Math.round(oldTick + amount * (grid - oldTick))
}

export function ticksPerBar (numerator = 4, denominator = 4) {
  return Math.round((Math.max(1, numerator) * PPQ * 4) / Math.max(1, denominator))
}

export function timeSignatureAtTick (changes, tick, fallback = { numerator: 4, denominator: 4 }) {
  const list = (changes || []).slice().sort((a, b) => (a.timeTick || 0) - (b.timeTick || 0))
  let current = fallback
  for (let i = 0; i < list.length; i++) {
    if ((list[i].timeTick || 0) <= tick) current = list[i]
    else break
  }
  return {
    numerator: Math.max(1, current.numerator || fallback.numerator || 4),
    denominator: Math.max(1, current.denominator || fallback.denominator || 4),
    timeTick: current.timeTick || 0
  }
}

export function scalePitchClasses (key = 'C', scale = 'major') {
  const root = Math.max(0, KEY_NAMES.indexOf(key))
  const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.major
  return new Set(intervals.map((interval) => (root + interval) % 12))
}

export function isScalePitch (pitch, key = 'C', scale = 'major') {
  return scalePitchClasses(key, scale).has(((pitch % 12) + 12) % 12)
}

export function snapPitchToScale (pitch, key = 'C', scale = 'major') {
  const n = Math.round(pitch)
  if (isScalePitch(n, key, scale)) return n
  for (let d = 1; d <= 6; d++) {
    if (isScalePitch(n + d, key, scale)) return n + d
    if (isScalePitch(n - d, key, scale)) return n - d
  }
  return n
}

export function repeatIntervalTicks (repeatMode) {
  const found = REPEAT_MODES.find((item) => item.id === repeatMode)
  return found ? Math.round(found.ticks) : 0
}

export function defaultNote (partial = {}) {
  return normalizeNote({
    id: 0,
    pitch: 60,
    startTick: 0,
    durationTick: DEFAULT_DURATION_TICKS,
    velocity: 100,
    releaseVelocity: 64,
    pan: CENTER_PAN,
    group: 0,
    color: 0,
    pitchOffset: 0,
    muted: false,
    slide: false,
    porta: false,
    repeatMode: 0,
    modX: 0,
    modY: 0,
    ...partial
  })
}

function readTick (raw, tickKey, beatKey, fallback = 0) {
  if (raw == null) return fallback
  if (raw[tickKey] != null && raw[tickKey] !== '') return Math.max(0, Math.round(Number(raw[tickKey])))
  const beats = raw[beatKey]
  if (beats != null && beats !== '') return Math.max(0, beatsToTicks(Number(beats)))
  return fallback
}

export function normalizeNote (raw = {}, extras = true) {
  const note = {
    id: clampInt(raw.id != null ? raw.id : raw.noteId, 0, 1e9, 0),
    pitch: clampInt(raw.pitch, MIN_PITCH, MAX_PITCH, 60),
    startTick: readTick(raw, 'startTick', raw.start != null ? 'start' : 'startBeat', 0),
    durationTick: Math.max(MIN_DURATION_TICKS, readTick(raw, 'durationTick', raw.duration != null ? 'duration' : 'lengthBeats', DEFAULT_DURATION_TICKS)),
    velocity: midiVelocity(raw.velocity, 100),
    releaseVelocity: midiVelocity(raw.releaseVelocity != null ? raw.releaseVelocity : 64, 64),
    pan: clampInt(raw.pan, 0, 127, CENTER_PAN),
    group: clampInt(raw.group, 0, 9999, 0),
    color: clampInt(raw.color != null ? raw.color : raw.channel, 0, 15, 0),
    pitchOffset: clampInt(raw.pitchOffset, -120, 120, 0),
    muted: !!raw.muted,
    slide: !!raw.slide,
    porta: !!raw.porta,
    repeatMode: clampInt(raw.repeatMode, 0, REPEAT_MODES.length - 1, 0),
    modX: clampInt(raw.modX, 0, 127, 0),
    modY: clampInt(raw.modY, 0, 127, 0)
  }
  note.start = ticksToBeats(note.startTick)
  note.duration = ticksToBeats(note.durationTick)
  if (extras && raw && typeof raw === 'object') {
    Object.keys(raw).forEach((key) => {
      if (NOTE_KEYS.includes(key) || MUTED_NOTE_KEYS.has(key) || key === 'noteId' || key === 'channel') return
      if (note[key] === undefined) note[key] = raw[key]
    })
  }
  return note
}

export function serializeNote (note) {
  const n = normalizeNote(note)
  const out = {
    id: n.id,
    pitch: n.pitch,
    startTick: n.startTick,
    durationTick: n.durationTick,
    velocity: n.velocity,
    releaseVelocity: n.releaseVelocity,
    pan: n.pan,
    group: n.group,
    color: n.color,
    pitchOffset: n.pitchOffset,
    muted: n.muted,
    slide: n.slide,
    porta: n.porta,
    repeatMode: n.repeatMode,
    modX: n.modX,
    modY: n.modY
  }
  Object.keys(n).forEach((key) => {
    if (out[key] !== undefined || MUTED_NOTE_KEYS.has(key) || NOTE_KEYS.includes(key)) return
    out[key] = n[key]
  })
  return out
}

export function engineNotePayload (note) {
  const n = normalizeNote(note)
  return {
    noteId: n.id,
    id: n.id,
    pitch: n.pitch,
    startTick: n.startTick,
    durationTick: n.durationTick,
    start: n.start,
    duration: n.duration,
    velocity: n.velocity,
    releaseVelocity: n.releaseVelocity,
    pan: n.pan,
    group: n.group,
    color: n.color,
    pitchOffset: n.pitchOffset,
    muted: n.muted,
    slide: n.slide,
    porta: n.porta,
    repeatMode: n.repeatMode,
    modX: n.modX,
    modY: n.modY
  }
}

export function cloneNote (note, patch = {}) {
  return normalizeNote({ ...serializeNote(note), ...patch })
}

export function noteEndTick (note) {
  return (note.startTick || 0) + Math.max(MIN_DURATION_TICKS, note.durationTick || 0)
}

export function selectionBounds (notes) {
  const list = notes || []
  if (!list.length) return { startTick: 0, endTick: 0, lengthTick: 0, minPitch: 60, maxPitch: 60 }
  let startTick = Infinity
  let endTick = 0
  let minPitch = 127
  let maxPitch = 0
  list.forEach((note) => {
    startTick = Math.min(startTick, note.startTick || 0)
    endTick = Math.max(endTick, noteEndTick(note))
    minPitch = Math.min(minPitch, note.pitch)
    maxPitch = Math.max(maxPitch, note.pitch)
  })
  return { startTick, endTick, lengthTick: Math.max(MIN_DURATION_TICKS, endTick - startTick), minPitch, maxPitch }
}

export function duplicateNotes (notes, offsetTick) {
  const bounds = selectionBounds(notes)
  const shift = offsetTick != null ? offsetTick : bounds.lengthTick
  return (notes || []).map((note) => cloneNote(note, { id: 0, startTick: Math.max(0, (note.startTick || 0) + shift) }))
}

export function moveNotes (notes, dTick, dPitch, { gridTicks = 0, free = false, minPitch = MIN_PITCH, maxPitch = MAX_PITCH } = {}) {
  return (notes || []).map((note) => {
    const startTick = snapTick(Math.max(0, (note.startTick || 0) + dTick), gridTicks, free)
    const pitch = clampInt((note.pitch || 60) + dPitch, minPitch, maxPitch, note.pitch)
    return cloneNote(note, { startTick, pitch })
  })
}

export function resizeNotes (notes, dTick, { gridTicks = 0, free = false } = {}) {
  return (notes || []).map((note) => {
    const raw = (note.durationTick || DEFAULT_DURATION_TICKS) + dTick
    const durationTick = Math.max(MIN_DURATION_TICKS, free ? Math.round(raw) : snapTick(raw, gridTicks, false) || MIN_DURATION_TICKS)
    return cloneNote(note, { durationTick })
  })
}

export function shiftVelocity (notes, delta, absolute = false) {
  return (notes || []).map((note) => {
    const next = absolute ? delta : midiVelocity(note.velocity) + delta
    return cloneNote(note, { velocity: clampInt(next, MIN_VELOCITY, MAX_VELOCITY, note.velocity) })
  })
}

export function quantizeNotes (notes, gridTicks, { strength = 1, lengths = false } = {}) {
  const amount = Math.min(1, Math.max(0, strength))
  return (notes || []).map((note) => {
    const startTick = quantizeTick(note.startTick || 0, gridTicks, amount)
    const durationTick = lengths
      ? Math.max(MIN_DURATION_TICKS, quantizeTick(note.durationTick || DEFAULT_DURATION_TICKS, gridTicks, amount))
      : note.durationTick
    return cloneNote(note, { startTick, durationTick })
  })
}

export function expandRepeats (note) {
  const interval = repeatIntervalTicks(note.repeatMode)
  if (!interval) return [note]
  const out = []
  const end = noteEndTick(note)
  for (let t = note.startTick; t < end; t += interval) {
    const duration = Math.min(interval, end - t)
    if (duration < MIN_DURATION_TICKS) break
    out.push(cloneNote(note, { startTick: t, durationTick: duration, repeatMode: 0, id: 0 }))
  }
  return out.length ? out : [note]
}

export function serializeClipboard (notes) {
  return JSON.stringify({
    format: 'dawweb-notes',
    version: 1,
    ppq: PPQ,
    notes: (notes || []).map(serializeNote)
  })
}

export function parseClipboard (text) {
  if (!text) return []
  try {
    const data = typeof text === 'string' ? JSON.parse(text) : text
    if (!data || (data.format !== 'dawweb-notes' && !Array.isArray(data.notes) && !Array.isArray(data))) return []
    const list = Array.isArray(data) ? data : (data.notes || [])
    return list.map((note) => normalizeNote(note))
  } catch (err) {
    return []
  }
}

export function createStressNotes (count, { startPitch = 36, span = 48, beats = 64 } = {}) {
  const notes = []
  const totalTicks = beatsToTicks(beats)
  const step = Math.max(MIN_DURATION_TICKS, Math.floor(totalTicks / Math.max(1, count)))
  for (let i = 0; i < count; i++) {
    notes.push(defaultNote({
      id: i + 1,
      pitch: startPitch + (i % span),
      startTick: (i * step) % totalTicks,
      durationTick: Math.min(PPQ, step),
      velocity: 40 + (i % 80)
    }))
  }
  return notes
}

export function visibleNotes (notes, view) {
  const list = notes || []
  const start = view.startTick || 0
  const end = view.endTick != null ? view.endTick : start + beatsToTicks(view.beats || 8)
  const lo = view.minPitch != null ? view.minPitch : MIN_PITCH
  const hi = view.maxPitch != null ? view.maxPitch : MAX_PITCH
  const out = []
  for (let i = 0; i < list.length; i++) {
    const note = list[i]
    if ((note.pitch || 0) < lo || (note.pitch || 0) > hi) continue
    const noteStart = note.startTick || 0
    if (noteStart >= end || noteEndTick(note) <= start) continue
    out.push(note)
  }
  return out
}

export function normalizeMarker (raw = {}) {
  const startBeat = raw.startBeat != null ? Number(raw.startBeat) : (raw.beats != null ? Number(raw.beats) : 0)
  const timeTick = raw.timeTick != null ? Math.max(0, Math.round(Number(raw.timeTick))) : beatsToTicks(startBeat)
  return {
    id: clampInt(raw.id != null ? raw.id : raw.markerId, 0, 1e9, 0),
    name: raw.name || 'Marker',
    timeTick,
    startBeat: ticksToBeats(timeTick),
    mode: raw.mode || raw.section || '',
    section: raw.section || raw.mode || ''
  }
}

export function defaultScore (partial = {}) {
  return {
    ppq: PPQ,
    key: 'C',
    scale: 'major',
    timeSignatures: [{ timeTick: 0, numerator: 4, denominator: 4 }],
    markers: [],
    ...partial
  }
}
