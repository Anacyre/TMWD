/**
 * Arrange-view gesture math, shared by the desktop playlist and the Lite
 * arrange view. Everything here is pure: callers pass beats, rows and a snap
 * function and get positions back.
 */

export const MIN_CLIP_BEATS = 0.25
/** The ruler always lands on 1/32 notes, independent of the edit snap. */
export const RULER_SNAP_BEATS = 0.125

export function snapTo (beat, grid) {
  if (!grid || grid <= 0) return Math.max(0, beat)
  return Math.max(0, Math.round(beat / grid) * grid)
}

/** Which part of a clip a press landed on: its left edge, right edge or body. */
export function clipEdgeAt (localX, width, pad = 18) {
  const edge = Math.min(pad, width / 3)
  if (localX < edge) return 'left'
  if (localX > width - edge) return 'right'
  return 'move'
}

/**
 * New position for each dragged clip.
 * originals: [{ id, start, length, row }] with row = visual row index.
 * Returns [{ id, start, length, row }]; row is clamped to the visible rows and
 * left untouched when `canDrop(row)` refuses it.
 */
export function applyClipDrag (originals, {
  edge = 'move',
  deltaBeats = 0,
  deltaRows = 0,
  snap = (beat) => beat,
  rowCount = 1,
  canDrop = () => true
} = {}) {
  if (edge === 'right') {
    return originals.map((orig) => {
      const end = snap(orig.start + orig.length + deltaBeats)
      return { ...orig, length: Math.max(MIN_CLIP_BEATS, end - orig.start) }
    })
  }
  let minStart = Infinity
  let minRow = Infinity
  let maxRow = -Infinity
  let maxPush = Infinity
  originals.forEach((orig) => {
    if (orig.start < minStart) minStart = orig.start
    if (edge === 'left') maxPush = Math.min(maxPush, orig.length - MIN_CLIP_BEATS)
    if (orig.row != null) {
      if (orig.row < minRow) minRow = orig.row
      if (orig.row > maxRow) maxRow = orig.row
    }
  })
  let delta = snap(minStart + deltaBeats) - minStart
  if (edge === 'left' && delta > maxPush) delta = maxPush
  if (minStart + delta < 0) delta = -minStart
  let rowDelta = 0
  if (edge === 'move' && minRow !== Infinity && deltaRows) {
    rowDelta = deltaRows
    if (minRow + rowDelta < 0) rowDelta = -minRow
    if (maxRow + rowDelta > rowCount - 1) rowDelta = (rowCount - 1) - maxRow
    if (originals.some((orig) => orig.row != null && !canDrop(orig.row + rowDelta))) rowDelta = 0
  }
  return originals.map((orig) => ({
    ...orig,
    start: orig.start + delta,
    length: edge === 'left' ? orig.length - delta : orig.length,
    row: orig.row == null || edge !== 'move' ? orig.row : orig.row + rowDelta
  }))
}

/** Clip ids inside a rubber band given in content pixels. */
export function clipsInBand (clips, band, { pixelsPerBeat, rowHeight, rowOf }) {
  const left = Math.min(band.x0, band.x1) / pixelsPerBeat
  const right = Math.max(band.x0, band.x1) / pixelsPerBeat
  const top = Math.min(band.y0, band.y1)
  const bottom = Math.max(band.y0, band.y1)
  return clips.filter((clip) => {
    const row = rowOf(clip)
    if (row == null) return false
    const y = row * rowHeight
    const start = clip.startBeat || 0
    return start < right && start + (clip.lengthBeats || 0) > left && y < bottom && y + rowHeight > top
  }).map((clip) => clip.id)
}

/**
 * Two-finger pan and zoom. Given the gesture start and the current pair of
 * touches, return the new zoom and scroll so the point under the fingers stays put.
 */
export function pinchView (start, now, { minPpb = 4, maxPpb = 240 } = {}) {
  const span0 = Math.max(24, Math.abs(start.x1 - start.x0))
  const span = Math.max(24, Math.abs(now.x1 - now.x0))
  const mid0 = (start.x0 + start.x1) / 2
  const mid = (now.x0 + now.x1) / 2
  const midY0 = (start.y0 + start.y1) / 2
  const midY = (now.y0 + now.y1) / 2
  const ppb = Math.min(maxPpb, Math.max(minPpb, start.ppb * span / span0))
  const anchorBeat = (start.scrollX + mid0 - start.left) / start.ppb
  return {
    ppb,
    scrollX: Math.max(0, anchorBeat * ppb - (mid - start.left)),
    scrollY: Math.max(0, start.scrollY - (midY - midY0))
  }
}
