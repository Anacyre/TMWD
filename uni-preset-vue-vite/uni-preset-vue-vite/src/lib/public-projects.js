/**
 * Public gallery: anyone can browse and open published projects; publishing goes
 * through the `publish-project` edge function, which owns every limit below.
 */

import { supabase as defaultClient } from './supabase.js'

export const PUBLIC_BUCKET = 'public-projects'
export const PUBLISH_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  titleMin: 3,
  titleMax: 80,
  description: 1000,
  creatorMin: 2,
  creatorMax: 40,
  tags: 6,
  livePerOwner: 20,
  writesPerHour: 6
}

const LIST_FIELDS = 'id, title, description, creator_name, owner, tags, bpm, duration_sec, track_count, preview, size_bytes, storage_path, opens, created_at, updated_at'
const TOKENS_KEY = 'dawweb.publishTokens'
const DEVICE_KEY = 'dawweb.device'

let client = defaultClient

export function usePublicClient (next) {
  client = next || defaultClient
  return client
}

/** First problem with the details, or '' when the project can be published. */
export function validatePublish (meta, bytes) {
  const title = String((meta && meta.title) || '').trim()
  const creator = String((meta && meta.creator) || '').trim()
  if (title.length < PUBLISH_LIMITS.titleMin) return 'Give the project a title of at least 3 characters.'
  if (title.length > PUBLISH_LIMITS.titleMax) return 'Titles can be up to 80 characters.'
  if (creator.length < PUBLISH_LIMITS.creatorMin) return 'Add a creator name of at least 2 characters.'
  if (creator.length > PUBLISH_LIMITS.creatorMax) return 'Creator names can be up to 40 characters.'
  if (String((meta && meta.description) || '').length > PUBLISH_LIMITS.description) return 'Descriptions can be up to 1000 characters.'
  if (Number(bytes) > PUBLISH_LIMITS.maxBytes) return 'Projects can be published up to 10 MB. Remove long audio clips and try again.'
  return ''
}

/** Card data derived from a project: tempo, length, track count and a tiny note
 * silhouette ([x, y, width] in 0..1) used as the auto cover. */
export function projectSummary (project) {
  const bpm = Number(project && (project.tempo || project.bpm)) || 120
  const clips = (project && project.clips) || []
  const tracks = ((project && project.tracks) || []).filter((track) => track && track.type !== 'master' && track.type !== 'group')
  let endBeat = 0
  const notes = []
  for (const clip of clips) {
    const start = Number(clip.startBeat) || 0
    const length = Number(clip.lengthBeats) || 0
    endBeat = Math.max(endBeat, start + length)
    for (const note of clip.notes || []) {
      const beat = start + (Number(note.start != null ? note.start : note.startBeat) || 0)
      const len = Number(note.duration != null ? note.duration : note.length) || 0.25
      const pitch = Number(note.pitch != null ? note.pitch : note.note)
      if (Number.isFinite(pitch)) notes.push([beat, pitch, len])
    }
  }
  const span = Math.max(4, endBeat)
  let lo = 127
  let hi = 0
  notes.forEach((note) => { lo = Math.min(lo, note[1]); hi = Math.max(hi, note[1]) })
  const range = Math.max(12, hi - lo)
  const step = Math.max(1, Math.ceil(notes.length / 96))
  const preview = notes
    .sort((a, b) => a[0] - b[0])
    .filter((_, i) => i % step === 0)
    .slice(0, 96)
    .map(([beat, pitch, len]) => [
      round3(beat / span),
      round3(1 - (pitch - lo) / range),
      round3(Math.min(1, len / span))
    ])
  return {
    bpm: Math.round(bpm * 100) / 100,
    durationSec: Math.round(endBeat * 60 / bpm),
    trackCount: tracks.length,
    preview
  }
}

function round3 (n) {
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000))
}

/** Stable hue from a string, for covers without artwork. */
export function coverHue (seed) {
  let h = 0
  const text = String(seed || '')
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h % 360
}

export function formatDuration (sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

/* ── guest identity ──────────────────────────────────────────────── */

function storage () {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

export function deviceId () {
  const ls = storage()
  let id = ls && ls.getItem(DEVICE_KEY)
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('d' + Date.now().toString(36) + Math.random().toString(36).slice(2))
    if (ls) ls.setItem(DEVICE_KEY, id)
  }
  return id
}

function readTokens () {
  const ls = storage()
  try { return JSON.parse((ls && ls.getItem(TOKENS_KEY)) || '{}') || {} } catch (err) { return {} }
}

export function editTokenFor (id) {
  return readTokens()[id] || ''
}

function rememberToken (id, token) {
  const ls = storage()
  if (!ls || !id) return
  const tokens = readTokens()
  if (token) tokens[id] = token
  else delete tokens[id]
  ls.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

/** True when this device or account may update / unpublish the row. */
export function canManage (row, userId) {
  if (!row) return false
  if (row.owner) return !!userId && row.owner === userId
  return !!editTokenFor(row.id)
}

/* ── edge function calls ─────────────────────────────────────────── */

async function call (payload) {
  const { data, error } = await client.functions.invoke('publish-project', { body: payload })
  if (error) {
    let message = error.message || 'Publishing failed'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json()
        if (body && body.error) message = body.error
      }
    } catch (err) { /* keep the generic message */ }
    if (/failed to send|fetch/i.test(message)) message = 'No connection to the gallery. Try again later.'
    throw new Error(message)
  }
  if (data && data.error) throw new Error(data.error)
  return data || {}
}

function payloadFor (project, meta) {
  const summary = projectSummary(project)
  return {
    project,
    title: meta.title,
    description: meta.description || '',
    creator: meta.creator,
    tags: meta.tags || [],
    bpm: summary.bpm,
    durationSec: summary.durationSec,
    preview: summary.preview,
    deviceId: deviceId()
  }
}

export async function publishProject (project, meta) {
  const result = await call({ action: 'publish', ...payloadFor(project, meta) })
  if (result.editToken) rememberToken(result.id, result.editToken)
  return { id: result.id, publishedAt: result.createdAt ? Date.parse(result.createdAt) : Date.now() }
}

export async function updatePublished (id, project, meta) {
  const result = await call({ action: 'update', id, editToken: editTokenFor(id), ...payloadFor(project, meta) })
  return { id, publishedAt: result.updatedAt ? Date.parse(result.updatedAt) : Date.now() }
}

export async function unpublishProject (id) {
  await call({ action: 'unpublish', id, editToken: editTokenFor(id), deviceId: deviceId() })
  rememberToken(id, '')
  return true
}

export async function reportPublic (id, reason) {
  await call({ action: 'report', id, reason: String(reason || '').slice(0, 300) })
  return true
}

/* ── public reads ────────────────────────────────────────────────── */

function mapRow (row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    creator: row.creator_name,
    owner: row.owner || '',
    tags: row.tags || [],
    bpm: Number(row.bpm) || 0,
    durationSec: Number(row.duration_sec) || 0,
    trackCount: Number(row.track_count) || 0,
    preview: Array.isArray(row.preview) ? row.preview : [],
    sizeBytes: Number(row.size_bytes) || 0,
    storagePath: row.storage_path,
    opens: Number(row.opens) || 0,
    createdAt: row.created_at ? Date.parse(row.created_at) : 0,
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : 0
  }
}

/** Escape LIKE wildcards and the commas PostgREST uses to split `or` filters. */
export function searchPattern (text) {
  const clean = String(text || '').trim().slice(0, 60).replace(/[%_\\]/g, (ch) => '\\' + ch).replace(/[,()]/g, ' ')
  return clean ? '%' + clean + '%' : ''
}

export async function listPublic (options = {}) {
  const limit = Math.min(48, Math.max(1, Number(options.limit) || 24))
  const offset = Math.max(0, Number(options.offset) || 0)
  let query = client.from('public_projects').select(LIST_FIELDS)
  const pattern = searchPattern(options.search)
  if (pattern) query = query.or('title.ilike.' + pattern + ',creator_name.ilike.' + pattern + ',description.ilike.' + pattern)
  if (options.mine && options.userId) query = query.eq('owner', options.userId)
  query = options.sort === 'popular'
    ? query.order('opens', { ascending: false }).order('created_at', { ascending: false })
    : query.order('created_at', { ascending: false })
  const { data, error } = await query.range(offset, offset + limit - 1)
  if (error) throw new Error(/fetch/i.test(error.message || '') ? 'No connection to the gallery. Try again later.' : (error.message || 'Could not load the gallery'))
  return (data || []).map(mapRow)
}

export async function fetchPublicRow (id) {
  const { data, error } = await client.from('public_projects').select(LIST_FIELDS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message || 'Could not load the project')
  return data ? mapRow(data) : null
}

/** Download the published file and count the open. */
export async function fetchPublicProject (row) {
  const path = row.storagePath || (row.id + '.json')
  const { data } = client.storage.from(PUBLIC_BUCKET).getPublicUrl(path)
  const url = data && data.publicUrl
  if (!url) throw new Error('Could not find the project file')
  const response = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + (row.updatedAt || 0), { cache: 'no-store' })
  if (!response.ok) throw new Error('This published project is no longer available.')
  const project = await response.json()
  client.rpc('increment_public_opens', { p_id: row.id }).then(() => {}, () => {})
  return project
}

export function publicLink (id) {
  if (typeof location === 'undefined') return '?p=' + id
  return location.origin + location.pathname + '?p=' + encodeURIComponent(id)
}
