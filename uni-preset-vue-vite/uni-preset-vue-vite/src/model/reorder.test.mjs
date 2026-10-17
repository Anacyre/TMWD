import assert from 'node:assert/strict'
import { reorderTrackList, subtreeIndexes } from './playlist-model.js'

function t (id, extra = {}) {
  return { id, name: 'T' + id, type: 'midi', parentId: 0, collapsed: false, ...extra }
}

const master = { id: 100, name: 'Master', type: 'master', parentId: 0 }

// master, A, G(group), g1, g2, B
const tracks = [master, t(1), t(2, { type: 'group' }), t(3, { parentId: 2 }), t(4, { parentId: 2 }), t(5)]

// subtree of a group includes its children
assert.deepEqual(subtreeIndexes(tracks, 2), [2, 3, 4])
assert.deepEqual(subtreeIndexes(tracks, 5), [5])

// move B above A: lands at index 1, master stays first
{
  const r = reorderTrackList(tracks, 5, 1)
  assert.equal(r.order.map((x) => x.id).join(','), '100,5,1,2,3,4')
  assert.equal(r.indexMap.get(5), 1)
  assert.equal(r.indexMap.get(1), 2)
  assert.equal(r.indexMap.get(0), 0)
  assert.equal(r.order[1].parentId, 0, 'dropped above the first track: not grouped')
}

// move A below the open group header: joins the group
{
  const r = reorderTrackList(tracks, 1, 2)
  assert.equal(r.order.map((x) => x.id).join(','), '100,2,1,3,4,5')
  assert.equal(r.order[2].parentId, 2)
}

// move A below the collapsed group: lands after the hidden children, stays outside
{
  const collapsed = tracks.map((x) => (x.id === 2 ? { ...x, collapsed: true } : x))
  const r = reorderTrackList(collapsed, 1, 2)
  assert.equal(r.order.map((x) => x.id).join(','), '100,2,3,4,1,5')
  assert.equal(r.order[4].parentId, 0)
}

// move the group (with children) below B
{
  const r = reorderTrackList(tracks, 2, 5)
  assert.equal(r.order.map((x) => x.id).join(','), '100,1,5,2,3,4')
  assert.equal(r.indexMap.get(3), 4)
}

// cannot move onto itself or into its own subtree; master never moves
assert.equal(reorderTrackList(tracks, 2, 3), null)
assert.equal(reorderTrackList(tracks, 0, 3), null)
assert.equal(reorderTrackList(tracks, 1, 1), null)

// a child dragged out below B leaves the group
{
  const r = reorderTrackList(tracks, 3, 5)
  assert.equal(r.order.map((x) => x.id).join(','), '100,1,2,4,5,3')
  assert.equal(r.order[5].parentId, 0)
}

console.log('reorder ok')
