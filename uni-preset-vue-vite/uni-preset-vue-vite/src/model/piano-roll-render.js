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
  pitchToY,
  noteRect,
  viewportTicks,
  viewportPitches,
  iterateGridLines
} from './piano-roll-engine.js'

const COLOR_META = [
  '#8aa4b8', '#8a9a8a', '#b8a48a', '#9a8ab8',
  '#a48a8a', '#8ab4b0', '#b8b08a', '#8a8a9a',
  '#7a90a8', '#90a07a', '#a8907a', '#9078a0',
  '#a07878', '#78a09c', '#a89c78', '#787888'
]

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
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
  ctx.fill()
}

export function drawPianoRoll (ctx, state) {
  const {
    width, height, view, notes, ghostNotes, selectedIds, clip,
    timeSignatures, timeSig, markers, loopStart, loopEnd, playheadBeat,
    clipStartBeat, scaleKey, scaleName, scaleGuide, velocityOpen,
    keyboardOpen, rubber, hoverPitch, expressionPoints
  } = state

  const markerH = 16
  const timelineH = view.timelineHeight || 22
  const keyW = keyboardOpen === false ? 10 : (view.keyboardWidth || 68)
  const velH = velocityOpen ? (view.velocityHeight || 56) : 0
  const gridX = keyW
  const gridY = markerH + timelineH
  const gridW = Math.max(1, width - gridX)
  const gridH = Math.max(1, height - gridY - velH)
  const velY = gridY + gridH

  ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#121212'
    ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, width, markerH)
  ctx.clip()
  drawMarkers(ctx, width, markerH, view, markers, clipStartBeat, gridX)
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(gridX, markerH, gridW, timelineH)
  ctx.clip()
  drawTimeline(ctx, gridX, markerH, gridW, timelineH, view, timeSignatures, timeSig, clipStartBeat, loopStart, loopEnd, playheadBeat)
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, gridY, keyW, gridH)
  ctx.clip()
  drawKeyboard(ctx, keyW, gridY, gridH, view, hoverPitch, keyboardOpen !== false, scaleKey, scaleName, scaleGuide)
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(gridX, gridY, gridW, gridH)
  ctx.clip()
  ctx.translate(gridX, gridY)
  drawGrid(ctx, gridW, gridH, view, timeSignatures, timeSig, scaleKey, scaleName, scaleGuide)
  drawLoop(ctx, gridH, view, loopStart, loopEnd, clipStartBeat)
  const vis = cull(notes, ghostNotes, gridW, gridH, view)
  drawGhosts(ctx, vis.ghosts, view)
  drawNotes(ctx, vis.notes, view, selectedIds, clip)
  drawRubber(ctx, rubber, gridX, gridY)
  drawPlayhead(ctx, gridH, view, playheadBeat, clipStartBeat)
  ctx.restore()

  if (velH > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(gridX, velY, gridW, velH)
    ctx.clip()
    if (expressionPoints) drawExpression(ctx, gridX, velY, gridW, velH, view, expressionPoints)
    else drawVelocity(ctx, gridX, velY, gridW, velH, vis.notes, view, selectedIds)
    ctx.restore()
  }

  ctx.fillStyle = '#2a2a2a'
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

function drawMarkers (ctx, width, height, view, markers, clipStartBeat, gridX) {
  ctx.fillStyle = '#121212'
  ctx.fillRect(0, 0, width, height)
  ctx.font = '10px sans-serif'
  ;(markers || []).forEach((marker) => {
    const beat = (marker.startBeat != null ? marker.startBeat : 0) - (clipStartBeat || 0)
    const x = gridX + (beat * view.pixelsPerBeat) - view.scrollX
    if (x < 0 || x > width) return
    ctx.fillStyle = '#4a4a4a'
    ctx.fillRect(x, 3, 1, height - 4)
    ctx.fillStyle = '#8d8d8d'
    ctx.fillText(marker.name || marker.mode || '', x + 4, 12)
  })
}

function drawTimeline (ctx, x, y, w, h, view, timeSignatures, timeSig, clipStartBeat, loopStart, loopEnd, playheadBeat) {
  ctx.fillStyle = '#161616'
  ctx.fillRect(x, y, w, h)
  const startTick = Math.max(0, Math.floor((view.scrollX / view.pixelsPerBeat) * PPQ))
  const endTick = startTick + Math.ceil((w / view.pixelsPerBeat) * PPQ)
  ctx.font = '10px sans-serif'
  iterateGridLines(startTick, endTick, view.pixelsPerBeat, timeSignatures, timeSig, (tick, kind, sig) => {
    const px = x + tickToX(tick, view)
    if (kind === 'bar') {
      ctx.fillStyle = '#555'
      ctx.fillRect(px, y + 4, 1, h - 5)
      const absBeat = (clipStartBeat || 0) + tick / PPQ
      const bar = Math.floor(absBeat / Math.max(1, sig.numerator)) + 1
      ctx.fillStyle = '#8d8d8d'
      ctx.fillText(String(bar), px + 4, y + 13)
    } else if (kind === 'beat') {
      ctx.fillStyle = '#3a3a3a'
      ctx.fillRect(px, y + 12, 1, h - 13)
    }
  })
  const loopX0 = x + ((loopStart - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  const loopX1 = x + ((loopEnd - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  ctx.fillStyle = 'rgba(77,163,255,0.12)'
  ctx.fillRect(loopX0, y, Math.max(2, loopX1 - loopX0), h)
  const playX = x + (((playheadBeat || 0) - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  ctx.fillStyle = '#fff'
  ctx.fillRect(playX, y, 1, h)
  ctx.beginPath()
  ctx.moveTo(playX - 4, y + 2)
  ctx.lineTo(playX + 4, y + 2)
  ctx.lineTo(playX, y + 8)
  ctx.closePath()
  ctx.fill()
}

function drawKeyboard (ctx, width, y0, height, view, hoverPitch, showLabels, scaleKey, scaleName, scaleGuide) {
  ctx.fillStyle = '#0e0e0e'
  ctx.fillRect(0, y0, width, height)
  const first = Math.floor(view.scrollY / view.pixelsPerSemitone)
  const last = first + Math.ceil(height / view.pixelsPerSemitone) + 1
  ctx.font = Math.min(10, view.pixelsPerSemitone - 1) + 'px sans-serif'
  for (let i = first; i <= last; i++) {
    const pitch = 127 - i
    if (pitch < 0 || pitch > 127) continue
    const y = y0 + i * view.pixelsPerSemitone - view.scrollY
    const black = isBlackKey(pitch)
    const held = pitch === hoverPitch
    const inScale = !scaleGuide || isScalePitch(pitch, scaleKey, scaleName)
    ctx.fillStyle = held ? '#4da3ff' : (black
      ? (inScale ? '#2a2a2a' : '#121212')
      : (inScale ? '#e8e8e8' : '#7a7a7a'))
    ctx.fillRect(0, y, black ? width * 0.62 : width - 1, view.pixelsPerSemitone - 1)
    if (showLabels && pitch % 12 === 0 && view.pixelsPerSemitone >= 10) {
      ctx.fillStyle = held ? '#fff' : '#5a5a5a'
      ctx.textAlign = 'right'
      ctx.fillText(pitchName(pitch), width - 6, y + view.pixelsPerSemitone - 3)
      ctx.textAlign = 'left'
    }
    if (pitch % 12 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fillRect(0, y, width, 1)
    }
  }
}

function drawGrid (ctx, width, height, view, timeSignatures, timeSig, scaleKey, scaleName, scaleGuide) {
  const first = Math.floor(view.scrollY / view.pixelsPerSemitone)
  const last = first + Math.ceil(height / view.pixelsPerSemitone) + 1
  for (let i = first; i <= last; i++) {
    const pitch = 127 - i
    const y = i * view.pixelsPerSemitone - view.scrollY
    const inScale = !scaleGuide || isScalePitch(pitch, scaleKey, scaleName)
    if (pitch % 12 === 0) ctx.fillStyle = inScale ? '#1c2430' : '#181818'
    else if (isBlackKey(pitch)) ctx.fillStyle = inScale ? '#151c26' : '#101010'
    else ctx.fillStyle = inScale ? '#1a222c' : '#161616'
    ctx.fillRect(0, y, width, view.pixelsPerSemitone)
    ctx.fillStyle = '#202020'
    ctx.fillRect(0, y, width, 1)
  }
  const startTick = Math.max(0, Math.floor((view.scrollX / view.pixelsPerBeat) * PPQ))
  const endTick = startTick + Math.ceil((width / view.pixelsPerBeat) * PPQ)
  iterateGridLines(startTick, endTick, view.pixelsPerBeat, timeSignatures, timeSig, (tick, kind) => {
    const x = tickToX(tick, view)
    ctx.fillStyle = kind === 'bar' ? '#2c2c2c' : (kind === 'beat' ? '#222222' : '#161616')
    ctx.fillRect(x, 0, 1, height)
  })
}

function drawLoop (ctx, height, view, loopStart, loopEnd, clipStartBeat) {
  const x0 = ((loopStart - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  const x1 = ((loopEnd - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  ctx.fillStyle = 'rgba(77,163,255,0.04)'
  ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height)
}

function drawGhosts (ctx, notes, view) {
  notes.forEach((note) => {
    const r = noteRect(note, view)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    fillRound(ctx, r.x, r.y, r.w, r.h, 2)
  })
}

function drawNotes (ctx, notes, view, selectedIds, clip) {
  const base = clip && clip.colour ? clip.colour : '#5f9ea0'
  notes.forEach((note) => {
    const r = noteRect(note, view)
    const vel = midiVelocity(note.velocity) / 127
    const selected = selectedIds && selectedIds.has && selectedIds.has(note.id)
    ctx.globalAlpha = note.muted ? 0.32 : 1
    ctx.fillStyle = shade(base, 0.42 + vel * 0.38)
    fillRound(ctx, r.x, r.y, r.w, r.h, 3)
    ctx.strokeStyle = selected ? '#e8e8e8' : 'rgba(255,255,255,0.16)'
    ctx.lineWidth = selected ? 1.5 : 1
    ctx.beginPath()
    ctx.moveTo(r.x + 3, r.y)
    ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, 3)
    ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, 3)
    ctx.arcTo(r.x, r.y + r.h, r.x, r.y, 3)
    ctx.arcTo(r.x, r.y, r.x + r.w, r.y, 3)
    ctx.stroke()
    if (r.w > 14) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      ctx.fillRect(r.right - 5, r.y + 3, 2, Math.max(2, r.h - 6))
    }
    ctx.globalAlpha = 1
  })
}

function drawRubber (ctx, rubber, gridX, gridY) {
  if (!rubber) return
  ctx.fillStyle = 'rgba(77,163,255,0.12)'
  ctx.strokeStyle = 'rgba(77,163,255,0.7)'
  ctx.lineWidth = 1
  ctx.fillRect(rubber.x - gridX, rubber.y - gridY, rubber.w, rubber.h)
  ctx.strokeRect(rubber.x - gridX, rubber.y - gridY, rubber.w, rubber.h)
}

function drawPlayhead (ctx, height, view, playheadBeat, clipStartBeat) {
  const x = (((playheadBeat || 0) - (clipStartBeat || 0)) * view.pixelsPerBeat) - view.scrollX
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(x, 0, 1, height)
}

function drawVelocity (ctx, x0, y0, width, height, notes, view, selectedIds) {
  ctx.fillStyle = '#121212'
  ctx.fillRect(x0, y0, width, height)
  ctx.fillStyle = '#6a6a6a'
  ctx.font = '9px sans-serif'
  ctx.fillText('VELOCITY', x0 + 8, y0 + 12)
  notes.forEach((note) => {
    const x = x0 + tickToX(note.startTick || 0, view)
    const vel = midiVelocity(note.velocity)
    const h = Math.max(2, (vel / 127) * (height - 16))
    const selected = selectedIds && selectedIds.has && selectedIds.has(note.id)
    ctx.fillStyle = selected ? '#7ec0ff' : '#4da3ff'
    ctx.globalAlpha = note.muted ? 0.3 : 0.9
    ctx.fillRect(x, y0 + height - 4 - h, 5, h)
    ctx.globalAlpha = 1
  })
}

function drawExpression (ctx, x0, y0, width, height, view, points) {
  ctx.fillStyle = '#121212'
  ctx.fillRect(x0, y0, width, height)
  ctx.fillStyle = '#6a6a6a'
  ctx.font = '9px sans-serif'
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
  ctx.strokeStyle = 'rgba(126,192,255,0.85)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  lane.forEach((p) => {
    const x = x0 + (p.t * view.pixelsPerBeat) - view.scrollX
    const y = y0 + height - 4 - (p.v / 127) * (height - 16)
    ctx.fillStyle = '#7ec0ff'
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  })
}

function shade (hex, amount) {
  const value = String(hex || '#5f9ea0').replace('#', '')
  const n = parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16)
  if (!Number.isFinite(n)) return '#5f9ea0'
  const r = Math.min(255, Math.round(((n >> 16) & 255) * amount))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * amount))
  const b = Math.min(255, Math.round((n & 255) * amount))
  return 'rgb(' + r + ',' + g + ',' + b + ')'
}

export { noteEndTick }
