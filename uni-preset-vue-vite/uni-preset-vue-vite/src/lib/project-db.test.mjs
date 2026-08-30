import { resetMemoryDb, putProject, getProject, listProjects, deleteProject, duplicateProject, renameProject, rememberRecent, readRecent, putAsset, getAsset, hashBlob } from './project-db.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

resetMemoryDb()

{
  const saved = await putProject({ id: 'a', name: 'Alpha', tempo: 120, tracks: [] })
  assert(saved.updatedAt > 0, 'put stamps updatedAt')
  const loaded = await getProject('a')
  assert(loaded && loaded.name === 'Alpha', 'get returns the stored project')
  await putProject({ id: 'b', name: 'Beta', tempo: 100, tracks: [] })
  const list = await listProjects()
  assert(list.length === 2 && list[0].updatedAt >= list[1].updatedAt, 'list is newest first')
}

{
  const copy = await duplicateProject('a', 'Alpha copy')
  assert(copy && copy.id !== 'a' && copy.name === 'Alpha copy', 'duplicate creates a new id')
  const renamed = await renameProject(copy.id, 'Renamed')
  assert(renamed.name === 'Renamed', 'rename updates the stored name')
  await deleteProject(copy.id)
  assert(!(await getProject(copy.id)), 'delete removes the project')
}

{
  const blob = new Uint8Array([1, 2, 3, 4]).buffer
  const hash = await hashBlob(blob)
  assert(typeof hash === 'string' && hash.length > 4, 'hashBlob returns a digest')
  await putAsset(hash, { size: 4, arrayBuffer: async () => blob }, { name: 'click.wav', bytes: 4 })
  const asset = await getAsset(hash)
  assert(asset && asset.name === 'click.wav', 'assets round-trip')
}

{
  const recent = rememberRecent({ id: 'a', name: 'Alpha', at: 1 })
  rememberRecent({ id: 'b', name: 'Beta', at: 2 })
  const list = readRecent()
  assert(list[0].id === 'b' && list.some((item) => item.id === 'a'), 'recent list is openable by id')
  assert(recent.length >= 1, 'rememberRecent returns the list')
}

console.log('project-db ok')
