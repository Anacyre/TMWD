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

  if (target && typeof target.setPointerCapture === 'function' && pointerId != null) {
    try { target.setPointerCapture(pointerId) } catch (err) { /* capture unsupported */ }
  }

  const samePointer = (ev) => pointerId == null || ev == null || ev.pointerId == null
    || ev.pointerId === pointerId

  const move = (ev) => {
    if (!samePointer(ev)) return
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

/**
 * 0..1 position of a pointer along `element`. Returns null when the element has
 * no measurable size, which would otherwise produce NaN and freeze the control.
 */
export function trackRatio (event, element, orientation = 'horizontal') {
  if (!element || typeof element.getBoundingClientRect !== 'function') return null
  const rect = element.getBoundingClientRect()
  const vertical = orientation === 'vertical'
  const span = vertical ? rect.height : rect.width
  if (!(span > 1)) return null
  const offset = vertical ? (event.clientY - rect.top) : (event.clientX - rect.left)
  const t = offset / span
  const clamped = Math.min(1, Math.max(0, t))
  return vertical ? 1 - clamped : clamped
}

export function clamp (value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
