/** Clip-local CC curves for Lite Mode expression drawing. */

export const CC_DYNAMICS = 1
export const CC_EXPRESSION = 11

export function emptyExpression () {
  return { cc1: [], cc11: [] }
}

export function ensureExpression (clip) {
  if (!clip) return emptyExpression()
  if (!clip.expression) clip.expression = emptyExpression()
  if (!Array.isArray(clip.expression.cc1)) clip.expression.cc1 = []
  if (!Array.isArray(clip.expression.cc11)) clip.expression.cc11 = []
  return clip.expression
}

export function laneKey (cc) {
  return cc === CC_EXPRESSION ? 'cc11' : 'cc1'
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

export function eraseNear (points, t, radius = 0.12) {
  return (points || []).filter((p) => Math.abs(p.t - t) > radius)
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
  return cc === 11 ? 'expression' : 'dynamics'
}
