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

export function publicOrchestraUrl (path) {
  return publicAssetUrl(path, M_ORCHESTRA_BUCKET)
}
