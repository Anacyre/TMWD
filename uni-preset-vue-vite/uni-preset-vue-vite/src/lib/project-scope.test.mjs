import {
  resetMemoryDb,
  putProject,
  putAutosave,
  getProject,
  listProjects,
  listAutosaves,
  deleteProject,
  duplicateProject,
  moveProjectToOwner,
  rememberRecent,
  readRecent,
  setLibraryOwner,
  getLibraryOwner,
  GUEST_OWNER,
  FALLBACK_KEYS
} from './project-db.js'
import { migrateProject, normalizeProjectMeta, META_LIMITS } from './project-io.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

resetMemoryDb()
setLibraryOwner('')
assert(getLibraryOwner() === GUEST_OWNER, 'an empty owner is the guest')

{
  await putProject({ id: 'g1', name: 'Guest song', tracks: [] })
  await putAutosave({ id: 'g1', name: 'Guest song', tracks: [] })
  rememberRecent({ id: 'g1', name: 'Guest song', at: 1 })
  const guestKey = FALLBACK_KEYS.LS_AUTOSAVE

  setLibraryOwner('user-a')
  assert(FALLBACK_KEYS.LS_AUTOSAVE !== guestKey, 'fallback keys are scoped per owner')
  assert(!(await getProject('g1')), 'an account cannot read guest projects')
  assert((await listProjects()).length === 0, 'an account starts with its own empty library')
  assert((await listAutosaves()).length === 0, 'guest autosaves stay out of the account')
  assert(readRecent().length === 0, 'recent list is per owner')

  await deleteProject('g1')
  await putProject({ id: 'g1', name: 'Account save with a stale id', tracks: [] })
  const accountRows = await listProjects()
  assert(accountRows.length === 1 && accountRows[0].id !== 'g1', 'saving over another owner\'s id forks a new id')

  setLibraryOwner(GUEST_OWNER)
  const guest = await getProject('g1')
  assert(guest && guest.name === 'Guest song', 'the guest copy survives account writes and deletes')
  assert((await listProjects()).length === 1, 'the guest library only sees its own rows')
  assert(readRecent().some((item) => item.id === 'g1'), 'guest recent list is intact')
}

{
  setLibraryOwner(GUEST_OWNER)
  const copy = await duplicateProject('g1')
  const moved = await moveProjectToOwner(copy.id, 'user-a')
  assert(moved && moved.owner === 'user-a', 'move hands the project to the account')
  assert(!(await getProject(copy.id)), 'a moved project leaves the guest library')
  setLibraryOwner('user-a')
  assert(!!(await getProject(copy.id)), 'the account can open the moved project')
  setLibraryOwner('user-b')
  assert(!(await getProject(copy.id)), 'another account cannot see it')
  setLibraryOwner(GUEST_OWNER)
}

{
  const meta = normalizeProjectMeta({ description: '  hi  ', creator: '  Ann   Lee ', tags: 'Lo-Fi, lo-fi, ambient,,' }, 'Song')
  assert(meta.title === 'Song' && meta.description === 'hi' && meta.creator === 'Ann Lee', 'meta trims text')
  assert(meta.tags.length === 2 && meta.tags[0] === 'lo-fi', 'tags are deduplicated and lowercased')
  const long = normalizeProjectMeta({ description: 'x'.repeat(5000) }, 'y'.repeat(200))
  assert(long.description.length === META_LIMITS.description && long.title.length === META_LIMITS.title, 'meta is length-limited')
  const migrated = migrateProject({ schemaVersion: 6, name: 'Kept', meta: { description: 'about', publishedId: 'pub1' }, tracks: [], clips: [] })
  assert(migrated.schemaVersion === 6, 'meta does not bump the schema the native engine reads')
  assert(migrated.meta.description === 'about' && migrated.meta.publishedId === 'pub1' && migrated.meta.title === 'Kept', 'migrate keeps meta')
  const old = migrateProject({ schemaVersion: 3, name: 'Old', tracks: [], clips: [] })
  assert(old.meta && old.meta.title === 'Old' && old.meta.description === '', 'old projects get empty meta')
}

{
  setLibraryOwner(GUEST_OWNER)
  const copy = await duplicateProject('g1')
  assert(copy.cloudId === '', 'a duplicate is never linked to the original cloud copy')
}

console.log('project-scope ok')
