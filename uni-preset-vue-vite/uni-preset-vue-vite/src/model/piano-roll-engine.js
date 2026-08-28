import {
  PPQ,
  MIN_DURATION_TICKS,
  MAX_PITCH,
  MIN_PITCH,
  SNAP_PRESETS,
  isBlackKey,
  pitchName,
  snapTick,
  ticksPerBar,
  timeSignatureAtTick,
  noteEndTick,
  DEFAULT_DURATION_TICKS
} from './note-model.js'

export const MIN_PX_PER_BEAT = 12
export const MAX_PX_PER_BEAT = 280
export const MIN_PX_PER_SEMITONE = 8
export const MAX_PX_PER_SEMITONE = 28

export function defaultView (partial = {}) {
  return {
    scrollX: 0,
    scrollY: 0,
    pixelsPerBeat: 48,
    pixelsPerSemitone: 14,
    keyboardWidth: 68,
    timelineHeight: 22,
    markerHeight: 18,
    velocityHeight: 56,
    tool: 'draw',
    snapId: '1/16',
    lastDurationTicks: DEFAULT_DURATION_TICKS,
    freeSnap: false,
    ...partial
  }
}

export function snapPreset (id) {
  return SNAP_PRESETS.find((item) => item.id === id) || SNAP_PRESETS[3]
}

export function gridTicksForView (view, beatsPerBar = 4) {
  const preset = snapPreset(view.snapId)
  if (preset.id === 'bar') return ticksPerBar(beatsPerBar, 4)
  return preset.ticks
}

export function clampZoom (view) {
  view.pixelsPerBeat = Math.min(MAX_PX_PER_BEAT, Math.max(MIN_PX_PER_BEAT, view.pixelsPerBeat))
  view.pixelsPerSemitone = Math.min(MAX_PX_PER_SEMITONE, Math.max(MIN_PX_PER_SEMITONE, view.pixelsPerSemitone))
  return view
}

export function contentHeight () {
  return (MAX_PITCH - MIN_PITCH + 1)
}

export function pitchToY (pitch, view) {
  return (MAX_PITCH - pitch) * view.pixelsPerSemitone - view.scrollY
}

export function yToPitch (y, view) {
  const row = Math.floor((y + view.scrollY) / view.pixelsPerSemitone)
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, MAX_PITCH - row))
}

export function tickToX (tick, view) {
  return (tick / PPQ) * view.pixelsPerBeat - view.scrollX
}

export function xToTick (x, view, { snap = true, free = false } = {}) {
  const tick = Math.max(0, Math.round(((x + view.scrollX) / view.pixelsPerBeat) * PPQ))
  if (!snap) return tick
  return snapTick(tick, gridTicksForView(view), free || view.freeSnap)
}

export function noteRect (note, view) {
  const x = tickToX(note.startTick || 0, view)
  const y = pitchToY(note.pitch, view) + 1
  const w = Math.max(3, ((note.durationTick || MIN_DURATION_TICKS) / PPQ) * view.pixelsPerBeat)
  const h = Math.max(3, view.pixelsPerSemitone - 2)
  return { x, y, w, h, right: x + w, bottom: y + h }
}

export function hitNote (notes, x, y, view, edge = 8) {
  const list = notes || []
  for (let i = list.length - 1; i >= 0; i--) {
    const r = noteRect(list[i], view)
    if (x >= r.x && x <= r.right && y >= r.y && y <= r.bottom) {
      const zone = Math.max(8, Math.min(edge, Math.max(10, r.w * 0.38)))
      const resize = r.w >= 10 && x >= r.right - zone
      return { note: list[i], index: i, resize }
    }
  }
  return null
}

export function notesInRect (notes, rect, view) {
  const x0 = Math.min(rect.x, rect.x + rect.w)
  const y0 = Math.min(rect.y, rect.y + rect.h)
  const x1 = Math.max(rect.x, rect.x + rect.w)
  const y1 = Math.max(rect.y, rect.y + rect.h)
  return (notes || []).filter((note) => {
    const r = noteRect(note, view)
    return r.right >= x0 && r.x <= x1 && r.bottom >= y0 && r.y <= y1
  })
}

export function viewportTicks (width, view) {
  const startTick = Math.max(0, Math.floor((view.scrollX / view.pixelsPerBeat) * PPQ))
  const endTick = startTick + Math.ceil((width / view.pixelsPerBeat) * PPQ) + PPQ
  return { startTick, endTick }
}

export function viewportPitches (height, view) {
  const top = yToPitch(0, view)
  const bottom = yToPitch(height, view)
  return { maxPitch: Math.max(top, bottom), minPitch: Math.min(top, bottom) }
}

export function defaultDurationTicks (view) {
  const last = view && view.lastDurationTicks
  if (last > 0) return Math.max(MIN_DURATION_TICKS, Math.round(last))
  return Math.max(MIN_DURATION_TICKS, DEFAULT_DURATION_TICKS)
}

export function subdivisionTicks (pixelsPerBeat, timeSig) {
  const bar = ticksPerBar(timeSig.numerator, timeSig.denominator)
  const beat = Math.round((PPQ * 4) / Math.max(1, timeSig.denominator))
  const pxPerBeat = Math.max(1, pixelsPerBeat)
  let sub = bar
  if (pxPerBeat >= 8) sub = beat
  if (pxPerBeat >= 22) sub = beat / 2
  if (pxPerBeat >= 40) sub = beat / 4
  if (pxPerBeat >= 72) sub = beat / 8
  if (pxPerBeat >= 120) sub = beat / 16
  return { bar, beat, sub: Math.max(1, Math.round(sub)) }
}

export function iterateGridLines (startTick, endTick, pixelsPerBeat, timeSignatures, fallbackSig, each) {
  const fallback = fallbackSig || { numerator: 4, denominator: 4 }
  let tick = Math.max(0, startTick)
  const sig0 = timeSignatureAtTick(timeSignatures, tick, fallback)
  const { bar, beat, sub } = subdivisionTicks(pixelsPerBeat, sig0)
  const first = Math.floor(tick / sub) * sub
  for (let t = first; t <= endTick; t += sub) {
    const sig = timeSignatureAtTick(timeSignatures, t, fallback)
    const barTicks = ticksPerBar(sig.numerator, sig.denominator)
    const beatTicks = Math.round((PPQ * 4) / Math.max(1, sig.denominator))
    const origin = sig.timeTick || 0
    const inBar = ((t - origin) % barTicks + barTicks) % barTicks === 0
    const inBeat = ((t - origin) % beatTicks + beatTicks) % beatTicks === 0
    each(t, inBar ? 'bar' : (inBeat ? 'beat' : 'sub'), sig)
  }
  return { bar, beat, sub }
}

export function clampScroll (view, contentWidth, viewportWidth, viewportHeight) {
  const maxX = Math.max(0, contentWidth - viewportWidth)
  const maxY = Math.max(0, contentHeight() * view.pixelsPerSemitone - viewportHeight)
  view.scrollX = Math.min(maxX, Math.max(0, view.scrollX))
  view.scrollY = Math.min(maxY, Math.max(0, view.scrollY))
  return view
}

/** Scroll/zoom the piano-roll viewport so existing notes (or middle C) are visible. */
export function fitViewToNotes (view, notes, viewportWidth, viewportHeight, clipLengthBeats = 8) {
  clampZoom(view)
  const gridW = Math.max(1, viewportWidth)
  const gridH = Math.max(1, viewportHeight)
  const list = notes || []

  if (!list.length) {
    const pitch = 60
    view.scrollY = Math.max(0, (MAX_PITCH - pitch) * view.pixelsPerSemitone - gridH * 0.45)
    view.scrollX = 0
    const contentW = Math.max(gridW, clipLengthBeats * view.pixelsPerBeat + 80)
    clampScroll(view, contentW, gridW, gridH)
    return view
  }

  let minPitch = MAX_PITCH
  let maxPitch = MIN_PITCH
  let startTick = Infinity
  let endTick = 0
  list.forEach((note) => {
    minPitch = Math.min(minPitch, note.pitch || 60)
    maxPitch = Math.max(maxPitch, note.pitch || 60)
    startTick = Math.min(startTick, note.startTick || 0)
    endTick = Math.max(endTick, noteEndTick(note))
  })
  minPitch = Math.max(MIN_PITCH, minPitch - 3)
  maxPitch = Math.min(MAX_PITCH, maxPitch + 3)
  const spanPx = (maxPitch - minPitch + 1) * view.pixelsPerSemitone
  view.scrollY = Math.max(0, (MAX_PITCH - maxPitch) * view.pixelsPerSemitone - Math.max(0, (gridH - spanPx) / 2))
  view.scrollX = Math.max(0, (startTick / PPQ) * view.pixelsPerBeat - 24)
  const contentW = Math.max(gridW, Math.max((endTick / PPQ) * view.pixelsPerBeat + 80, clipLengthBeats * view.pixelsPerBeat + 80))
  clampScroll(view, contentW, gridW, gridH)
  return view
}

export function zoomAt (view, { h = 1, v = 1, anchorX = 0, anchorY = 0 }) {
  const tick = xToTick(anchorX, view, { snap: false })
  const pitch = yToPitch(anchorY, view)
  view.pixelsPerBeat *= h
  view.pixelsPerSemitone *= v
  clampZoom(view)
  view.scrollX = (tick / PPQ) * view.pixelsPerBeat - anchorX
  view.scrollY = (MAX_PITCH - pitch) * view.pixelsPerSemitone - anchorY
  return view
}

export function keyboardLabel (pitch, pxPerSemitone) {
  if (pxPerSemitone < 10 && pitch % 12 !== 0) return ''
  if (pitch % 12 === 0) return pitchName(pitch, { octaveOnlyC: true })
  return ''
}

export { isBlackKey, noteEndTick, pitchName }
