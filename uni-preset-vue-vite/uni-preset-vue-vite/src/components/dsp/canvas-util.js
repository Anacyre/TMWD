/** Resolve a uni-app / Vue canvas ref to a real HTMLCanvasElement on H5. */
export function resolveCanvas (ref) {
  let el = ref && ref.value != null ? ref.value : ref
  if (!el) return null
  if (typeof el.getElement === 'function') {
    const native = el.getElement()
    if (native && typeof native.getContext === 'function') return native
  }
  if (typeof el.getContext === 'function') return el
  if (el.$el && typeof el.$el.getContext === 'function') return el.$el
  if (el.nodeType === 1 && el.tagName === 'CANVAS') return el
  if (el.nodeType === 1 && typeof el.querySelector === 'function') {
    const nested = el.querySelector('canvas')
    if (nested && typeof nested.getContext === 'function') return nested
  }
  if (el.$el && typeof el.$el.querySelector === 'function') {
    const nested = el.$el.querySelector('canvas')
    if (nested && typeof nested.getContext === 'function') return nested
  }
  return null
}

export function canvasRect (ref) {
  const el = resolveCanvas(ref)
  if (!el || typeof el.getBoundingClientRect !== 'function') {
    return { left: 0, top: 0, width: 320, height: 248 }
  }
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) {
    const parent = el.parentElement && el.parentElement.getBoundingClientRect()
    if (parent && parent.width > 2 && parent.height > 2) return parent
  }
  return rect
}

export function prepareCanvas (ref, fallbackW = 320, fallbackH = 248) {
  const el = resolveCanvas(ref)
  if (!el || typeof el.getContext !== 'function') return null
  const dpr = window.devicePixelRatio || 1
  const rect = canvasRect(el)
  const w = Math.max(1, Math.round(rect.width || fallbackW))
  const h = Math.max(1, Math.round(rect.height || fallbackH))
  const bw = Math.round(w * dpr)
  const bh = Math.round(h * dpr)
  if (el.width !== bw || el.height !== bh) {
    el.width = bw
    el.height = bh
  }
  const ctx = el.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { el, ctx, w, h, dpr }
}

/**
 * Re-run `onResize` whenever the canvas box changes. Plugin canvases are laid
 * out inside sheets that open at zero size and then animate, so a single draw
 * on mount left the first frame stretched or blank until the next repaint.
 * Falls back to window resize/orientation events where ResizeObserver is absent.
 */
export function observeCanvasResize (refs, onResize) {
  if (typeof window === 'undefined') return () => {}
  const list = Array.isArray(refs) ? refs : [refs]
  const handler = () => onResize()

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(handler)
    let attached = 0
    list.forEach((ref) => {
      const el = resolveCanvas(ref)
      const target = el && el.parentElement ? el.parentElement : el
      if (!target) return
      observer.observe(target)
      attached++
    })
    if (attached) {
      window.addEventListener('orientationchange', handler)
      return () => {
        observer.disconnect()
        window.removeEventListener('orientationchange', handler)
      }
    }
    observer.disconnect()
  }

  window.addEventListener('resize', handler)
  window.addEventListener('orientationchange', handler)
  return () => {
    window.removeEventListener('resize', handler)
    window.removeEventListener('orientationchange', handler)
  }
}
