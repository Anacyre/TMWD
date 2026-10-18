import { visibleTrackRows, buildClipPreview, clipSourceLength, nextBarLength, relativeClipOffsets, buildCollapsedGroupClip, invalidateClipPreview, mergeClipPlan } from './playlist-model.js'
import { applyClipDrag } from './arrange-gestures.js'

function makeTrack (id, name, extra = {}) {
  return { id, name, type: extra.type || 'midi', parentId: extra.parentId || 0, collapsed: !!extra.collapsed }
}

const tracks = [
  makeTrack(1, 'Master', { type: 'master' }),
  makeTrack(2, 'Strings', { type: 'group' }),
  makeTrack(3, 'Violin I', { parentId: 2 }),
  makeTrack(4, 'Violin II', { parentId: 2 }),
  makeTrack(5, 'Woodwinds', { type: 'group' }),
  makeTrack(6, 'Flute', { parentId: 5 })
]

const expanded = visibleTrackRows(tracks)
if (expanded.length !== 5) throw new Error('expected 5 visible rows, got ' + expanded.length)
if (expanded[0].track.name !== 'Strings') throw new Error('first visible should be Strings')
if (expanded[1].depth !== 1) throw new Error('Violin should be nested')

tracks[1].collapsed = true
const collapsed = visibleTrackRows(tracks)
if (collapsed.some((row) => row.track.parentId === 2)) throw new Error('collapsed children still visible')

const clip = {
  id: 9,
  lengthBeats: 8,
  loopLengthBeats: 8,
  notes: [
    { pitch: 60, start: 0, duration: 1, velocity: 100 },
    { pitch: 64, start: 1, duration: 1, velocity: 80 },
    { pitch: 67, start: 2, duration: 0.5, velocity: 90 }
  ]
}
const preview = buildClipPreview(clip)
if (preview.bars.length !== 3) throw new Error('preview bars')
if (preview.lo !== 58 || preview.hi !== 69) throw new Error('preview pitch range should pad the used notes')
if (Math.abs(preview.bars[1].x0 - 1 / 8) > 1e-9) throw new Error('preview bar must sit at its real time')
if (clipSourceLength(clip) !== 8) throw new Error('source length')

const edited = {
  ...clip,
  notes: [
    { pitch: 48, start: 0, duration: 1, velocity: 100 },
    { pitch: 52, start: 2, duration: 1, velocity: 100 },
    { pitch: 55, start: 4, duration: 1, velocity: 100 }
  ]
}
const before = buildClipPreview(edited)
invalidateClipPreview(edited.id)
const after = buildClipPreview(edited)
if (before === after) throw new Error('preview should rebuild after invalidation')
if (!after.bars.some((bar) => bar.x0 < 0.25)) throw new Error('edited preview empty')

const offsets = relativeClipOffsets([
  { startBeat: 1 },
  { startBeat: 2.5 }
])
if (offsets[1].startDelta !== 1.5) throw new Error('relative offset')

tracks[1].collapsed = true
const grouped = buildCollapsedGroupClip(tracks, [
  { id: 1, trackIndex: 2, startBeat: 0, lengthBeats: 4, notes: [{ id: 1, pitch: 60, startTick: 0, durationTick: 960 }] },
  { id: 2, trackIndex: 3, startBeat: 2, lengthBeats: 4, notes: [{ id: 2, pitch: 67, startTick: 0, durationTick: 480 }] }
], 2)
if (!grouped || grouped.notes.length !== 2) throw new Error('collapsed group clip notes')
if (grouped.lengthBeats !== 6) throw new Error('collapsed group span')

const snapped = applyClipDrag([
  { id: 1, start: 0, length: 4, row: 0 },
  { id: 2, start: 2, length: 4, row: 0 },
  { id: 3, start: 4, length: 4, row: 0 }
], { edge: 'move', deltaBeats: -3, snap: (beat) => Math.max(0, beat), rowCount: 4 })
if (snapped[0].start !== 0 || snapped[1].start !== 2 || snapped[2].start !== 4) {
  throw new Error('overlapping move stops the whole group at beat 0')
}

const dragged = applyClipDrag(
  [{ id: 1, start: 0, length: 2, row: 0 }, { id: 2, start: 4, length: 2, row: 0 }],
  { deltaBeats: -2, deltaRows: 0, snap: (beat) => Math.max(0, Math.round(beat)) }
)
if (dragged[0].start !== 0 || dragged[1].start !== 4) throw new Error('overlapping move must not pull the later clip when the first is at 0')
const stepped = applyClipDrag(
  [{ id: 1, start: 1, length: 1, row: 1 }, { id: 2, start: 3, length: 1, row: 1 }],
  { deltaBeats: -4, deltaRows: -5, snap: (beat) => Math.max(0, beat), rowCount: 4 }
)
if (stepped[0].start !== 0 || stepped[1].start !== 2 || stepped[0].row !== 0 || stepped[1].row !== 0) throw new Error('group drag docks at the edge together')

if (nextBarLength(4, 4, 4) !== 4) throw new Error('pattern must not grow when the note ends on the bar')
if (nextBarLength(4, 4.25, 4) !== 8) throw new Error('a note past the bar grows the pattern by one bar')
if (nextBarLength(6, 6.1, 4) !== 8) throw new Error('growth lands on the next bar line')
if (nextBarLength(0, 0.5, 3) !== 3) throw new Error('the first bar follows the time signature')

const merged = mergeClipPlan([
  { id: 1, trackIndex: 2, kind: 'midi', midi: true, startBeat: 0, lengthBeats: 4, notes: [{ id: 1, pitch: 60, start: 0, duration: 1, velocity: 100 }] },
  { id: 2, trackIndex: 2, kind: 'midi', midi: true, startBeat: 4, lengthBeats: 4, notes: [{ id: 2, pitch: 64, start: 1, duration: 1, velocity: 90 }], expression: { cc1: [{ t: 0, v: 80 }], cc11: [], cc64: [{ startTick: 0, endTick: 480 }] } }
])
if (!merged || merged.lengthBeats !== 8 || merged.notes.length !== 2) throw new Error('merge joins patterns on one track')
if (merged.notes[1].start !== 5 || merged.notes[1].pitch !== 64) throw new Error('merged notes keep their place on the timeline')
if (merged.expression.cc1[0].t !== 4 || merged.expression.cc64[0].startTick !== 4 * 960) throw new Error('expression and pedal shift with the pattern')
if (mergeClipPlan([
  { id: 1, trackIndex: 2, kind: 'midi', midi: true, startBeat: 0, lengthBeats: 4, notes: [] },
  { id: 2, trackIndex: 3, kind: 'midi', midi: true, startBeat: 0, lengthBeats: 4, notes: [] }
])) throw new Error('patterns on different tracks do not merge')

console.log('playlist-model ok')
