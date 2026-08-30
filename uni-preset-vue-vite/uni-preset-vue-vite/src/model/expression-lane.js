/** Clip-local CC curves and sustain blocks for the piano-roll expression panel. */

import { PPQ } from './note-model.js'

export const CC_DYNAMICS = 1
export const CC_EXPRESSION = 11
export const CC_SUSTAIN = 64

export function emptyExpression () {
  return { cc1: [], cc11: [], cc64: [] }
}

export function ensureExpression (clip) {
  if (!clip) return emptyExpression()
  if (!clip.expression) clip.expression = emptyExpression()
  if (!Array.isArray(clip.expression.cc1)) clip.expression.cc1 = []
  if (!Array.isArray(clip.expression.cc11)) clip.expression.cc11 = []
  if (!Array.isArray(clip.expression.cc64)) clip.expression.cc64 = []
  return clip.expression
}

export function laneKey (cc) {
  if (cc === CC_EXPRESSION) return 'cc11'
  if (cc === CC_SUSTAIN) return 'cc64'
  return 'cc1'
}

export function sortLane (points) {
  return (points || []).slice().sort((a, b) => a.t - b.t)
}

export function sampleLane (points, t) {
  const lane = sortLane(points)
  if (!lane.length) return 64
  if (t <= lane[0].t) return lane[0].v
  if (t >= lane[lane.length - 1].t) return lane[lane.length - 1].v
  for (let i = 1; i < lane.length; i++) {
    const a = lane[i - 1]
    const b = lane[i]
    if (t <= b.t) {
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t)
      return a.v + (b.v - a.v) * u
    }
  }
  return 64
}

export function paintPoint (points, t, v, mergeWindow = 0.06) {
  const next = sortLane(points)
  const value = Math.max(0, Math.min(127, Math.round(v)))
  const hit = next.findIndex((p) => Math.abs(p.t - t) <= mergeWindow)
  if (hit >= 0) next[hit] = { t, v: value }
  else next.push({ t, v: value })
  return sortLane(next)
}

export function addLanePoint (points, t, v) {
  return paintPoint(points, t, v, 0.02)
}

export function moveLanePoint (points, index, t, v) {
  const next = (points || []).slice()
  if (index < 0 || index >= next.length) return sortLane(next)
  next[index] = {
    t: Math.max(0, t),
    v: Math.max(0, Math.min(127, Math.round(v)))
  }
  return sortLane(next)
}

export function deleteLanePoint (points, index) {
  return (points || []).filter((_, i) => i !== index)
}

export function hitLanePoint (points, t, v, tRadius = 0.12, vRadius = 14) {
  let best = -1
  let bestDist = Infinity
  ;(points || []).forEach((p, i) => {
    const dt = Math.abs(p.t - t) / tRadius
    const dv = Math.abs(p.v - v) / vRadius
    const d = dt * dt + dv * dv
    if (d < 1 && d < bestDist) {
      best = i
      bestDist = d
    }
  })
  return best
}

export function eraseNear (points, t, radius = 0.12) {
  return (points || []).filter((p) => Math.abs(p.t - t) > radius)
}

export function normalizeSustainBlock (block) {
  const start = Math.max(0, Number(block && (block.startTick != null ? block.startTick : block.startBeat * PPQ)) || 0)
  const rawEnd = Number(block && (block.endTick != null ? block.endTick : block.endBeat * PPQ))
  const end = Math.max(start + 1, Number.isFinite(rawEnd) ? rawEnd : start + PPQ)
  return { startTick: start, endTick: end }
}

export function sortSustain (blocks) {
  return (blocks || []).map(normalizeSustainBlock).sort((a, b) => a.startTick - b.startTick)
}

export function addSustainBlock (blocks, startTick, endTick) {
  return sortSustain((blocks || []).concat([{ startTick, endTick }]))
}

export function moveSustainBlock (blocks, index, startTick, endTick) {
  const next = sortSustain(blocks)
  if (index < 0 || index >= next.length) return next
  next[index] = normalizeSustainBlock({ startTick, endTick })
  return sortSustain(next)
}

export function deleteSustainBlock (blocks, index) {
  return (blocks || []).filter((_, i) => i !== index)
}

export function hitSustainBlock (blocks, tick, edgePad = PPQ / 8) {
  const list = sortSustain(blocks)
  for (let i = 0; i < list.length; i++) {
    const b = list[i]
    if (tick >= b.startTick - edgePad && tick <= b.endTick + edgePad) {
      const nearStart = Math.abs(tick - b.startTick) <= edgePad
      const nearEnd = Math.abs(tick - b.endTick) <= edgePad
      return { index: i, edge: nearStart ? 'start' : (nearEnd ? 'end' : 'move') }
    }
  }
  return null
}

export function sampleSustain (blocks, tBeats) {
  const tick = tBeats * PPQ
  return (blocks || []).some((b) => {
    const n = normalizeSustainBlock(b)
    return tick >= n.startTick && tick < n.endTick
  }) ? 127 : 0
}

export function mappedExpressionControllers (definition, catalogue) {
  const list = catalogue || []
  const allowed = new Set((definition && definition.controllers) || [])
  const fromDef = list.filter((item) => {
    if (!item || !item.mapped) return false
    if (allowed.size && !allowed.has(item.id)) return false
    const cc = item.midiCC != null ? item.midiCC : item.cc
    return cc === 1 || cc === 11
  })
  if (fromDef.length) return fromDef
  return list.filter((item) => item && item.mapped && (item.midiCC === 1 || item.midiCC === 11 || item.cc === 1 || item.cc === 11))
}

export function controllerIdForCc (catalogue, cc) {
  const mapped = mappedExpressionControllers(null, catalogue)
  const hit = mapped.find((item) => (item.midiCC != null ? item.midiCC : item.cc) === cc)
  if (hit) return hit.id
  if (cc === 11) return 'expression'
  if (cc === 64) return 'pedal'
  return 'dynamics'
}

export function pedalMapped (definition, catalogue) {
  const list = catalogue || []
  if (definition && definition.pedal && definition.pedal.mapped) return true
  return list.some((item) => {
    if (!item || !item.mapped) return false
    const cc = item.midiCC != null ? item.midiCC : item.cc
    return item.id === 'pedal' || cc === 64
  })
}
