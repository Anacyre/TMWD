import { createClient } from '@supabase/supabase-js'

const url = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL)
  || 'https://igfixjydwobvukwfxveq.supabase.co'

const anonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZml4anlkd29idnVrd2Z4dmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NjgxODIsImV4cCI6MjEwMzA0NDE4Mn0.YOr859zCxuCteYLIdW1ScLHTjzN8XiKjPm64eUzwJ3E'

export const SUPABASE_URL = url
export const WEB_ASSET_BUCKET = 'daw-web'
export const M_ORCHESTRA_BUCKET = 'm-orchestra'

export const PROJECTS_BUCKET = 'projects'
export const SOUNDFONT_BUCKET = 'soundfonts'

function browserFetch (input, init) {
  const impl = typeof window !== 'undefined' && window.fetch ? window.fetch : fetch
  const target = typeof window !== 'undefined' ? window : globalThis
  return impl.call(target, input, init)
}

/* Sessions persist in localStorage so an account survives a refresh or a closed tab.
   The default Web Lock makes Safari and iPad abort sign-in as "Failed to fetch"
   even when the network is fine, so auth runs without that lock. */
export const supabase = createClient(url, anonKey, {
  global: { fetch: browserFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'dawweb.auth',
    lock: async (_name, _acquireTimeout, fn) => fn()
  }
})

export function publicAssetUrl (path, bucket = WEB_ASSET_BUCKET) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data && data.publicUrl ? data.publicUrl : `${url}/storage/v1/object/public/${bucket}/${path}`
}

function libraryObjectPath (path) {
  return String(path || '').replace(/^\/+/, '')
}

function encodeLibraryPath (path) {
  return libraryObjectPath(path).split('/').filter(Boolean).map((part) => {
    try { return encodeURIComponent(decodeURIComponent(part)) } catch (err) { return encodeURIComponent(part) }
  }).join('/')
}

export const ORCHESTRA_LOCAL_PREFIX = '/m-orchestra/'

function envMeta () {
  return typeof import.meta !== 'undefined' ? import.meta.env : null
}

function localLibraryUrl () {
  // Dev and Cloudflare both read the public bucket. The Vite disk path is not used,
  // so a silent cloud sample fails the same way on localhost.
  return ''
}

export function publicOrchestraUrl (path) {
  const rel = encodeLibraryPath(path)
  const env = envMeta()
  const envBase = env && env.VITE_M_ORCHESTRA_BASE
  if (envBase) return String(envBase).replace(/\/?$/, '/') + rel
  const local = localLibraryUrl(M_ORCHESTRA_BUCKET, rel)
  if (local) return local
  // getPublicUrl encodes the path. A path that is already encoded becomes %2520 and 400.
  return publicAssetUrl(libraryObjectPath(path), M_ORCHESTRA_BUCKET)
}

/**
 * Object URL for a sample library bucket. Dev and production both use the public
 * Supabase bucket. A same-origin /vms-symphonic path on Cloudflare is the app HTML.
 */
export function publicLibraryUrl (bucket, path) {
  const rel = encodeLibraryPath(path)
  if (!bucket || bucket === M_ORCHESTRA_BUCKET) return publicOrchestraUrl(path)
  const env = envMeta()
  const envKey = 'VITE_' + String(bucket).replace(/[^A-Za-z0-9]/g, '_').toUpperCase() + '_BASE'
  const envBase = env && env[envKey]
  if (envBase) return String(envBase).replace(/\/?$/, '/') + rel
  const local = localLibraryUrl(bucket, rel)
  if (local) return local
  // Cloudflare has no /vms-symphonic files; that path is the app HTML and stays silent.
  // Pass the raw object key. getPublicUrl encodes spaces once; pre-encoding them 400s.
  return publicAssetUrl(libraryObjectPath(path), bucket)
}
