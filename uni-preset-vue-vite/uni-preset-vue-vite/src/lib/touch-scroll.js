/**
 * Finger scrolling for containers that uni-app marks overflow:hidden.
 * A one-finger drag along `axis` moves scrollLeft or scrollTop. A drag on the
 * other axis is left alone so faders and knobs still work.
 */
export function bindAxisScroll (el, axis, ignore) {
  if (!el || typeof el.addEventListener !== 'function') return () => {}
  let startX = 0
  let startY = 0
  let origin = 0
  let armed = false
  let scrolling = false

  const point = (e) => (e.touches && e.touches[0]) || null

  const down = (e) => {
    const t = point(e)
    if (!t || (e.touches && e.touches.length !== 1)) {
      armed = false
      return
    }
    const node = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement)
    if (ignore && node && node.closest && node.closest(ignore)) {
      armed = false
      return
    }
    startX = t.clientX
    startY = t.clientY
    origin = axis === 'x' ? el.scrollLeft : el.scrollTop
    armed = true
    scrolling = false
  }

  const move = (e) => {
    if (!armed) return
    const t = point(e)
    if (!t) return
    const dx = startX - t.clientX
    const dy = startY - t.clientY
    const primary = axis === 'x' ? dx : dy
    const other = axis === 'x' ? dy : dx
    if (!scrolling) {
      if (Math.abs(primary) < 8) return
      if (Math.abs(primary) < Math.abs(other)) {
        armed = false
        return
      }
      scrolling = true
    }
    if (e.cancelable) e.preventDefault()
    if (axis === 'x') el.scrollLeft = origin + dx
    else el.scrollTop = origin + dy
  }

  const up = () => {
    armed = false
    scrolling = false
  }

  el.addEventListener('touchstart', down, { capture: true, passive: true })
  el.addEventListener('touchmove', move, { capture: true, passive: false })
  el.addEventListener('touchend', up, { capture: true })
  el.addEventListener('touchcancel', up, { capture: true })
  return () => {
    el.removeEventListener('touchstart', down, { capture: true })
    el.removeEventListener('touchmove', move, { capture: true })
    el.removeEventListener('touchend', up, { capture: true })
    el.removeEventListener('touchcancel', up, { capture: true })
  }
}

const liveScrolls = new Map()

function scrollRoom (el, axis) {
  if (!el) return 0
  return axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight
}

function resolveScroller (target, selector, axis) {
  if (!target || typeof target.closest !== 'function') return null
  let el = target.closest(selector)
  while (el) {
    if (scrollRoom(el, axis) > 2) return el
    const parent = el.parentElement
    el = parent && typeof parent.closest === 'function' ? parent.closest(selector) : null
  }
  return null
}

/**
 * Scroll the element under the finger at gesture time.
 * Binding once in nextTick misses the node: uni-app patches the DOM after
 * Vue's nextTick, so the listener lands on nothing or on a replaced view.
 */
function attachLiveScroll (selector, axis, ignore) {
  let startX = 0
  let startY = 0
  let origin = 0
  let armed = false
  let scrolling = false
  let el = null

  const point = (e) => (e.touches && e.touches[0]) || null
  const typing = (target) => target && typeof target.closest === 'function'
    && target.closest('input, textarea, uni-input, uni-textarea')
  const skipped = (target) => ignore && target && typeof target.closest === 'function' && target.closest(ignore)

  const down = (e) => {
    const t = point(e)
    if (!t || (e.touches && e.touches.length !== 1) || typing(e.target) || skipped(e.target)) {
      armed = false
      return
    }
    el = resolveScroller(e.target, selector, axis)
    if (!el) {
      armed = false
      return
    }
    startX = t.clientX
    startY = t.clientY
    origin = axis === 'x' ? el.scrollLeft : el.scrollTop
    armed = true
    scrolling = false
  }

  const move = (e) => {
    if (!armed || !el) return
    const t = point(e)
    if (!t) return
    const dx = startX - t.clientX
    const dy = startY - t.clientY
    const primary = axis === 'x' ? dx : dy
    const other = axis === 'x' ? dy : dx
    if (!scrolling) {
      if (Math.abs(primary) < 8) return
      if (Math.abs(primary) < Math.abs(other)) {
        armed = false
        return
      }
      scrolling = true
    }
    if (e.cancelable) e.preventDefault()
    if (axis === 'x') el.scrollLeft = origin + dx
    else el.scrollTop = origin + dy
  }

  const up = () => {
    armed = false
    scrolling = false
    el = null
  }

  document.addEventListener('touchstart', down, { capture: true, passive: true })
  document.addEventListener('touchmove', move, { capture: true, passive: false })
  document.addEventListener('touchend', up, { capture: true })
  document.addEventListener('touchcancel', up, { capture: true })
  return () => {
    document.removeEventListener('touchstart', down, { capture: true })
    document.removeEventListener('touchmove', move, { capture: true })
    document.removeEventListener('touchend', up, { capture: true })
    document.removeEventListener('touchcancel', up, { capture: true })
  }
}

export function bindLiveScroll (selector, axis, ignore = '') {
  if (typeof document === 'undefined') return () => {}
  const key = axis + '|' + selector + '|' + ignore
  const existing = liveScrolls.get(key)
  if (existing) {
    existing.count += 1
    return () => releaseLiveScroll(key)
  }
  liveScrolls.set(key, { count: 1, unbind: attachLiveScroll(selector, axis, ignore) })
  return () => releaseLiveScroll(key)
}

/** If a block hangs out of the panel, cap it and let the finger scroll the rest. */
export function containOverflow (selector) {
  if (typeof document === 'undefined') return () => {}
  const fit = () => {
    document.querySelectorAll(selector).forEach((el) => {
      const panel = el.closest('.orch') || el.parentElement
      if (!panel) return
      el.style.maxHeight = ''
      const top = el.getBoundingClientRect().top
      const limit = panel.getBoundingClientRect().bottom - 8
      if (top + el.scrollHeight > limit + 2) {
        el.style.maxHeight = Math.max(120, limit - top) + 'px'
        el.style.overflowY = 'auto'
        el.style.overflowX = 'hidden'
      }
    })
  }
  fit()
  const timer = setTimeout(fit, 60)
  let observer = null
  let mutations = null
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(fit)
    document.querySelectorAll(selector).forEach((el) => observer.observe(el))
  }
  if (typeof MutationObserver !== 'undefined') {
    mutations = new MutationObserver(fit)
    document.querySelectorAll(selector).forEach((el) => mutations.observe(el, { childList: true }))
  }
  window.addEventListener('resize', fit)
  return () => {
    clearTimeout(timer)
    if (observer) observer.disconnect()
    if (mutations) mutations.disconnect()
    window.removeEventListener('resize', fit)
  }
}

function releaseLiveScroll (key) {
  const rec = liveScrolls.get(key)
  if (!rec) return
  rec.count -= 1
  if (rec.count > 0) return
  rec.unbind()
  liveScrolls.delete(key)
}
