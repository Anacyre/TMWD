import { TICKS_PER_BEAT } from './timeline.js'
import { expandRepeats } from './note-model.js'

const PREVIEW_PITCH_PAD = 2
const MIN_SLICE_BEATS = 0.001
const previewCache = new Map()

function noteStartBeat (note) {
  if (note.startTick != null) return Math.max(0, note.startTick / TICKS_PER_BEAT)
  return Math.max(0, note.start || 0)
}

function noteDurationBeat (note) {
  if (note.durationTick != null) return Math.max(0.02, note.durationTick / TICKS_PER_BEAT)
  return Math.max(0.02, note.duration != null ? note.duration : 0.25)
}

function previewCacheKey (clip, notes) {
  const id = clip && clip.id != null ? clip.id : 0
  const length = clip && clip.lengthBeats != null ? clip.lengthBeats : 0
  const loop = clip && clip.loopLengthBeats != null ? clip.loopLengthBeats : 0
  if (!notes.length) return id + ':0:' + length + ':' + loop
  const digest = notes.map((note) => [
    note.pitch,
    note.startTick != null ? note.startTick : Math.round(noteStartBeat(note) * TICKS_PER_BEAT),
    note.durationTick != null ? note.durationTick : Math.round(noteDurationBeat(note) * TICKS_PER_BEAT),
    note.velocity || 0,
    note.muted ? 1 : 0,
    note.repeatMode || 0
  ].join('.')).join('|')
  return id + ':' + notes.length + ':' + length + ':' + loop + ':' + digest
}

export function clipSourceLength (clip) {
  if (!clip) return 1
  if (clip.loopLengthBeats > 0.01) return clip.loopLengthBeats
  return Math.max(0.25, clip.lengthBeats || 1)
}

export function clipRepeatCount (clip) {
  const source = clipSourceLength(clip)
  const arranged = Math.max(source, clip.lengthBeats || source)
  if ((clip.loopCount || 1) > 1) return clip.loopCount
  return Math.max(1, Math.round(arranged / source))
}

export function isGroupTrack (track) {
  return !!(track && (track.type === 'group' || track.isGroup))
}

export function isPlayableTrack (track) {
  return !!(track && track.type !== 'master' && !isGroupTrack(track))
}

export function visibleTrackRows (tracks) {
  const list = tracks || []
  const byId = new Map(list.map((track) => [track.id, track]))
  const hidden = new Set()

  list.forEach((track) => {
    let parentId = track.parentId || 0
    let guard = 0
    while (parentId && guard++ < 32) {
      const parent = byId.get(parentId)
      if (!parent) break
      if (parent.collapsed) hidden.add(track.id)
      parentId = parent.parentId || 0
    }
  })

  const rows = []
  list.forEach((track, index) => {
    if (hidden.has(track.id)) return
    if (track.type === 'master') return
    let depth = 0
    let parentId = track.parentId || 0
    while (parentId && depth < 8) {
      const parent = byId.get(parentId)
      if (!parent) break
      depth += 1
      parentId = parent.parentId || 0
    }
    rows.push({ track, index, depth })
  })
  return rows
}

export function childTrackIds (tracks, groupId) {
  return (tracks || []).filter((track) => track.parentId === groupId).map((track) => track.id)
}

export function childTrackIndexes (tracks, groupId) {
  const indexes = []
  ;(tracks || []).forEach((track, index) => {
    if (track.parentId === groupId) indexes.push(index)
  })
  return indexes
}

/** Indexes of a track and every track nested under it, in array order. */
export function subtreeIndexes (tracks, index) {
  const list = tracks || []
  const root = list[index]
  if (!root) return []
  const ids = new Set([root.id])
  let grew = true
  while (grew) {
    grew = false
    list.forEach((track) => {
      if (track.parentId && ids.has(track.parentId) && !ids.has(track.id)) {
        ids.add(track.id)
        grew = true
      }
    })
  }
  const out = []
  list.forEach((track, i) => { if (ids.has(track.id)) out.push(i) })
  return out
}

/**
 * Move the track at `fromIndex` (with everything nested under it) so that it lands at
 * `toIndex`. Returns the new track order plus an old→new index map so clips can follow.
 * The moved track adopts the group of the row it lands under: dropping straight below
 * an open group header joins that group, dropping between two children keeps their group,
 * dropping below the last child of a collapsed group leaves it. Groups never nest by drag.
 */
export function reorderTrackList (tracks, fromIndex, toIndex) {
  const list = (tracks || []).slice()
  const moving = list[fromIndex]
  if (!moving || moving.type === 'master' || fromIndex === toIndex) return null
  const block = subtreeIndexes(list, fromIndex)
  const blockSet = new Set(block)
  let target = Math.max(0, Math.min(list.length - 1, toIndex))
  if (blockSet.has(target)) return null
  // Dropping below a collapsed group means below everything hidden under it as well.
  if (target > fromIndex && isGroupTrack(list[target]) && list[target].collapsed) {
    const tail = subtreeIndexes(list, target)
    target = tail.length ? tail[tail.length - 1] : target
  }
  const rest = []
  const restOld = []
  list.forEach((track, i) => {
    if (blockSet.has(i)) return
    rest.push(track)
    restOld.push(i)
  })
  let insertAt = target - block.filter((i) => i < target).length
  if (target > fromIndex) insertAt += 1
  insertAt = Math.max(0, Math.min(rest.length, insertAt))
  // Master stays first.
  if (rest[0] && rest[0].type === 'master') insertAt = Math.max(1, insertAt)

  const order = rest.slice(0, insertAt).concat(block.map((i) => list[i]), rest.slice(insertAt))
  const indexMap = new Map()
  order.forEach((track, next) => indexMap.set(list.indexOf(track), next))

  const prev = insertAt > 0 ? rest[insertAt - 1] : null
  let parentId = 0
  if (prev && prev.type !== 'master') {
    parentId = isGroupTrack(prev) && !prev.collapsed ? prev.id : (prev.parentId || 0)
    // The row above may be hidden under a collapsed group: visually the drop happened
    // below that group, so the track joins whatever the collapsed group belongs to.
    const byId = new Map(list.map((track) => [track.id, track]))
    let cursor = prev
    let guard = 0
    while (cursor && cursor.parentId && guard++ < 32) {
      const parent = byId.get(cursor.parentId)
      if (!parent) break
      if (parent.collapsed) parentId = parent.parentId || 0
      cursor = parent
    }
  }
  if (isGroupTrack(moving)) parentId = 0
  const patched = order.map((track) => (track === moving ? { ...track, parentId } : track))
  return { order: patched, indexMap, parentId }
}

export function buildCollapsedGroupClip (tracks, clips, groupId) {
  const list = tracks || []
  const groupIndex = list.findIndex((track) => track.id === groupId)
  const group = list[groupIndex]
  if (!group || !isGroupTrack(group)) return null
  const children = new Set(childTrackIndexes(list, groupId))
  const childClips = (clips || []).filter((clip) => children.has(clip.trackIndex))
  if (!childClips.length) return null
  let start = Infinity
  let end = -Infinity
  childClips.forEach((clip) => {
    const cs = clip.startBeat || 0
    start = Math.min(start, cs)
    end = Math.max(end, cs + (clip.lengthBeats || 0))
  })
  if (!Number.isFinite(start)) return null
  const originTick = Math.round(start * 960)
  const notes = []
  childClips.forEach((clip) => {
    const shift = Math.round((clip.startBeat || 0) * 960) - originTick
    ;(clip.notes || []).forEach((note) => {
      const startTick = (note.startTick != null ? note.startTick : Math.round((note.start || 0) * 960)) + shift
      const durationTick = note.durationTick != null ? note.durationTick : Math.round((note.duration || 0.25) * 960)
      notes.push({
        ...note,
        id: clip.id + ':' + (note.id || 0),
        sourceClipId: clip.id,
        sourceNoteId: note.id,
        startTick,
        durationTick,
        start: startTick / 960,
        duration: durationTick / 960
      })
    })
  })
  return {
    id: 'gclip-' + groupId,
    virtual: true,
    midi: true,
    groupId,
    trackIndex: groupIndex,
    startBeat: start,
    lengthBeats: Math.max(0.25, end - start),
    name: group.name,
    colour: group.colour,
    notes,
    sourceClipIds: childClips.map((clip) => clip.id)
  }
}

/**
 * Notes exactly as the clip plays them, in beats relative to the clip start:
 * repeat-mode notes expanded, the loop source tiled up to the arranged length,
 * and everything cropped at the source and clip edges. Playback and the arrange
 * preview both read this so the picture never disagrees with what you hear.
 */
export function clipPlaybackNotes (clip) {
  const notes = (clip && clip.notes) || []
  if (!notes.length) return []
  const source = clipSourceLength(clip)
  const total = Math.max(0.25, (clip && clip.lengthBeats) || source)
  const out = []
  for (let offset = 0, rep = 0; offset < total - MIN_SLICE_BEATS; offset += source, rep++) {
    notes.forEach((note) => {
      if (note.muted) return
      expandRepeats(note).forEach((slice) => {
        const local = noteStartBeat(slice)
        if (local >= source) return
        const start = offset + local
        const end = Math.min(start + noteDurationBeat(slice), offset + source, total)
        if (end - start < MIN_SLICE_BEATS) return
        out.push({
          key: rep + '.' + (note.id || 0) + '.' + Math.round(local * TICKS_PER_BEAT),
          pitch: slice.pitch,
          velocity: slice.velocity,
          start,
          duration: end - start,
          note: slice
        })
      })
    })
  }
  return out
}

/**
 * Arrange preview model: note bars in clip-relative fractions (0..1 of the clip
 * width) and a padded pitch range, so the preview lines up with the timeline.
 */
export function buildClipPreview (clip) {
  const notes = (clip && clip.notes) || []
  const key = previewCacheKey(clip, notes)
  const cached = previewCache.get(key)
  if (cached) return cached

  const played = clipPlaybackNotes(clip)
  const total = Math.max(0.25, (clip && clip.lengthBeats) || clipSourceLength(clip))
  let lo = 127
  let hi = 0
  played.forEach((item) => {
    lo = Math.min(lo, item.pitch)
    hi = Math.max(hi, item.pitch)
  })
  const model = { lo: 0, hi: 0, bars: [] }
  if (played.length) {
    model.lo = Math.max(0, lo - PREVIEW_PITCH_PAD)
    model.hi = Math.min(127, hi + PREVIEW_PITCH_PAD)
    model.bars = played.map((item) => ({
      x0: item.start / total,
      x1: (item.start + item.duration) / total,
      pitch: item.pitch,
      alpha: 0.45 + Math.min(127, item.velocity || 80) / 254
    }))
  }

  if (previewCache.size > 4000) previewCache.clear()
  previewCache.set(key, model)
  return model
}

export function invalidateClipPreview (clipId) {
  const prefix = String(clipId) + ':'
  Array.from(previewCache.keys()).forEach((key) => {
    const text = String(key)
    // Collapsed group previews are built from their children's notes.
    if (text.startsWith(prefix) || text.startsWith('gclip-')) previewCache.delete(key)
  })
}

export function clearClipPreviewCache () {
  previewCache.clear()
}

export function relativeClipOffsets (clips) {
  if (!clips.length) return []
  const origin = Math.min.apply(null, clips.map((clip) => clip.startBeat || 0))
  return clips.map((clip) => ({
    clip,
    startDelta: (clip.startBeat || 0) - origin,
    trackIndex: clip.trackIndex
  }))
}

export function quantizeClipStart (startBeat, snap, gridBeats) {
  if (!snap || !gridBeats) return Math.max(0, startBeat)
  return Math.max(0, Math.round(startBeat / gridBeats) * gridBeats)
}
