export function resolveDom (node) {
  if (!node) return null
  if (node.nodeType === 1) return node
  const el = node.$el || node
  if (el && el.nodeType === 1) return el
  return null
}

/** True when drag likely carries files (Windows / WebView tolerant). */
export function isFileDrag (e) {
  const dt = e && e.dataTransfer
  if (!dt) return false
  if (dt.files && dt.files.length) return true
  if (dt.types && dt.types.length) {
    const types = Array.from(dt.types).map((t) => String(t).toLowerCase())
    if (types.includes('files')) return true
    if (types.some((t) => t.includes('file') || t.includes('uri-list'))) return true
    if (types.length === 1 && (types[0] === 'text/plain' || types[0] === 'text/html')) return false
  }
  const allowed = String(dt.effectAllowed || '').toLowerCase()
  return allowed === 'all' || allowed === 'copy' || allowed === 'copymove' || allowed === 'move'
}

export function filesFromDrop (e) {
  const dt = e && e.dataTransfer
  if (!dt || !dt.files || !dt.files.length) return []
  return Array.from(dt.files)
}

/**
 * Bind native drag/drop handlers (required for uni-app scroll-view on H5).
 * @returns {() => void} cleanup
 */
export function bindFileDropZone (el, handlers = {}, { capture = true } = {}) {
  const node = resolveDom(el)
  if (!node || !node.addEventListener) return () => {}

  let depth = 0

  const onEnter = (e) => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    depth += 1
    handlers.onEnter && handlers.onEnter(e)
  }

  const onLeave = (e) => {
    if (!isFileDrag(e)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) handlers.onLeave && handlers.onLeave(e)
  }

  const onOver = (e) => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    handlers.onOver && handlers.onOver(e)
  }

  const onDrop = (e) => {
    const files = filesFromDrop(e)
    if (!files.length && !isFileDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    depth = 0
    handlers.onDrop && handlers.onDrop(e, files)
  }

  node.addEventListener('dragenter', onEnter, capture)
  node.addEventListener('dragleave', onLeave, capture)
  node.addEventListener('dragover', onOver, capture)
  node.addEventListener('drop', onDrop, capture)

  return () => {
    node.removeEventListener('dragenter', onEnter, capture)
    node.removeEventListener('dragleave', onLeave, capture)
    node.removeEventListener('dragover', onOver, capture)
    node.removeEventListener('drop', onDrop, capture)
  }
}
