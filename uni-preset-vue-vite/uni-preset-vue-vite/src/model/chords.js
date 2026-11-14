/**
 * One-click chords for the piano rolls. `scale` stacks thirds inside the project key, so
 * every chord fits the song; the other qualities are fixed interval shapes.
 */

import { SCALE_INTERVALS, KEY_NAMES, snapPitchToScale } from './note-model.js'

export const CHORD_QUALITIES = [
  { id: 'scale', label: 'In key' },
  { id: 'maj', label: 'Maj' },
  { id: 'min', label: 'Min' },
  { id: 'dom', label: 'Dom' },
  { id: 'dim', label: 'Dim' },
  { id: 'aug', label: 'Aug' },
  { id: 'sus2', label: 'Sus2' },
  { id: 'sus4', label: 'Sus4' }
]

export const CHORD_SIZES = [
  { id: 'triad', label: 'Triad' },
  { id: '7', label: '7' },
  { id: '9', label: '9' },
  { id: '11', label: '11' },
  { id: '13', label: '13' }
]

/* Triad, then the 7th / 9th / 11th / 13th added on top. */
const SHAPES = {
  maj: { triad: [0, 4, 7], ext: [11, 14, 17, 21] },
  min: { triad: [0, 3, 7], ext: [10, 14, 17, 21] },
  dom: { triad: [0, 4, 7], ext: [10, 14, 17, 21] },
  dim: { triad: [0, 3, 6], ext: [9, 14, 17, 20] },
  aug: { triad: [0, 4, 8], ext: [10, 14, 18, 21] },
  sus2: { triad: [0, 2, 7], ext: [10, 14, 17, 21] },
  sus4: { triad: [0, 5, 7], ext: [10, 14, 17, 21] }
}

const EXT_COUNT = { triad: 0, 7: 1, 9: 2, 11: 3, 13: 4 }

function extCount (size) {
  return EXT_COUNT[size] != null ? EXT_COUNT[size] : 0
}

/** Major and dominant 13ths drop the 11th, which clashes with the 3rd. */
function shapeIntervals (quality, size) {
  const shape = SHAPES[quality] || SHAPES.maj
  const n = extCount(size)
  let list = shape.triad.concat(shape.ext.slice(0, n))
  if (n === 4 && (quality === 'maj' || quality === 'dom')) list = list.filter((i) => i !== 17)
  return list
}

/** Diatonic chord: stack every other scale degree from the root's degree. */
function scaleIntervals (root, key, scale, size) {
  const steps = SCALE_INTERVALS[scale]
  if (!steps || steps.length !== 7) {
    const fallback = steps && steps.includes(3) && !steps.includes(4) ? 'min' : 'maj'
    return shapeIntervals(fallback, size)
  }
  const keyPc = Math.max(0, KEY_NAMES.indexOf(key))
  const pc = (((root - keyPc) % 12) + 12) % 12
  const degree = steps.indexOf(pc)
  if (degree < 0) return shapeIntervals('maj', size)
  const count = 3 + extCount(size)
  const out = []
  for (let i = 0; i < count; i++) {
    const idx = degree + i * 2
    const octave = Math.floor(idx / 7)
    out.push(steps[idx % 7] + octave * 12 - steps[degree])
  }
  return out
}

/**
 * Pitches for a chord rooted at `root`. In `scale` mode an off-key root first snaps
 * into the key. `inversion` moves the lowest notes up an octave.
 */
export function buildChord (root, options = {}) {
  const quality = options.quality || 'scale'
  const size = options.size || 'triad'
  const key = options.key || 'C'
  const scale = options.scale || 'major'
  let base = Math.round(Number(root) || 60)
  let intervals
  if (quality === 'scale') {
    base = snapPitchToScale(base, key, scale)
    intervals = scaleIntervals(base, key, scale, size)
  } else {
    intervals = shapeIntervals(quality, size)
  }
  let pitches = intervals.map((i) => base + i)
  const inversion = Math.max(0, Math.min(pitches.length - 1, Math.round(Number(options.inversion) || 0)))
  for (let i = 0; i < inversion; i++) {
    const low = pitches.shift()
    pitches.push(low + 12)
  }
  while (pitches.length && pitches[pitches.length - 1] > 127) pitches = pitches.map((p) => p - 12)
  while (pitches.length && pitches[0] < 0) pitches = pitches.map((p) => p + 12)
  return Array.from(new Set(pitches.filter((p) => p >= 0 && p <= 127))).sort((a, b) => a - b)
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Short readable name such as Cmaj7, Dm9, Bdim, G7sus4 for the chord bar. */
export function chordName (root, options = {}) {
  const quality = options.quality || 'scale'
  const size = options.size || 'triad'
  let base = Math.round(Number(root) || 60)
  let intervals
  if (quality === 'scale') {
    base = snapPitchToScale(base, options.key || 'C', options.scale || 'major')
    intervals = scaleIntervals(base, options.key || 'C', options.scale || 'major', size)
  } else {
    intervals = shapeIntervals(quality, size)
  }
  const name = NAMES[((base % 12) + 12) % 12]
  const has = (n) => intervals.includes(n)
  const ext = size === 'triad' ? '' : size
  let kind
  if (has(2) && !has(3) && !has(4)) kind = 'sus2'
  else if (has(5) && !has(3) && !has(4)) kind = 'sus4'
  else if (has(3) && has(6)) kind = has(9) ? 'dim' : (ext ? 'm' : 'dim')
  else if (has(4) && has(8)) kind = 'aug'
  else if (has(3)) kind = 'm'
  else kind = ''
  if (!ext) return name + kind
  const seventh = has(11) ? 'maj' : ''
  if (kind === 'm' && has(6)) return name + 'm' + ext + '♭5'
  if (kind === 'sus2' || kind === 'sus4') return name + seventh + ext + kind
  if (kind === 'dim') return name + 'dim' + ext
  if (kind === 'aug') return name + 'aug' + ext
  return name + kind + seventh + ext
}
