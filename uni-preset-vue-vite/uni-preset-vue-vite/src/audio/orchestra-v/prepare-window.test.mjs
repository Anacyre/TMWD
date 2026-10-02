import assert from 'node:assert/strict'
import {
  PREPARE_WINDOW_BEATS,
  PREPARE_ZONE_CAP,
  noteInPrepareWindow,
  selectPrepareZones
} from './prepare-window.js'

const notes = [
  { start: 0, sample: 'a' },
  { start: 1, sample: 'b' },
  { start: 2, sample: 'a' },
  { start: 3.5, sample: 'c' },
  { start: 5, sample: 'd' },
  { start: 12, sample: 'e' }
]

const windowZones = []
const later = []
for (const note of notes) {
  const item = { library: 'sym', sample: note.sample }
  if (noteInPrepareWindow(note.start, 0, PREPARE_WINDOW_BEATS)) windowZones.push(item)
  else later.push(item)
}

const split = selectPrepareZones(windowZones, PREPARE_ZONE_CAP)
assert.deepEqual(split.immediate.map((zone) => zone.sample), ['a', 'b', 'c'])
assert.deepEqual(split.warm, [])
assert.deepEqual(later.map((zone) => zone.sample), ['d', 'e'])

const many = Array.from({ length: 8 }, (_, index) => ({ library: 'sym', sample: 'z' + index }))
const capped = selectPrepareZones(many)
assert.equal(capped.immediate.length, 6)
assert.equal(capped.warm.length, 2)
assert.equal(capped.immediate[0].sample, 'z0')
assert.equal(capped.warm[0].sample, 'z6')
assert.equal(capped.warm[1].sample, 'z7')

const duped = selectPrepareZones([
  { library: 'sym', sample: 'a' },
  { library: 'sym', sample: 'a' },
  { library: 'other', sample: 'a' }
])
assert.equal(duped.immediate.length, 2)

console.log('prepare-window ok')
