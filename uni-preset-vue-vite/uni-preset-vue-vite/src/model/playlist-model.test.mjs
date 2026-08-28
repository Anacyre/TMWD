import { visibleTrackRows, buildClipPreview, clipSourceLength, relativeClipOffsets, buildCollapsedGroupClip } from './playlist-model.js'

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
if (preview.length !== 24) throw new Error('preview columns')
if (!preview.some((col) => col.some((cell) => cell > 0))) throw new Error('preview empty')
if (clipSourceLength(clip) !== 8) throw new Error('source length')

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

console.log('playlist-model ok')
