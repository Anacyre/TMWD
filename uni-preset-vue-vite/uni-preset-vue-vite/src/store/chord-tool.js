/**
 * Chord tool shared by the Lite and Pro piano rolls: while it is on, placing a note
 * places a whole chord, grouped so it moves as one.
 */

import { reactive, watch } from 'vue'
import { session, createNote, createNotes, previewNoteOn, previewNoteOff } from './session.js'
import { buildChord, chordName, CHORD_QUALITIES, CHORD_SIZES } from '../model/chords.js'
import { PPQ } from '../model/note-model.js'

const KEY = 'dawweb.chordTool'

function load () {
  const base = { on: false, quality: 'scale', size: 'triad', inversion: 0 }
  try {
    const saved = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) || 'null')
    if (saved && typeof saved === 'object') {
      if (CHORD_QUALITIES.some((q) => q.id === saved.quality)) base.quality = saved.quality
      if (CHORD_SIZES.some((s) => s.id === saved.size)) base.size = saved.size
      base.inversion = Math.max(0, Math.min(3, Number(saved.inversion) || 0))
    }
  } catch (err) { /* defaults */ }
  return base
}

export const chordTool = reactive(load())
export { CHORD_QUALITIES, CHORD_SIZES }

watch(() => [chordTool.quality, chordTool.size, chordTool.inversion], () => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify({ quality: chordTool.quality, size: chordTool.size, inversion: chordTool.inversion }))
    }
  } catch (err) { /* private mode */ }
})

function chordOptions () {
  return {
    quality: chordTool.quality,
    size: chordTool.size,
    inversion: chordTool.inversion,
    key: session.scaleKey || 'C',
    scale: session.scaleName || 'major'
  }
}

export function chordPitches (root) {
  return buildChord(root, chordOptions())
}

export function chordLabel (root) {
  return chordName(root, chordOptions())
}

export const INVERSION_LABELS = ['Root', '1st inv', '2nd inv', '3rd inv']

export function cycleInversion () {
  const max = chordTool.size === 'triad' ? 2 : 3
  chordTool.inversion = chordTool.inversion >= max ? 0 : chordTool.inversion + 1
}

/** Place the chord rooted at `root`. Call inside beginEdit/endEdit so it is one undo step. */
export function placeChord (clip, root, startBeat, durationBeats, velocity = 100) {
  if (!clip) return []
  const pitches = chordPitches(root)
  const group = Math.max(0, ...((clip.notes || []).map((note) => Number(note.group) || 0))) + 1
  if (clip.virtual) {
    return pitches.map((pitch) => createNote(clip, pitch, startBeat, durationBeats, velocity, { group })).filter(Boolean)
  }
  session.lastNoteDurationTicks = Math.max(1, Math.round(durationBeats * PPQ))
  return createNotes(clip, pitches.map((pitch) => ({ pitch, start: startBeat, duration: durationBeats, velocity, group })))
}

let previewTimer = 0
let previewing = []
let previewTrack = null

export function stopChordPreview () {
  clearTimeout(previewTimer)
  previewing.forEach((pitch) => previewNoteOff(previewTrack, pitch))
  previewing = []
}

export function previewChord (track, pitches, ms = 360) {
  stopChordPreview()
  if (!track || !pitches || !pitches.length) return
  previewTrack = track
  previewing = pitches.slice()
  pitches.forEach((pitch) => previewNoteOn(track, pitch, 0.72))
  previewTimer = setTimeout(stopChordPreview, ms)
}
