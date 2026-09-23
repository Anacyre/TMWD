import { createClient } from '@supabase/supabase-js'

const url = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL)
  || 'https://igfixjydwobvukwfxveq.supabase.co'

const anonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZml4anlkd29idnVrd2Z4dmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NjgxODIsImV4cCI6MjEwMzA0NDE4Mn0.YOr859zCxuCteYLIdW1ScLHTjzN8XiKjPm64eUzwJ3E'

export const SUPABASE_URL = url
export const WEB_ASSET_BUCKET = 'daw-web'
export const M_ORCHESTRA_BUCKET = 'm-orchestra'

export const supabase = createClient(url, anonKey)

export function publicAssetUrl (path, bucket = WEB_ASSET_BUCKET) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data && data.publicUrl ? data.publicUrl : `${url}/storage/v1/object/public/${bucket}/${path}`
}

export const ORCHESTRA_LOCAL_PREFIX = '/m-orchestra/'

function envMeta () {
  return typeof import.meta !== 'undefined' ? import.meta.env : null
}

function localLibraryUrl (bucket, rel) {
  const env = envMeta()
  if (env && env.DEV && typeof location !== 'undefined' && location.origin) {
    return location.origin + '/' + bucket + '/' + rel
  }
  return ''
}

export function publicOrchestraUrl (path) {
  const rel = String(path || '').replace(/^\/+/, '')
  const env = envMeta()
  const envBase = env && env.VITE_M_ORCHESTRA_BASE
  if (envBase) return String(envBase).replace(/\/?$/, '/') + rel
  const local = localLibraryUrl(M_ORCHESTRA_BUCKET, rel)
  if (local) return local
  return publicAssetUrl(rel, M_ORCHESTRA_BUCKET)
}

/**
 * Object URL for a sample library bucket. In H5 dev the Vite plugin serves each bucket
 * from disk (`.sample-cache/<id>` or the M Orchestra folder) because the default
 * Supabase project no longer hosts these objects.
 */
export function publicLibraryUrl (bucket, path) {
  const rel = String(path || '').replace(/^\/+/, '')
  if (!bucket || bucket === M_ORCHESTRA_BUCKET) return publicOrchestraUrl(path)
  const env = envMeta()
  const envKey = 'VITE_' + String(bucket).replace(/[^A-Za-z0-9]/g, '_').toUpperCase() + '_BASE'
  const envBase = env && env[envKey]
  if (envBase) return String(envBase).replace(/\/?$/, '/') + rel
  const local = localLibraryUrl(bucket, rel)
  if (local) return local
  // The default Supabase project answers 400 for this bucket. The deploy step copies
  // the encoded files next to the app, so the Cloudflare site serves them itself.
  if (bucket === 'vms-symphonic' && typeof location !== 'undefined' && location.origin) {
    return location.origin + '/' + bucket + '/' + rel
  }
  return publicAssetUrl(rel, bucket)
}
