/**
 * Cloud project library on Supabase: one private folder per account, a byte quota per
 * profile, and explicit upload/download so the local IndexedDB library stays the source
 * of truth. Every call takes the client as a parameter-free default so tests can inject
 * a fake.
 */

import { supabase as defaultClient, PROJECTS_BUCKET } from './supabase.js'

export const DEFAULT_QUOTA_BYTES = 200 * 1024 * 1024

let client = defaultClient

/** Swap the Supabase client (tests). */
export function useCloudClient (next) {
  client = next || defaultClient
  return client
}

export function formatBytes (bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB'
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

/** Human-readable error, with the quota trigger translated into plain English. */
export function cloudErrorMessage (err, fallback = 'Cloud request failed') {
  const raw = String((err && (err.message || err.error_description || err.msg)) || err || '')
  if (/QUOTA_EXCEEDED/i.test(raw)) return 'Cloud storage is full. Delete a cloud project or free up space.'
  if (/invalid login credentials/i.test(raw)) return 'Email or password is incorrect.'
  if (/email not confirmed/i.test(raw)) return 'Check your inbox and confirm your email first.'
  if (/rate limit/i.test(raw)) return 'Too many attempts. Try again in a minute.'
  if (/network|fetch/i.test(raw)) return 'No connection. Check your network and try again.'
  if (/row-level security|permission denied/i.test(raw)) return 'Sign in to use cloud projects.'
  return raw || fallback
}

function unwrap (result, fallback) {
  if (result && result.error) throw new Error(cloudErrorMessage(result.error, fallback))
  return result ? result.data : null
}

/* ── auth ─────────────────────────────────────────────────────────── */

export async function currentUser () {
  const data = unwrap(await client.auth.getSession(), 'Session lookup failed')
  return data && data.session ? data.session.user : null
}

export function onAuthChange (handler) {
  const { data } = client.auth.onAuthStateChange((_event, session) => handler(session ? session.user : null))
  return () => { if (data && data.subscription) data.subscription.unsubscribe() }
}

export async function signInWithPassword (email, password) {
  const data = unwrap(await client.auth.signInWithPassword({ email: String(email || '').trim(), password }), 'Sign-in failed')
  return data && data.user
}

export async function signUpWithPassword (email, password, displayName) {
  const data = unwrap(await client.auth.signUp({
    email: String(email || '').trim(),
    password,
    options: { data: { display_name: displayName || '' } }
  }), 'Sign-up failed')
  return data
}

export async function sendMagicLink (email) {
  const redirect = typeof location !== 'undefined' ? location.origin + location.pathname : undefined
  unwrap(await client.auth.signInWithOtp({
    email: String(email || '').trim(),
    options: redirect ? { emailRedirectTo: redirect } : undefined
  }), 'Could not send the link')
  return true
}

export async function signOut () {
  unwrap(await client.auth.signOut(), 'Sign-out failed')
  return true
}

/* ── profile / quota ──────────────────────────────────────────────── */

export async function fetchUsage () {
  const user = await currentUser()
  if (!user) return null
  const data = unwrap(await client.from('profiles').select('display_name, quota_bytes, used_bytes').eq('id', user.id).maybeSingle(), 'Profile lookup failed')
  const quota = Number(data && data.quota_bytes) || DEFAULT_QUOTA_BYTES
  const used = Math.max(0, Number(data && data.used_bytes) || 0)
  return {
    displayName: (data && data.display_name) || (user.email ? user.email.split('@')[0] : ''),
    email: user.email || '',
    quotaBytes: quota,
    usedBytes: used,
    freeBytes: Math.max(0, quota - used),
    ratio: quota > 0 ? Math.min(1, used / quota) : 1
  }
}

/** True when `bytes` more would still fit. Pure, so the UI can refuse before uploading. */
export function fitsQuota (usage, bytes) {
  if (!usage) return true
  return (Number(usage.usedBytes) || 0) + Math.max(0, Number(bytes) || 0) <= (Number(usage.quotaBytes) || 0)
}

/* ── projects ─────────────────────────────────────────────────────── */

function storagePathFor (userId, cloudId) {
  return userId + '/' + cloudId + '.json'
}

export async function listCloudProjects () {
  const user = await currentUser()
  if (!user) return []
  const rows = unwrap(await client.from('projects')
    .select('id, name, schema_version, size_bytes, storage_path, local_id, updated_at, created_at')
    .eq('owner', user.id)
    .order('updated_at', { ascending: false }), 'Could not list cloud projects')
  return (rows || []).map((row) => ({
    cloudId: row.id,
    name: row.name,
    schemaVersion: row.schema_version,
    sizeBytes: Number(row.size_bytes) || 0,
    storagePath: row.storage_path,
    localId: row.local_id || '',
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : 0,
    createdAt: row.created_at ? Date.parse(row.created_at) : 0
  }))
}

/**
 * Upload a serialized project. `project.cloudId` updates the existing row; otherwise a
 * new row is created. The database trigger rejects the write when quota would overflow,
 * so the row is written first and the file only after the quota check has passed.
 */
export async function uploadProject (project, options = {}) {
  const user = await currentUser()
  if (!user) throw new Error('Sign in to upload projects.')
  const json = typeof project === 'string' ? project : JSON.stringify(project)
  const bytes = new Blob([json]).size
  const name = (options.name || (project && project.projectName) || 'Untitled').slice(0, 120)
  const schemaVersion = Number(project && project.schemaVersion) || 1
  const localId = String((project && project.id) || options.localId || '')
  const cloudId = options.cloudId || (project && project.cloudId) || null

  let row
  if (cloudId) {
    row = unwrap(await client.from('projects')
      .update({ name, schema_version: schemaVersion, size_bytes: bytes, local_id: localId })
      .eq('id', cloudId)
      .eq('owner', user.id)
      .select()
      .single(), 'Upload failed')
  } else {
    const path = storagePathFor(user.id, (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()))
    row = unwrap(await client.from('projects')
      .insert({ owner: user.id, name, schema_version: schemaVersion, size_bytes: bytes, storage_path: path, local_id: localId })
      .select()
      .single(), 'Upload failed')
  }
  const path = row.storage_path
  const file = new Blob([json], { type: 'application/json' })
  const put = await client.storage.from(PROJECTS_BUCKET).upload(path, file, { upsert: true, contentType: 'application/json' })
  if (put && put.error) {
    // Roll the row back so quota accounting does not count a file that never landed.
    if (!cloudId) await client.from('projects').delete().eq('id', row.id)
    throw new Error(cloudErrorMessage(put.error, 'Upload failed'))
  }
  return {
    cloudId: row.id,
    name: row.name,
    sizeBytes: Number(row.size_bytes) || bytes,
    storagePath: path,
    localId,
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now()
  }
}

export async function downloadProject (cloudId) {
  const user = await currentUser()
  if (!user) throw new Error('Sign in to open cloud projects.')
  const row = unwrap(await client.from('projects')
    .select('id, name, storage_path, updated_at, local_id')
    .eq('id', cloudId)
    .eq('owner', user.id)
    .single(), 'Project not found')
  const file = await client.storage.from(PROJECTS_BUCKET).download(row.storage_path)
  if (file && file.error) throw new Error(cloudErrorMessage(file.error, 'Download failed'))
  const text = typeof file.data === 'string' ? file.data : await file.data.text()
  let data
  try { data = JSON.parse(text) } catch (err) { throw new Error('The cloud file is not a valid project.') }
  data.cloudId = row.id
  data.cloudUpdatedAt = row.updated_at ? Date.parse(row.updated_at) : 0
  if (!data.projectName) data.projectName = row.name
  return data
}

export async function deleteCloudProject (cloudId) {
  const user = await currentUser()
  if (!user) throw new Error('Sign in first.')
  const row = unwrap(await client.from('projects')
    .select('id, storage_path')
    .eq('id', cloudId)
    .eq('owner', user.id)
    .maybeSingle(), 'Delete failed')
  if (!row) return false
  await client.storage.from(PROJECTS_BUCKET).remove([row.storage_path])
  unwrap(await client.from('projects').delete().eq('id', row.id), 'Delete failed')
  return true
}

export async function renameCloudProject (cloudId, name) {
  const user = await currentUser()
  if (!user) throw new Error('Sign in first.')
  unwrap(await client.from('projects')
    .update({ name: String(name || 'Untitled').slice(0, 120) })
    .eq('id', cloudId)
    .eq('owner', user.id), 'Rename failed')
  return true
}

/**
 * Conflict hint for the Local | Cloud view: which copy is newer.
 * Returns 'same' | 'local-newer' | 'cloud-newer' | 'unlinked'.
 */
export function compareCopies (localUpdatedAt, cloudUpdatedAt) {
  const a = Number(localUpdatedAt) || 0
  const b = Number(cloudUpdatedAt) || 0
  if (!a || !b) return 'unlinked'
  if (Math.abs(a - b) < 2000) return 'same'
  return a > b ? 'local-newer' : 'cloud-newer'
}
