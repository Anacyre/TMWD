import {
  PPQ,
  isBlackKey,
  pitchName,
  isScalePitch,
  visibleNotes,
  noteEndTick,
  midiVelocity
} from './note-model.js'
import {
  tickToX,
  noteRect,
  viewportTicks,
  viewportPitches,
  iterateGridLines
} from './piano-roll-engine.js'

/** The desktop / LE look. Every colour the renderer paints comes from a theme. */
export const DEFAULT_THEME = {
  font: 'sans-serif',
  markerHeight: 16,
  bg: '#121212',
  markerLine: '#4a4a4a',
  markerText: '#8d8d8d',
  timeline: '#161616',
  barTick: '#555',
  barText: '#8d8d8d',
  beatTick: '#3a3a3a',
  loopBand: 'rgba(77,163,255,0.12)',
  playhead: '#fff',
  keyBg: '#0e0e0e',
  keyHeld: '#4da3ff',
  keyBlack: '#2a2a2a',
  keyBlackOut: '#121212',
  keyWhite: '#e8e8e8',
  keyWhiteOut: '#7a7a7a',
  keyLabel: '#5a5a5a',
  keyLabelHeld: '#fff',
  keyOctave: 'rgba(255,255,255,0.06)',
  rowC: '#1c2430',
  rowCOut: '#181818',
  rowBlack: '#151c26',
  rowBlackOut: '#101010',
  rowWhite: '#1a222c',
  rowWhiteOut: '#161616',
  rowLine: '#202020',
  gridBar: '#2c2c2c',
  gridBeat: '#222222',
  gridSub: '#161616',
  loopFill: 'rgba(77,163,255,0.04)',
  ghost: 'rgba(255,255,255,0.08)',
  noteRadius: 3,
  noteLight: 0.42,
  noteVelLight: 0.38,
  noteStroke: 'rgba(255,255,255,0.16)',
  noteSelected: '#e8e8e8',
  noteGrip: 'rgba(255,255,255,0.22)',
  rubberFill: 'rgba(77,163,255,0.12)',
  rubberLine: 'rgba(77,163,255,0.7)',
  playheadLine: 'rgba(255,255,255,0.85)',
  divider: '#2a2a2a',
  laneBg: '#121212',
  laneLabel: '#6a6a6a',
  velocity: '#4da3ff',
  velocitySelected: '#7ec0ff',
  expression: 'rgba(126,192,255,0.85)',
  expressionDot: '#7ec0ff'
}

/** Lite: one dark ground, hairline grid, lighter notes. No marker strip. */
export const LITE_THEME = {
  ...DEFAULT_THEME,
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  markerHeight: 0,
  bg: '#0b0c0e',
  timeline: '#0b0c0e',
  barTick: 'rgba(255,255,255,0.18)',
  barText: '#8b8e96',
  beatTick: 'rgba(255,255,255,0.08)',
  loopBand: 'rgba(106,168,255,0.14)',
  playhead: '#ececee',
  keyBg: '#0b0c0e',
  keyHeld: '#6aa8ff',
  keyBlack: '#1d1f24',
  keyBlackOut: '#121317',
  keyWhite: '#d8d9dc',
  keyWhiteOut: '#6f7178',
  keyLabel: '#6f7178',
  keyLabelHeld: '#0b0c0e',
  keyOctave: 'rgba(0,0,0,0.25)',
  rowC: '#15171b',
  rowCOut: '#111215',
  rowBlack: '#0e0f12',
  rowBlackOut: '#0c0d0f',
  rowWhite: '#131418',
  rowWhiteOut: '#101114',
  rowLine: 'rgba(255,255,255,0.025)',
  gridBar: 'rgba(255,255,255,0.12)',
  gridBeat: 'rgba(255,255,255,0.055)',
  gridSub: 'rgba(255,255,255,0.022)',
  loopFill: 'rgba(106,168,255,0.035)',
  ghost: 'rgba(255,255,255,0.06)',
  noteRadius: 4,
  noteLight: 0.62,
  noteVelLight: 0.38,
  noteStroke: 'rgba(255,255,255,0.12)',
  noteSelected: '#ffffff',
  noteGrip: 'rgba(255,255,255,0.35)',
  rubberFill: 'rgba(106,168,255,0.12)',
  rubberLine: 'rgba(106,168,255,0.8)',
  playheadLine: 'rgba(236,236,238,0.9)',
  divider: 'rgba(255,255,255,0.06)'
}

export function resizeCanvas (canvas, cssWidth, cssHeight) {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  const w = Math.max(1, Math.floor(cssWidth * dpr))
  const h = Math.max(1, Math.floor(cssHeight * dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return dpr
}

function fillRound (ctx, x, y, w, h, r) {
  roundPath(ctx, x, y, w, h, r)
  ctx.fill()
}

function roundPath (ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export function drawPianoRoll (ctx, state) {
  const {
    width, height, view, notes, ghostNotes, selectedIds, clip,
    timeSignatures, timeSig, markers, loopStart, loopEnd, playheadBeat,
    clipStartBeat, scaleKey, scaleName, scaleGuide, velocityOpen,
    keyboardOpen, rubber, hoverPitch, expressionPoints
  } = state
  const t = state.theme || DEFAULT_THEME

  const markerH = t.markerHeight
  const timelineH = view.timelineHeight || 22
  const keyW = keyboardOpen === false ? 10 : (view.keyboardWidth || 68)
  const velH = velocityOpen ? (view.velocityHeight || 56) : 0
  const gridX = keyW
  const gridY = markerH + timelineH
  const gridW = Math.max(1, width - gridX)
  const gridH = Math.max(1, height - gridY - velH)
  const velY = gridY + gridH

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = t.bg
  ctx.fillRect(0, 0, width, height)

  if (markerH > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, width, markerH)
    ctx.clip()
    drawMarkers(ctx, width, markerH, view, markers, clipStartBeat, gridX, t)
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(gridX, markerH, gridW, timelineH)
  ctx.clip()
  drawTimeline(ctx, gridX, markerH, gridW, timelineH, view, timeSignatures, timeSig, clipStartBeat, loopStart, loopEnd, playheadBeat, t)
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, gridY, keyW, gridH)
  ctx.clip()
  drawKeyboard(ctx, keyW, gridY, gridH, view, hoverPitch, keyboardOpen !== false, scaleKey, scaleName, scaleGuide, t)
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(gridX, gridY, gridW, gridH)
  ctx.clip()
  ctx.translate(gridX, gridY)
  drawGrid(ctx, gridW, gridH, view, timeSignatures, timeSig, scaleKey, scaleName, scaleGuide, t)
  drawLoop(ctx, gridH, view, loopStart, loopEnd, clipStartBeat, t)
  const vis = cull(notes, ghostNotes, gridW, gridH, view)
  drawGhosts(ctx, vis.ghosts, view, t)
  drawNotes(ctx, vis.notes, view, selectedIds, clip, t)
  drawRubber(ctx, rubber, gridX, gridY, t)
  drawPlayhead(ctx, gridH, view, playheadBeat, clipStartBeat, t)
  ctx.restore()

  if (velH > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(gridX, velY, gridW, velH)
    ctx.clip()
    if (expressionPoints) drawExpression(ctx, gridX, velY, gridW, velH, view, expressionPoints, t)
    else drawVelocity(ctx, gridX, velY, gridW, velH, vis.notes, view, selectedIds, t)
    ctx.restore()
  }

  ctx.fillStyle = t.divider
  ctx.fillRect(keyW - 1, gridY, 1, gridH + velH)
  ctx.fillRect(0, gridY - 1, width, 1)
  if (velH > 0) ctx.fillRect(0, velY, width, 1)

  return { gridX, gridY, gridW, gridH, velY, velH, keyW, markerH, timelineH }
}

function cull (notes, ghosts, width, height, view) {
  const ticks = viewportTicks(width, view)
  const pitches = viewportPitches(height, view)
  const viewBox = { ...ticks, ...pitches }
  return {
    notes: visibleNotes(notes || [], viewBox),
    ghosts: visibleNotes(ghosts || [], viewBox)
  }
}

function drawMarkers (ctx, width, height, view, markers, clipStartBeat, gridX, t) {
  ctx.fillStyle = t.bg
  ctx.fillRect(0, 0, width, height)
  ctx.font = '10px ' + t.font
  ;(markers || []).forEach((marker) => {
    const beat = (marker.startBeat != null ? marker.startBeat : 0) - (clipStartBeat || 0)
    const x = gridX + (beat * view.pixelsPerBeat) - view.scrollX
    if (x < 0 || x > width) return
    ctx.fillStyle = t.markerLine
    ctx.fillRect(x, 3, 1, height - 4)
    ctx.fillStyle = t.markerText
    ctx.fillText(marker.name || marker.mode || '', x + 4, 12)
  })
}

function drawTimeline (ctx, x, y, w, h, view, timeSignatures, timeSig, clipStartBeat, loopStart, loopEnd, playheadBeat, t) {
  ctx.fillStyle = t.timeline
  ctx.fillRect(x, y, w, h)
  const startTick = Math.max(0, Math.floor((view.scrollX / view.pixelsPerBeat) * PPQ))
  const endTick = startTick + Math.ceil((w / view.pixelsPerBeat) * PPQ)
  ctx.font = '10px ' + t.font
  const labelY = y + Math.min(13, h - 6)
  iterateGridLines(startTick, endTick, view.pixelsPerBeat, timeSignatures, timeSig, (tick, kind, sig) => {
    const px = x + tickToX(tick, view)
    if (kind === 'bar') {
      ctx.fillStyle = t.barTick
      ctx.fillRect(px, y + 4, 1, h - 5)
      const absBeat = (clipStartBeat || 0) + tick / PPQ
      const bar = Math.floor(absBeat / Math.max(1, sig.numerator)) + 1
      ctx.fillStyle = t.barText
      ctx.fillText(String(bar), px + 4, labelY)
    } else if (kind === 'beat') {
      ctx.fillStyle = t.beatTick
      ctx.fillRect(px, y + 12, 1, h - 13)
    }
  })
  const loopX0 = x + ((loopStart - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  const loopX1 = x + ((loopEnd - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  ctx.fillStyle = t.loopBand
  ctx.fillRect(loopX0, y, Math.max(2, loopX1 - loopX0), h)
  const playX = x + (((playheadBeat || 0) - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  ctx.fillStyle = t.playhead
  ctx.fillRect(playX, y, 1, h)
  ctx.beginPath()
  ctx.moveTo(playX - 4, y + 2)
  ctx.lineTo(playX + 4, y + 2)
  ctx.lineTo(playX, y + 8)
  ctx.closePath()
  ctx.fill()
}

function drawKeyboard (ctx, width, y0, height, view, hoverPitch, showLabels, scaleKey, scaleName, scaleGuide, t) {
  ctx.fillStyle = t.keyBg
  ctx.fillRect(0, y0, width, height)
  const first = Math.floor(view.scrollY / view.pixelsPerSemitone)
  const last = first + Math.ceil(height / view.pixelsPerSemitone) + 1
  ctx.font = Math.min(10, view.pixelsPerSemitone - 1) + 'px ' + t.font
  for (let i = first; i <= last; i++) {
    const pitch = 127 - i
    if (pitch < 0 || pitch > 127) continue
    const y = y0 + i * view.pixelsPerSemitone - view.scrollY
    const black = isBlackKey(pitch)
    const held = pitch === hoverPitch
    const inScale = !scaleGuide || isScalePitch(pitch, scaleKey, scaleName)
    ctx.fillStyle = held ? t.keyHeld : (black
      ? (inScale ? t.keyBlack : t.keyBlackOut)
      : (inScale ? t.keyWhite : t.keyWhiteOut))
    ctx.fillRect(0, y, black ? width * 0.62 : width - 1, view.pixelsPerSemitone - 1)
    if (showLabels && pitch % 12 === 0 && view.pixelsPerSemitone >= 10) {
      ctx.fillStyle = held ? t.keyLabelHeld : t.keyLabel
      ctx.textAlign = 'right'
      ctx.fillText(pitchName(pitch), width - 6, y + view.pixelsPerSemitone - 3)
      ctx.textAlign = 'left'
    }
    if (pitch % 12 === 0) {
      ctx.fillStyle = t.keyOctave
      ctx.fillRect(0, y, width, 1)
    }
  }
}

function drawGrid (ctx, width, height, view, timeSignatures, timeSig, scaleKey, scaleName, scaleGuide, t) {
  const first = Math.floor(view.scrollY / view.pixelsPerSemitone)
  const last = first + Math.ceil(height / view.pixelsPerSemitone) + 1
  for (let i = first; i <= last; i++) {
    const pitch = 127 - i
    const y = i * view.pixelsPerSemitone - view.scrollY
    const inScale = !scaleGuide || isScalePitch(pitch, scaleKey, scaleName)
    if (pitch % 12 === 0) ctx.fillStyle = inScale ? t.rowC : t.rowCOut
    else if (isBlackKey(pitch)) ctx.fillStyle = inScale ? t.rowBlack : t.rowBlackOut
    else ctx.fillStyle = inScale ? t.rowWhite : t.rowWhiteOut
    ctx.fillRect(0, y, width, view.pixelsPerSemitone)
    ctx.fillStyle = t.rowLine
    ctx.fillRect(0, y, width, 1)
  }
  const startTick = Math.max(0, Math.floor((view.scrollX / view.pixelsPerBeat) * PPQ))
  const endTick = startTick + Math.ceil((width / view.pixelsPerBeat) * PPQ)
  iterateGridLines(startTick, endTick, view.pixelsPerBeat, timeSignatures, timeSig, (tick, kind) => {
    const x = tickToX(tick, view)
    ctx.fillStyle = kind === 'bar' ? t.gridBar : (kind === 'beat' ? t.gridBeat : t.gridSub)
    ctx.fillRect(x, 0, 1, height)
  })
}

function drawLoop (ctx, height, view, loopStart, loopEnd, clipStartBeat, t) {
  const x0 = ((loopStart - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  const x1 = ((loopEnd - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  ctx.fillStyle = t.loopFill
  ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height)
}

function drawGhosts (ctx, notes, view, t) {
  notes.forEach((note) => {
    const r = noteRect(note, view)
    ctx.fillStyle = t.ghost
    fillRound(ctx, r.x, r.y, r.w, r.h, 2)
  })
}

function drawNotes (ctx, notes, view, selectedIds, clip, t) {
  const base = clip && clip.colour ? clip.colour : '#5f9ea0'
  const radius = t.noteRadius
  notes.forEach((note) => {
    const r = noteRect(note, view)
    const vel = midiVelocity(note.velocity) / 127
    const selected = selectedIds && selectedIds.has && selectedIds.has(note.id)
    ctx.globalAlpha = note.muted ? 0.32 : 1
    ctx.fillStyle = shade(base, t.noteLight + vel * t.noteVelLight)
    fillRound(ctx, r.x, r.y, r.w, r.h, radius)
    ctx.strokeStyle = selected ? t.noteSelected : t.noteStroke
    ctx.lineWidth = selected ? 1.5 : 1
    roundPath(ctx, r.x, r.y, r.w, r.h, radius)
    ctx.stroke()
    if (r.w > 14) {
      ctx.fillStyle = t.noteGrip
      ctx.fillRect(r.right - 5, r.y + 3, 2, Math.max(2, r.h - 6))
    }
    ctx.globalAlpha = 1
  })
}

function drawRubber (ctx, rubber, gridX, gridY, t) {
  if (!rubber) return
  ctx.fillStyle = t.rubberFill
  ctx.strokeStyle = t.rubberLine
  ctx.lineWidth = 1
  ctx.fillRect(rubber.x - gridX, rubber.y - gridY, rubber.w, rubber.h)
  ctx.strokeRect(rubber.x - gridX, rubber.y - gridY, rubber.w, rubber.h)
}

function drawPlayhead (ctx, height, view, playheadBeat, clipStartBeat, t) {
  const x = (((playheadBeat || 0) - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  ctx.fillStyle = t.playheadLine
  ctx.fillRect(x, 0, 1, height)
}

function drawVelocity (ctx, x0, y0, width, height, notes, view, selectedIds, t) {
  ctx.fillStyle = t.laneBg
  ctx.fillRect(x0, y0, width, height)
  ctx.fillStyle = t.laneLabel
  ctx.font = '9px ' + t.font
  ctx.fillText('VELOCITY', x0 + 8, y0 + 12)
  notes.forEach((note) => {
    const x = x0 + tickToX(note.startTick || 0, view)
    const vel = midiVelocity(note.velocity)
    const h = Math.max(2, (vel / 127) * (height - 16))
    const selected = selectedIds && selectedIds.has && selectedIds.has(note.id)
    ctx.fillStyle = selected ? t.velocitySelected : t.velocity
    ctx.globalAlpha = note.muted ? 0.3 : 0.9
    ctx.fillRect(x, y0 + height - 4 - h, 5, h)
    ctx.globalAlpha = 1
  })
}

function drawExpression (ctx, x0, y0, width, height, view, points, t) {
  ctx.fillStyle = t.laneBg
  ctx.fillRect(x0, y0, width, height)
  ctx.fillStyle = t.laneLabel
  ctx.font = '9px ' + t.font
  ctx.fillText('EXPRESSION', x0 + 8, y0 + 12)
  const lane = (points || []).slice().sort((a, b) => a.t - b.t)
  if (!lane.length) return
  ctx.beginPath()
  lane.forEach((p, i) => {
    const x = x0 + (p.t * view.pixelsPerBeat) - view.scrollX
    const y = y0 + height - 4 - (p.v / 127) * (height - 16)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = t.expression
  ctx.lineWidth = 1.5
  ctx.stroke()
  lane.forEach((p) => {
    const x = x0 + (p.t * view.pixelsPerBeat) - view.scrollX
    const y = y0 + height - 4 - (p.v / 127) * (height - 16)
    ctx.fillStyle = t.expressionDot
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  })
}

export function shade (hex, amount) {
  const value = String(hex || '#5f9ea0').replace('#', '')
  const n = parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16)
  if (!Number.isFinite(n)) return '#5f9ea0'
  const r = Math.min(255, Math.round(((n >> 16) & 255) * amount))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * amount))
  const b = Math.min(255, Math.round((n & 255) * amount))
  return 'rgb(' + r + ',' + g + ',' + b + ')'
}

export { noteEndTick }
