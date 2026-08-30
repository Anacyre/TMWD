import {
  emptyExpression,
  ensureExpression,
  addLanePoint,
  moveLanePoint,
  deleteLanePoint,
  hitLanePoint,
  addSustainBlock,
  sampleSustain,
  sampleLane,
  laneKey
} from './expression-lane.js'
import { PPQ } from './note-model.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

{
  const expr = emptyExpression()
  assert(Array.isArray(expr.cc64), 'empty expression includes sustain blocks')
  const clip = {}
  ensureExpression(clip)
  assert(clip.expression.cc64.length === 0, 'ensureExpression creates cc64')
}

{
  assert(laneKey(11) === 'cc11', 'expression lane')
  assert(laneKey(64) === 'cc64', 'sustain lane')
  let pts = addLanePoint([], 1, 90)
  pts = addLanePoint(pts, 2, 40)
  assert(pts.length === 2 && pts[0].v === 90, 'add point')
  pts = moveLanePoint(pts, 0, 1.5, 100)
  assert(pts[0].t === 1.5 && pts[0].v === 100, 'move point')
  const hit = hitLanePoint(pts, 1.5, 100)
  assert(hit === 0, 'hit finds the point')
  pts = deleteLanePoint(pts, 0)
  assert(pts.length === 1, 'delete point')
  assert(sampleLane(pts, 0) === 40, 'sample holds the remaining value')
}

{
  let blocks = addSustainBlock([], 0, PPQ)
  blocks = addSustainBlock(blocks, PPQ * 2, PPQ * 3)
  assert(sampleSustain(blocks, 0.5) === 127, 'sustain is down inside a block')
  assert(sampleSustain(blocks, 1.5) === 0, 'sustain is up between blocks')
}

console.log('expression-lane ok')
