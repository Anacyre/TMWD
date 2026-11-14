/**
 * Which requests the service worker may answer. Only the app itself is cached: never the
 * cloud database, storage, sample libraries or anything cross-origin.
 * 'shell' = network first with an offline fallback, 'static' = cache first, '' = untouched.
 */
export function swRoute (url, scope, request) {
  const req = request || {}
  if ((req.method || 'GET') !== 'GET') return ''
  if (req.range) return ''
  let target
  let base
  try {
    target = new URL(url)
    base = new URL(scope)
  } catch (err) {
    return ''
  }
  if (target.origin !== base.origin) return ''
  if (!target.pathname.startsWith(base.pathname)) return ''
  const path = target.pathname.slice(base.pathname.length)
  if (req.mode === 'navigate') return 'shell'
  if (/\.(ogg|wav|mp3|flac|m4a|aac|aif|aiff|sf2|sfz|mid|midi)$/i.test(path)) return ''
  if (/^(vms-|samples?\/|sample-libraries\/)/i.test(path)) return ''
  if (/^assets\/.+\.(js|css|woff2?|ttf|png|svg|jpg|webp)$/i.test(path)) return 'static'
  if (/^static\/.+\.(png|svg|jpg|webp|woff2?)$/i.test(path)) return 'static'
  if (/^(daw-[\w-]+\.js|manifest\.webmanifest|icon[\w-]*\.(png|svg)|apple-touch-icon\.png)$/i.test(path)) return 'shell'
  if (path === '' || path === 'index.html') return 'shell'
  return ''
}
