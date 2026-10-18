/** Shared pointer-drag plumbing for faders, knobs and sliders.

    Pointer Events are used instead of separate mouse/touch paths so a single
    code path covers mouse, pen and touch, and so `setPointerCapture` keeps the
    gesture alive when the finger leaves the control or a parent tries to scroll.
*/

const noop = () => {}

export function beginPointerDrag (event, handlers = {}) {
  if (typeof window === 'undefined') return noop

  const target = event.currentTarget || event.target
  const pointerId = event.pointerId
  let finished = false
  // 'x' or 'y': a swipe along that axis is a scroll, not a drag. Capture and
  // preventDefault only after the gesture is clearly the other axis.
  const allow = handlers.allowScroll === 'x' || handlers.allowScroll === 'y' ? handlers.allowScroll : ''
  const origin = pointerCoord(event)
  let dragging = !allow

  const capture = () => {
    if (target && typeof target.setPointerCapture === 'function' && pointerId != null) {
      try { target.setPointerCapture(pointerId) } catch (err) { /* capture unsupported */ }
    }
  }
  if (!allow) capture()

  const samePointer = (ev) => pointerId == null || ev == null || ev.pointerId == null
    || ev.pointerId === pointerId

  const move = (ev) => {
    if (!samePointer(ev)) return
    if (!dragging) {
      const now = pointerCoord(ev)
      if (!now || !origin) return
      const dx = now.x - origin.x
      const dy = now.y - origin.y
      if (Math.hypot(dx, dy) < 8) return
      const along = allow === 'x' ? Math.abs(dx) >= Math.abs(dy) : Math.abs(dy) > Math.abs(dx)
      if (along) {
        finish(ev)
        return
      }
      dragging = true
      capture()
    }
    if (ev.cancelable) ev.preventDefault()
    ;(handlers.onMove || noop)(ev)
  }

  const finish = (ev) => {
    if (finished || !samePointer(ev)) return
    finished = true
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    if (target && typeof target.releasePointerCapture === 'function' && pointerId != null) {
      try { target.releasePointerCapture(pointerId) } catch (err) { /* already released */ }
    }
    ;(handlers.onEnd || noop)(ev)
  }

  window.addEventListener('pointermove', move, { passive: false })
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
  return finish
}

function pickPoint (pt) {
  if (!pt) return null
  const x = Number(pt.clientX)
  const y = Number(pt.clientY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

// uni-app hands Vue listeners on <view> a substitute event with no coordinates.
// The original pointer event still passes window first, so keep that point.
let lastNativePoint = null
function rememberNativePoint (event) {
  const point = pickPoint(event)
  if (!point) return
  lastNativePoint = { x: point.x, y: point.y, at: Date.now() }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', rememberNativePoint, true)
  window.addEventListener('pointermove', rememberNativePoint, true)
  window.addEventListener('pointerup', rememberNativePoint, true)
  window.addEventListener('pointercancel', rememberNativePoint, true)
}

function fromTouchList (list) {
  if (!list || !list.length) return null
  return pickPoint(list[0])
}

/** Uni-app / Safari touch events often omit clientX/Y on the event itself. */
export function pointerCoord (event) {
  if (!event) return null
  const direct = pickPoint(event)
    || fromTouchList(event.touches)
    || fromTouchList(event.changedTouches)
    || fromTouchList(event.targetTouches)
  if (direct) return direct
  if (lastNativePoint && Date.now() - lastNativePoint.at < 50) {
    return { x: lastNativePoint.x, y: lastNativePoint.y }
  }
  return null
}

/**
 * 0..1 position of a pointer along `element`. Returns null when the element has
 * no measurable size, which would otherwise produce NaN and freeze the control.
 */
export function trackRatio (event, element, orientation = 'horizontal') {
  if (!element || typeof element.getBoundingClientRect !== 'function') return null
  const coord = pointerCoord(event)
  if (!coord) return null
  const rect = element.getBoundingClientRect()
  const vertical = orientation === 'vertical'
  const span = vertical ? rect.height : rect.width
  if (!(span > 1)) return null
  const offset = vertical ? (coord.y - rect.top) : (coord.x - rect.left)
  const t = offset / span
  const clamped = Math.min(1, Math.max(0, t))
  return vertical ? 1 - clamped : clamped
}

export function clamp (value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return Number.isFinite(fallback) ? fallback : min
  }
  return Math.min(max, Math.max(min, value))
}

/** Pixel travel used by relative faders/knobs so a short control is not hair-trigger. */
export const RELATIVE_TRAVEL_PX = 260

export function relativeFromDelta (startValue, deltaPx, span, travelPx = RELATIVE_TRAVEL_PX, invert = false) {
  const signed = invert ? -deltaPx : deltaPx
  return startValue + (signed / Math.max(1, travelPx)) * span
}
