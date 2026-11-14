// Publish, update, unpublish and report public projects. Runs with the service role;
// guests are identified by a device id and manage their projects with an edit token.
import { createClient } from 'npm:@supabase/supabase-js@2'

const LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  title: [3, 80],
  description: 1000,
  creator: [2, 40],
  tags: 6,
  tag: 24,
  livePerOwner: 20,
  writesPerHour: 6,
  hideAfterReports: 3
}
const BUCKET = 'public-projects'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function reply (status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function fail (status: number, error: string) {
  return reply(status, { error })
}

async function sha256 (text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function clean (value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function readMeta (body: Record<string, unknown>) {
  const title = clean(body.title, LIMITS.title[1])
  const description = String(body.description ?? '').trim().slice(0, LIMITS.description)
  const creator = clean(body.creator, LIMITS.creator[1])
  const rawTags = Array.isArray(body.tags) ? body.tags : []
  const tags = [...new Set(rawTags.map((tag) => clean(tag, LIMITS.tag).toLowerCase()).filter(Boolean))].slice(0, LIMITS.tags)
  if (title.length < LIMITS.title[0]) return { error: 'Give the project a title of at least 3 characters.' }
  if (creator.length < LIMITS.creator[0]) return { error: 'Add a creator name of at least 2 characters.' }
  return { title, description, creator, tags }
}

function readPreview (value: unknown) {
  if (!Array.isArray(value)) return null
  const unit = (n: unknown) => Math.max(0, Math.min(1, Math.round((Number(n) || 0) * 1000) / 1000))
  return value.slice(0, 96).filter(Array.isArray).map((item) => [unit(item[0]), unit(item[1]), unit(item[2])])
}

function readProject (value: unknown) {
  if (!value || typeof value !== 'object') return { error: 'The project file is missing.' }
  const project = value as Record<string, unknown>
  const schema = Number(project.schemaVersion)
  if (!Array.isArray(project.tracks) || !Array.isArray(project.clips) || !(schema >= 1 && schema <= 6)) {
    return { error: 'This is not a DawWeb project.' }
  }
  const json = JSON.stringify(project)
  const bytes = new TextEncoder().encode(json).length
  if (bytes > LIMITS.maxBytes) return { error: 'Projects can be published up to 10 MB. Remove long audio clips and try again.' }
  return { json, bytes, schema, trackCount: project.tracks.filter((t) => t && (t as Record<string, unknown>).type !== 'master').length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail(405, 'Method not allowed')

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false }
  })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return fail(400, 'Invalid request.') }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  let userId: string | null = null
  if (token) {
    const { data } = await admin.auth.getUser(token)
    userId = data && data.user ? data.user.id : null
  }
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim()
  const ipHash = await sha256('dawweb-ip:' + ip)
  const deviceId = clean(body.deviceId, 64)
  const action = String(body.action || '')

  async function rateLimited () {
    const since = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await admin.from('publish_events').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('created_at', since)
    if ((count || 0) >= LIMITS.writesPerHour) return true
    await admin.from('publish_events').insert({ ip_hash: ipHash })
    return false
  }

  async function loadOwned (id: string) {
    const { data: row } = await admin.from('public_projects').select('*').eq('id', id).maybeSingle()
    if (!row) return { error: fail(404, 'This published project no longer exists.') }
    const byUser = userId && row.owner === userId
    const editToken = clean(body.editToken, 128)
    const byToken = !row.owner && editToken && row.edit_token_hash === await sha256(editToken)
    if (!byUser && !byToken) return { error: fail(403, 'Only the creator can change this project.') }
    return { row }
  }

  if (action === 'publish' || action === 'update') {
    const meta = readMeta(body)
    if ('error' in meta) return fail(400, meta.error as string)
    const file = readProject(body.project)
    if ('error' in file) return fail(400, file.error as string)
    if (!userId && deviceId.length < 8) return fail(400, 'Missing device id.')

    let row: Record<string, unknown> | null = null
    if (action === 'update') {
      const owned = await loadOwned(clean(body.id, 64))
      if (owned.error) return owned.error
      row = owned.row
    } else {
      const live = userId
        ? admin.from('public_projects').select('id', { count: 'exact', head: true }).eq('owner', userId)
        : admin.from('public_projects').select('id', { count: 'exact', head: true }).is('owner', null).eq('device_id', deviceId)
      const { count } = await live
      if ((count || 0) >= LIMITS.livePerOwner) return fail(429, 'You have 20 published projects. Unpublish one to publish another.')
    }
    if (await rateLimited()) return fail(429, 'Too many publishes from this network. Try again in an hour.')

    const id = row ? String(row.id) : crypto.randomUUID()
    const path = id + '.json'
    const upload = await admin.storage.from(BUCKET).upload(path, new Blob([file.json], { type: 'application/json' }), {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '60'
    })
    if (upload.error) return fail(500, 'Upload failed. Try again.')

    const fields = {
      title: meta.title,
      description: meta.description,
      creator_name: meta.creator,
      tags: meta.tags,
      bpm: Number(body.bpm) || null,
      duration_sec: Number(body.durationSec) || null,
      track_count: file.trackCount,
      preview: readPreview(body.preview),
      size_bytes: file.bytes,
      storage_path: path,
      schema_version: file.schema,
      updated_at: new Date().toISOString()
    }
    if (row) {
      const { error } = await admin.from('public_projects').update(fields).eq('id', id)
      if (error) return fail(500, 'Update failed. Try again.')
      return reply(200, { id, updatedAt: fields.updated_at })
    }
    const editToken = userId ? '' : crypto.randomUUID() + crypto.randomUUID()
    const { data, error } = await admin.from('public_projects').insert({
      id,
      ...fields,
      owner: userId,
      device_id: userId ? null : deviceId,
      edit_token_hash: editToken ? await sha256(editToken) : null
    }).select('id, created_at').single()
    if (error) {
      await admin.storage.from(BUCKET).remove([path])
      return fail(500, 'Publishing failed. Try again.')
    }
    return reply(200, { id: data.id, createdAt: data.created_at, editToken })
  }

  if (action === 'unpublish') {
    const owned = await loadOwned(clean(body.id, 64))
    if (owned.error) return owned.error
    await admin.storage.from(BUCKET).remove([String(owned.row.storage_path)])
    await admin.from('public_projects').delete().eq('id', owned.row.id)
    return reply(200, { ok: true })
  }

  if (action === 'report') {
    const id = clean(body.id, 64)
    const { data: row } = await admin.from('public_projects').select('id').eq('id', id).maybeSingle()
    if (!row) return fail(404, 'This published project no longer exists.')
    const reporter = await sha256('dawweb-report:' + (userId || ipHash))
    await admin.from('public_project_reports').upsert(
      { project_id: id, reporter_hash: reporter, reason: clean(body.reason, 300) },
      { onConflict: 'project_id,reporter_hash', ignoreDuplicates: true }
    )
    const { count } = await admin.from('public_project_reports').select('id', { count: 'exact', head: true }).eq('project_id', id)
    await admin.from('public_projects').update({ reports: count || 0, hidden: (count || 0) >= LIMITS.hideAfterReports }).eq('id', id)
    return reply(200, { ok: true })
  }

  return fail(400, 'Unknown action.')
})
