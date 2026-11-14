/**
 * State and actions behind the project hub: one place to name, save, sync, publish and
 * open projects. Components stay thin; everything that touches storage lives here.
 */

import { reactive } from 'vue'
import {
  session,
  newProject,
  addTrack,
  saveCurrentProject,
  saveProjectAs,
  importProjectJson,
  openStoredProject,
  listStoredProjects,
  listStoredAutosaves,
  openAutosaveProject,
  deleteStoredProject,
  duplicateStoredProject,
  renameStoredProject,
  setProjectName,
  updateProjectMeta,
  buildPortableProject,
  loadDemoProject,
  listGuestProjects,
  adoptGuestProject,
  keepUnsavedInRecovery,
  showToast
} from './session.js'
import { cloudAuth, refreshCloudAuth } from './cloud-auth.js'
import {
  listCloudProjects,
  uploadProject,
  downloadProject,
  deleteCloudProject,
  renameCloudProject,
  compareCopies,
  cloudErrorMessage,
  fitsQuota
} from '../lib/cloud-projects.js'
import {
  validatePublish,
  publishProject,
  updatePublished,
  unpublishProject,
  reportPublic,
  listPublic,
  fetchPublicRow,
  fetchPublicProject,
  publicLink,
  canManage,
  PUBLISH_LIMITS
} from '../lib/public-projects.js'
import { packProjectAssets } from '../lib/project-assets.js'
import { getAsset } from '../lib/project-db.js'

const CREATOR_KEY = 'dawweb.creator'

export const hub = reactive({
  section: 'current',
  busy: '',
  local: [],
  cloud: [],
  guest: [],
  autosaves: [],
  cloudError: '',
  search: '',
  sort: 'recent',
  filter: 'all',
  discover: [],
  discoverSearch: '',
  discoverSort: 'new',
  discoverError: '',
  discoverLoading: false,
  discoverMore: false,
  detail: null,
  publishError: ''
})

export const SECTIONS = [
  { id: 'current', label: 'This project', icon: 'edit' },
  { id: 'library', label: 'My projects', icon: 'folder' },
  { id: 'recovery', label: 'Recovery', icon: 'history' },
  { id: 'discover', label: 'Discover', icon: 'globe' },
  { id: 'examples', label: 'Examples', icon: 'sparkle' }
]

function confirmAction (message) {
  return typeof window === 'undefined' || window.confirm(message)
}

async function run (label, task) {
  if (hub.busy) return null
  hub.busy = label
  try {
    return await task()
  } finally {
    hub.busy = ''
  }
}

export function openHub (section) {
  if (section) hub.section = section
  session.projectManagerOpen = true
  session.openMenu = ''
}

export function closeHub () {
  session.projectManagerOpen = false
  hub.detail = null
}

/* ── creator name ─────────────────────────────────────────────────── */

export function rememberedCreator () {
  try { return (typeof localStorage !== 'undefined' && localStorage.getItem(CREATOR_KEY)) || '' } catch (err) { return '' }
}

export function defaultCreator () {
  return (session.projectMeta && session.projectMeta.creator) ||
    (cloudAuth.usage && cloudAuth.usage.displayName) ||
    rememberedCreator()
}

export function setCreator (name) {
  updateProjectMeta({ creator: name })
  try { if (typeof localStorage !== 'undefined' && name) localStorage.setItem(CREATOR_KEY, String(name).trim().slice(0, 40)) } catch (err) { /* private mode */ }
}

/* ── library ──────────────────────────────────────────────────────── */

/** Local and cloud rows merged into one list: a project saved here and uploaded shows
 * once, with where it lives and which copy is newer. */
export function mergeLibrary (localRows, cloudRows) {
  const items = []
  const usedCloud = new Set()
  for (const row of localRows || []) {
    const cloud = (cloudRows || []).find((c) => (row.cloudId && c.cloudId === row.cloudId) || (c.localId && c.localId === row.id))
    if (cloud) usedCloud.add(cloud.cloudId)
    items.push({
      key: 'l:' + row.id,
      id: row.id,
      cloudId: cloud ? cloud.cloudId : '',
      name: row.name || 'Untitled',
      updatedAt: Math.max(row.updatedAt || 0, cloud ? cloud.updatedAt : 0),
      localUpdatedAt: row.updatedAt || 0,
      cloudUpdatedAt: cloud ? cloud.updatedAt : 0,
      sizeBytes: cloud ? cloud.sizeBytes : 0,
      where: cloud ? 'both' : 'local',
      sync: cloud ? compareCopies(row.updatedAt, cloud.updatedAt) : '',
      description: (row.meta && row.meta.description) || '',
      published: !!(row.meta && row.meta.publishedId)
    })
  }
  for (const cloud of cloudRows || []) {
    if (usedCloud.has(cloud.cloudId)) continue
    items.push({
      key: 'c:' + cloud.cloudId,
      id: '',
      cloudId: cloud.cloudId,
      name: cloud.name || 'Untitled',
      updatedAt: cloud.updatedAt || 0,
      localUpdatedAt: 0,
      cloudUpdatedAt: cloud.updatedAt || 0,
      sizeBytes: cloud.sizeBytes || 0,
      where: 'cloud',
      sync: '',
      description: '',
      published: false
    })
  }
  return items
}

export function filterLibrary (items, { search, sort, filter }) {
  const needle = String(search || '').trim().toLowerCase()
  let list = items.filter((item) => {
    if (filter === 'device' && item.where === 'cloud') return false
    if (filter === 'cloud' && item.where === 'local') return false
    if (!needle) return true
    return item.name.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle)
  })
  list = list.slice().sort(sort === 'name'
    ? (a, b) => a.name.localeCompare(b.name)
    : (a, b) => b.updatedAt - a.updatedAt)
  return list
}

export async function refreshLibrary () {
  const [local, autosaves, guest] = await Promise.all([
    listStoredProjects(),
    listStoredAutosaves(),
    listGuestProjects()
  ])
  hub.local = local
  hub.autosaves = autosaves
  hub.guest = guest
  hub.cloudError = ''
  if (cloudAuth.user) {
    try {
      hub.cloud = await listCloudProjects()
    } catch (err) {
      hub.cloud = []
      hub.cloudError = cloudErrorMessage(err)
    }
  } else {
    hub.cloud = []
  }
}

async function replaceOpenProject (task) {
  if (await keepUnsavedInRecovery()) showToast('Unsaved changes kept in Recovery')
  const ok = await task()
  if (ok !== false) closeHub()
  return ok
}

export function openLibraryItem (item) {
  return run('open', () => replaceOpenProject(async () => {
    if (item.id) {
      await openStoredProject(item.id)
      if (item.cloudId) session.cloudId = item.cloudId
      return true
    }
    try {
      const data = await downloadProject(item.cloudId)
      await importProjectJson(data)
      session.cloudId = item.cloudId
      return true
    } catch (err) {
      showToast(cloudErrorMessage(err, 'Download failed'))
      return false
    }
  }))
}

export async function renameLibraryItem (item, name) {
  const next = String(name || '').trim().slice(0, 80)
  if (!next || next === item.name) return
  await run('rename', async () => {
    try {
      if (item.id) await renameStoredProject(item.id, next)
      if (item.cloudId && cloudAuth.user) await renameCloudProject(item.cloudId, next)
      if ((item.id && item.id === session.projectId) || (!item.id && item.cloudId === session.cloudId)) setProjectName(next)
    } catch (err) {
      showToast(cloudErrorMessage(err, 'Rename failed'))
    }
    await refreshLibrary()
  })
}

export async function duplicateLibraryItem (item) {
  if (!item.id) return
  await run('duplicate', async () => {
    await duplicateStoredProject(item.id)
    await refreshLibrary()
    showToast('Copy saved')
  })
}

export async function deleteLibraryItem (item, scope) {
  const label = '“' + item.name + '”'
  const fromCloud = scope === 'cloud' || (scope !== 'device' && item.where === 'cloud')
  const message = fromCloud
    ? 'Delete the cloud copy of ' + label + '? Other devices will lose it.'
    : 'Delete ' + label + ' from this device?' + (item.cloudId ? ' The cloud copy stays.' : '')
  if (!confirmAction(message)) return
  await run('delete', async () => {
    try {
      if (fromCloud) {
        await deleteCloudProject(item.cloudId)
        if (session.cloudId === item.cloudId) session.cloudId = ''
        await refreshCloudAuth()
      } else {
        await deleteStoredProject(item.id)
      }
    } catch (err) {
      showToast(cloudErrorMessage(err, 'Delete failed'))
    }
    await refreshLibrary()
  })
}

/** Upload a stored project (not necessarily the open one) to the account. */
export async function uploadLibraryItem (item) {
  if (!item.id || !cloudAuth.user) return
  await run('upload', async () => {
    try {
      const row = hub.local.find((r) => r.id === item.id)
      if (!row) return
      const { project } = await packProjectAssets(row, getAsset)
      const bytes = new Blob([JSON.stringify(project)]).size
      if (!fitsQuota(cloudAuth.usage, bytes)) throw new Error('QUOTA_EXCEEDED')
      const result = await uploadProject(project, { name: row.name, localId: row.id, cloudId: item.cloudId || row.cloudId })
      if (row.id === session.projectId) session.cloudId = result.cloudId
      await refreshCloudAuth()
      showToast('Uploaded to cloud')
    } catch (err) {
      showToast(cloudErrorMessage(err, 'Upload failed'))
    }
    await refreshLibrary()
  })
}

export async function adoptGuest (row) {
  await run('adopt', async () => {
    const moved = await adoptGuestProject(row.id)
    showToast(moved ? 'Moved to your account' : 'Could not move the project')
    await refreshLibrary()
  })
}

export async function adoptAllGuests () {
  await run('adopt', async () => {
    let count = 0
    for (const row of hub.guest) {
      if (await adoptGuestProject(row.id)) count++
    }
    showToast(count === 1 ? 'Moved 1 project to your account' : 'Moved ' + count + ' projects to your account')
    await refreshLibrary()
  })
}

/* ── this project ─────────────────────────────────────────────────── */

export function saveNow () {
  return run('save', async () => {
    const saved = await saveCurrentProject()
    await refreshLibrary()
    return saved
  })
}

export function saveCopy (name) {
  return run('save', async () => {
    const saved = await saveProjectAs(name)
    await refreshLibrary()
    return saved
  })
}

/** Save locally, then push the same project (with its audio) to the account. */
export function syncCurrentToCloud () {
  if (!cloudAuth.user) {
    hub.section = 'account'
    return null
  }
  return run('upload', async () => {
    try {
      await saveCurrentProject({ quiet: true })
      const { project, missing } = await buildPortableProject()
      const bytes = new Blob([JSON.stringify(project)]).size
      if (!fitsQuota(cloudAuth.usage, bytes)) throw new Error('QUOTA_EXCEEDED')
      const result = await uploadProject(project, { name: session.projectName, localId: session.projectId, cloudId: session.cloudId })
      session.cloudId = result.cloudId
      await saveCurrentProject({ quiet: true })
      await refreshCloudAuth()
      showToast(missing.length ? 'Uploaded (some audio could not be found)' : 'Saved to cloud')
    } catch (err) {
      showToast(cloudErrorMessage(err, 'Upload failed'))
    }
    await refreshLibrary()
  })
}

export function startNewProject () {
  return run('new', () => replaceOpenProject(async () => {
    newProject()
    const creator = defaultCreator()
    if (creator) updateProjectMeta({ creator })
    await addTrack('midi')
    session.unsaved = false
    return true
  }))
}

export function openExample () {
  return run('example', () => replaceOpenProject(async () => {
    await loadDemoProject()
    return true
  }))
}

export function openProjectFile () {
  if (typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.dawweb,.json,application/json'
  input.onchange = async () => {
    const file = input.files && input.files[0]
    if (!file) return
    await run('open', () => replaceOpenProject(async () => importProjectJson(await file.text())))
  }
  input.click()
}

export function openRecovery (row) {
  return run('open', () => replaceOpenProject(() => openAutosaveProject(row.id)))
}

export async function deleteRecovery (row) {
  if (!confirmAction('Delete this autosave?')) return
  await deleteStoredProject(row.id)
  await refreshLibrary()
}

/* ── publishing ───────────────────────────────────────────────────── */

export function publishState () {
  const meta = session.projectMeta || {}
  return {
    published: !!meta.publishedId,
    id: meta.publishedId || '',
    at: meta.publishedAt || 0,
    link: meta.publishedId ? publicLink(meta.publishedId) : ''
  }
}

function publishMeta () {
  const meta = session.projectMeta || {}
  return {
    title: session.projectName,
    description: meta.description || '',
    creator: meta.creator || defaultCreator(),
    tags: meta.tags || []
  }
}

/** Validate before any network work so the card can show the problem inline. */
export function publishProblem () {
  return validatePublish(publishMeta(), 0)
}

async function publicFile () {
  const { project, skipped, missing } = await buildPortableProject({ maxBytes: PUBLISH_LIMITS.maxBytes - 512 * 1024 })
  if (skipped.length) throw new Error('Audio in this project is over the 10 MB publishing limit. Remove long audio clips and try again.')
  const clean = { ...project, id: '', cloudId: '' }
  clean.meta = { ...(clean.meta || {}), publishedId: '', publishedAt: 0 }
  const bytes = new Blob([JSON.stringify(clean)]).size
  return { project: clean, bytes, missing }
}

export function publishCurrent () {
  return run('publish', async () => {
    hub.publishError = ''
    const meta = publishMeta()
    try {
      const problem = validatePublish(meta, 0)
      if (problem) throw new Error(problem)
      if (meta.creator !== (session.projectMeta && session.projectMeta.creator)) setCreator(meta.creator)
      const { project, bytes } = await publicFile()
      const tooBig = validatePublish(meta, bytes)
      if (tooBig) throw new Error(tooBig)
      const state = publishState()
      const result = state.published
        ? await updatePublished(state.id, project, meta)
        : await publishProject(project, meta)
      updateProjectMeta({ publishedId: result.id, publishedAt: result.publishedAt })
      await saveCurrentProject({ quiet: true })
      showToast(state.published ? 'Public copy updated' : 'Published to Discover')
      return result
    } catch (err) {
      const message = err.message || 'Publishing failed'
      if (/no longer exists/i.test(message)) updateProjectMeta({ publishedId: '', publishedAt: 0 })
      hub.publishError = message
      return null
    }
  })
}

export function unpublishCurrent () {
  const state = publishState()
  if (!state.published) return null
  if (!confirmAction('Remove this project from Discover? The link will stop working.')) return null
  return run('publish', async () => {
    hub.publishError = ''
    try {
      await unpublishProject(state.id)
    } catch (err) {
      if (!/no longer exists/i.test(err.message || '')) {
        hub.publishError = err.message || 'Could not unpublish'
        return
      }
    }
    updateProjectMeta({ publishedId: '', publishedAt: 0 })
    await saveCurrentProject({ quiet: true })
    showToast('Removed from Discover')
  })
}

export async function copyText (text, done = 'Link copied') {
  try {
    await navigator.clipboard.writeText(text)
    showToast(done)
  } catch (err) {
    if (typeof window !== 'undefined') window.prompt('Copy this link', text)
  }
}

/* ── discover ─────────────────────────────────────────────────────── */

const PAGE = 24

export async function loadDiscover (more = false) {
  hub.discoverLoading = true
  hub.discoverError = ''
  try {
    const rows = await listPublic({
      search: hub.discoverSearch,
      sort: hub.discoverSort,
      limit: PAGE,
      offset: more ? hub.discover.length : 0
    })
    hub.discover = more ? hub.discover.concat(rows) : rows
    hub.discoverMore = rows.length === PAGE
  } catch (err) {
    if (!more) hub.discover = []
    hub.discoverError = err.message || 'Could not load the gallery'
  } finally {
    hub.discoverLoading = false
  }
}

export function canManagePublic (row) {
  return canManage(row, cloudAuth.user && cloudAuth.user.id)
}

export function openPublic (row) {
  return run('open', () => replaceOpenProject(async () => {
    try {
      const project = await fetchPublicProject(row)
      const ok = await importProjectJson(project, { asCopy: true, quiet: true })
      if (ok) {
        const creator = defaultCreator()
        updateProjectMeta({ creator: creator || '' })
        showToast('Opened a copy of “' + row.title + '”')
      }
      return ok
    } catch (err) {
      showToast(err.message || 'Could not open the project')
      return false
    }
  }))
}

export async function reportDetail (row) {
  const reason = typeof window !== 'undefined' ? window.prompt('What is wrong with this project?', '') : ''
  if (reason == null) return
  try {
    await reportPublic(row.id, reason)
    showToast('Thanks. The project will be reviewed.')
  } catch (err) {
    showToast(err.message || 'Could not send the report')
  }
}

export async function unpublishDetail (row) {
  if (!confirmAction('Remove “' + row.title + '” from Discover?')) return
  try {
    await unpublishProject(row.id)
    if (session.projectMeta && session.projectMeta.publishedId === row.id) {
      updateProjectMeta({ publishedId: '', publishedAt: 0 })
    }
    hub.detail = null
    hub.discover = hub.discover.filter((item) => item.id !== row.id)
    showToast('Removed from Discover')
  } catch (err) {
    showToast(err.message || 'Could not unpublish')
  }
}

/** `?p=<id>` links open the hub on that project's page. */
export async function openSharedLinkFromUrl () {
  if (typeof location === 'undefined') return false
  const id = new URLSearchParams(location.search).get('p')
  if (!id || !/^[0-9a-f-]{16,64}$/i.test(id)) return false
  openHub('discover')
  try {
    const row = await fetchPublicRow(id)
    if (row) hub.detail = row
    else showToast('This published project is no longer available.')
  } catch (err) {
    showToast('Could not reach the gallery. Try again later.')
  }
  return true
}
