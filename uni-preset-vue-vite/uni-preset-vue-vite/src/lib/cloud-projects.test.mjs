import { useCloudClient, fitsQuota, formatBytes, compareCopies, cloudErrorMessage, uploadProject, listCloudProjects } from './cloud-projects.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

assert(fitsQuota({ usedBytes: 100, quotaBytes: 200 }, 50), 'upload that still fits is allowed')
assert(!fitsQuota({ usedBytes: 180, quotaBytes: 200 }, 50), 'upload that would overflow is refused')
assert(formatBytes(2048).includes('KB'), 'bytes format uses KB')
assert(compareCopies(5000, 1000) === 'local-newer', 'local newer when the local stamp is later')
assert(compareCopies(1000, 5000) === 'cloud-newer', 'cloud newer when the cloud stamp is later')
assert(/full/i.test(cloudErrorMessage({ message: 'QUOTA_EXCEEDED' })), 'quota errors become plain English')

const rows = []
const files = new Map()
function tableApi (table) {
  const api = {
    select () { return api },
    eq () { return api },
    order () { return api },
    insert (row) {
      const next = { id: 'c1', storage_path: 'u1/c1.json', updated_at: new Date().toISOString(), ...row }
      rows.push(next)
      return api
    },
    update () { return api },
    delete () { return api },
    maybeSingle: async () => ({ data: table === 'profiles' ? { quota_bytes: 200000000, used_bytes: 0, display_name: 'A' } : null, error: null }),
    single: async () => ({ data: rows[rows.length - 1], error: null }),
    then (resolve, reject) {
      return Promise.resolve({ data: rows.slice(), error: null }).then(resolve, reject)
    }
  }
  return api
}
useCloudClient({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } }, error: null })
  },
  from: (table) => tableApi(table),
  storage: {
    from () {
      return {
        upload: async (path, file) => { files.set(path, file); return { error: null } },
        download: async (path) => ({ data: files.get(path), error: null }),
        remove: async () => ({ error: null })
      }
    }
  }
})

const listed = await listCloudProjects()
assert(Array.isArray(listed), 'list returns an array when signed in')
const put = await uploadProject({ name: 'Song', schemaVersion: 6, id: 'local1' }, { name: 'Song' })
assert(put.cloudId === 'c1', 'upload creates a cloud id')
assert(files.size === 1, 'the JSON file lands in storage')

console.log('cloud-projects ok')
