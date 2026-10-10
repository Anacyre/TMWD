import assert from 'node:assert/strict'
import {
  PREPARE_WINDOW_BEATS,
  SAMPLE_DEADLINE_MS,
  noteInPrepareWindow,
  selectPrepareZones,
  gatePlayhead
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

const split = selectPrepareZones(windowZones)
assert.deepEqual(split.immediate.map((zone) => zone.sample), ['a', 'b', 'c', 'd', 'e'])
assert.deepEqual(split.warm, [])
assert.deepEqual(later, [])

const many = Array.from({ length: 8 }, (_, index) => ({ library: 'sym', sample: 'z' + index }))
const capped = selectPrepareZones(many)
assert.equal(capped.immediate.length, 8, 'a chord is not trimmed to a handful of zones')
assert.equal(capped.warm.length, 0)

const duped = selectPrepareZones([
  { library: 'sym', sample: 'a' },
  { library: 'sym', sample: 'a' },
  { library: 'other', sample: 'a' }
])
assert.equal(duped.immediate.length, 2)

assert.equal(SAMPLE_DEADLINE_MS, 8000, 'a single fetch still has time to finish')
assert.ok(PREPARE_WINDOW_BEATS >= 16, 'the lead window has to cover a whole chord, not four beats')

assert.equal(gatePlayhead(0, 0.2, []), 0.2)
assert.equal(gatePlayhead(3.9, 4.1, [4]), 4, 'stop on the chord instead of playing through it')
assert.equal(gatePlayhead(4, 4.2, [4, 4, 4]), 4, 'hold until every note of the chord is decoded')
assert.equal(gatePlayhead(4, 4.2, []), 4.2)

console.log('prepare-window ok')
