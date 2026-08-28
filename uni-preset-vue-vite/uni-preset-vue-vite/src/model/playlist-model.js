import { TICKS_PER_BEAT } from './timeline.js'

const PREVIEW_COLS = 24
const PREVIEW_ROWS = 8
const previewCache = new Map()

function noteStartBeat (note) {
  if (note.start != null) return Math.max(0, note.start)
  return Math.max(0, (note.startTick || 0) / TICKS_PER_BEAT)
}

function noteDurationBeat (note) {
  if (note.duration != null) return Math.max(0.02, note.duration)
  return Math.max(0.02, (note.durationTick || 240) / TICKS_PER_BEAT)
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
    note.velocity || 0
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

export function buildClipPreview (clip) {
  const notes = (clip && clip.notes) || []
  const key = previewCacheKey(clip, notes)
  const cached = previewCache.get(key)
  if (cached) return cached

  const cols = new Array(PREVIEW_COLS).fill(0).map(() => new Array(PREVIEW_ROWS).fill(0))
  const source = clipSourceLength(clip)
  if (!notes.length) {
    previewCache.set(key, cols)
    return cols
  }

  let lo = 127
  let hi = 0
  notes.forEach((note) => {
    lo = Math.min(lo, note.pitch)
    hi = Math.max(hi, note.pitch)
  })
  const span = Math.max(1, hi - lo)

  notes.forEach((note) => {
    const start = noteStartBeat(note)
    const duration = noteDurationBeat(note)
    const x0 = Math.floor((start / source) * PREVIEW_COLS)
    const x1 = Math.min(PREVIEW_COLS - 1, Math.floor(((start + duration) / source) * PREVIEW_COLS))
    const row = Math.min(PREVIEW_ROWS - 1, Math.floor(((note.pitch - lo) / span) * (PREVIEW_ROWS - 1)))
    for (let x = Math.max(0, x0); x <= x1; x++) cols[x][row] = Math.max(cols[x][row], 0.35 + (note.velocity || 80) / 220)
  })

  if (previewCache.size > 4000) previewCache.clear()
  previewCache.set(key, cols)
  return cols
}

export function invalidateClipPreview (clipId) {
  const prefix = String(clipId) + ':'
  Array.from(previewCache.keys()).forEach((key) => {
    if (String(key).startsWith(prefix)) previewCache.delete(key)
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
