/* global self, caches, fetch, swRoute, SW_VERSION */
const SHELL_CACHE = 'dawweb-shell-' + SW_VERSION
const STATIC_CACHE = 'dawweb-static-' + SW_VERSION
const scope = self.registration.scope

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(['./', './manifest.webmanifest', './icon-192.png']).catch(() => {}))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('dawweb-') && key !== SHELL_CACHE && key !== STATIC_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

async function networkFirst (request, navigate) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(navigate ? './' : request, response.clone())
    return response
  } catch (err) {
    const hit = await cache.match(navigate ? './' : request)
    if (hit) return hit
    throw err
  }
}

async function cacheFirst (request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response && response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const route = swRoute(request.url, scope, {
    method: request.method,
    mode: request.mode,
    range: request.headers.has('range')
  })
  if (route === 'shell') event.respondWith(networkFirst(request, request.mode === 'navigate'))
  else if (route === 'static') event.respondWith(cacheFirst(request))
})
