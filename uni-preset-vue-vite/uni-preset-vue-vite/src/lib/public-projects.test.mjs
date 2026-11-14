import {
  validatePublish,
  projectSummary,
  searchPattern,
  coverHue,
  formatDuration,
  usePublicClient,
  publishProject,
  listPublic,
  canManage,
  editTokenFor,
  PUBLISH_LIMITS
} from './public-projects.js'
import { packProjectAssets, unpackProjectAssets, stripPackedAssets } from './project-assets.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
}

{
  const ok = { title: 'Night drive', creator: 'Ann', description: '' }
  assert(validatePublish(ok, 1000) === '', 'valid details pass')
  assert(/title/.test(validatePublish({ ...ok, title: 'ab' }, 10)), 'short titles fail')
  assert(/creator/i.test(validatePublish({ ...ok, creator: '' }, 10)), 'a creator name is required')
  assert(/10 MB/.test(validatePublish(ok, PUBLISH_LIMITS.maxBytes + 1)), 'oversized files fail')
  assert(/1000/.test(validatePublish({ ...ok, description: 'x'.repeat(1001) }, 10)), 'long descriptions fail')
}

{
  const project = {
    tempo: 120,
    tracks: [{ type: 'master' }, { type: 'midi' }, { type: 'audio' }],
    clips: [
      { startBeat: 0, lengthBeats: 8, notes: [{ pitch: 60, start: 0, duration: 1 }, { pitch: 72, start: 4, duration: 2 }] },
      { startBeat: 8, lengthBeats: 8, notes: [] }
    ]
  }
  const summary = projectSummary(project)
  assert(summary.trackCount === 2, 'master is not counted')
  assert(summary.durationSec === 8, 'duration follows the last clip end (16 beats at 120 bpm)')
  assert(summary.preview.length === 2, 'preview has one bar per note')
  assert(summary.preview.every((item) => item.every((n) => n >= 0 && n <= 1)), 'preview is normalised')
  assert(summary.preview[1][1] < summary.preview[0][1], 'higher notes sit higher')
  const big = { tempo: 100, tracks: [], clips: [{ startBeat: 0, lengthBeats: 400, notes: Array.from({ length: 1000 }, (_, i) => ({ pitch: 40 + (i % 40), start: i * 0.4, duration: 0.2 })) }] }
  assert(projectSummary(big).preview.length <= 96, 'preview is capped')
}

{
  assert(searchPattern('50%_off, (x)') === '%50\\%\\_off   x %', 'search escapes wildcards and filter separators')
  assert(searchPattern('   ') === '', 'blank search adds no filter')
  assert(coverHue('a') === coverHue('a') && coverHue('a') !== coverHue('b'), 'cover hue is stable')
  assert(formatDuration(75) === '1:15', 'durations read m:ss')
}

{
  const calls = []
  const fake = {
    functions: {
      invoke: async (name, { body }) => {
        calls.push({ name, body })
        return { data: { id: 'pub-1', createdAt: '2026-11-14T00:00:00Z', editToken: 'secret' }, error: null }
      }
    },
    from () {
      const query = {
        filters: [],
        select () { return query },
        or (value) { query.filters.push(['or', value]); return query },
        eq (key, value) { query.filters.push(['eq', key, value]); return query },
        order () { return query },
        range: async () => ({ data: [{ id: 'pub-1', title: 'T', creator_name: 'C', tags: null, created_at: '2026-11-14T00:00:00Z' }], error: null })
      }
      fake.lastQuery = query
      return query
    }
  }
  usePublicClient(fake)
  const result = await publishProject({ tempo: 90, tracks: [], clips: [] }, { title: 'Song', creator: 'Me', tags: ['a'] })
  assert(result.id === 'pub-1' && calls[0].name === 'publish-project', 'publish calls the edge function')
  assert(calls[0].body.action === 'publish' && calls[0].body.deviceId, 'guests send a device id')
  assert(editTokenFor('pub-1') === 'secret', 'the guest edit token is kept on this device')
  assert(canManage({ id: 'pub-1', owner: '' }, '') === true, 'the publishing device can manage its guest project')
  assert(canManage({ id: 'pub-1', owner: 'u1' }, 'u2') === false, 'other accounts cannot manage')
  const rows = await listPublic({ search: 'lo-fi' })
  assert(rows.length === 1 && Array.isArray(rows[0].tags), 'gallery rows are normalised')
  assert(fake.lastQuery.filters.some((f) => f[0] === 'or' && f[1].includes('title.ilike.%lo-fi%')), 'search filters title, creator and description')
  usePublicClient(null)
}

{
  const assets = new Map([['h1', { name: 'kick.wav', blob: new Uint8Array([1, 2, 3, 250]) }]])
  const project = { tracks: [{ id: 1, webSampler: { assetHash: 'h1' } }], clips: [{ id: 2, sourceId: 'h1' }, { id: 3, sourceId: 'gone' }] }
  const packed = await packProjectAssets(project, async (hash) => assets.get(hash) || null)
  assert(Object.keys(packed.project.assets).length === 1, 'shared hashes are packed once')
  assert(packed.missing.includes('gone'), 'missing assets are reported')
  const restored = new Map()
  const count = await unpackProjectAssets(packed.project, async (hash, blob) => restored.set(hash, blob))
  assert(count === 1 && Array.from(restored.get('h1')).join(',') === '1,2,3,250', 'assets round-trip byte for byte')
  assert(!stripPackedAssets(packed.project).assets, 'strip removes the inline assets')
  const capped = await packProjectAssets(project, async (hash) => assets.get(hash) || null, { maxBytes: 2 })
  assert(capped.skipped.length === 1 && !capped.project.assets, 'assets over the cap are skipped')
}

console.log('public-projects ok')
